import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import Peer from 'simple-peer';
import config from '../config';

const VideoRoom = ({ roomId, username, onLeave }) => {
  const [peers, setPeers] = useState([]);
  const socketRef = useRef();
  const userVideo = useRef();
  const peersRef = useRef([]);
  const userStream = useRef();
  const userIdRef = useRef('');

  useEffect(() => {
    socketRef.current = io(config.SOCKET_URL, {
      query: { roomId, username },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        userStream.current = stream;
        if (userVideo.current) {
          userVideo.current.srcObject = stream;
        }

        socketRef.current.on('connect', () => {
          userIdRef.current = socketRef.current.id;
          setTimeout(() => {
            socketRef.current.emit('join-room', roomId, socketRef.current.id, username);
          }, 500);
        });

        socketRef.current.on('user-connected', userId => {
          setTimeout(() => {
            connectToNewUser(userId, stream);
          }, 1000);
        });

        socketRef.current.on('receive-call', ({ from, signal }) => {
          answerCall(from, signal, stream);
        });

        socketRef.current.on('call-accepted', ({ from, signal }) => {
          const peerObj = peersRef.current.find(p => p.peerID === from);
          if (peerObj) {
            peerObj.peer.signal(signal);
          }
        });

        socketRef.current.on('user-disconnected', userId => {
          const peerObj = peersRef.current.find(p => p.peerID === userId);
          if (peerObj) {
            peerObj.peer.destroy();
          }
          const remainingPeers = peersRef.current.filter(p => p.peerID !== userId);
          peersRef.current = remainingPeers;
          setPeers(remainingPeers);
        });
      })
      .catch(error => {
        alert('Could not access camera or microphone.');
      });

    return () => {
      if (userStream.current) {
        userStream.current.getTracks().forEach(track => track.stop());
      }
      peersRef.current.forEach(peerObj => {
        if (peerObj.peer) {
          peerObj.peer.destroy();
        }
      });
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [roomId, username]);

  const connectToNewUser = (userId, stream) => {
    if (userId === socketRef.current.id) return;
    if (peersRef.current.find(p => p.peerID === userId)) return;

    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream: stream,
      config: {
        iceServers: config.ICE_SERVERS
      }
    });

    peer.on('signal', signal => {
      socketRef.current.emit('send-call', { to: userId, from: socketRef.current.id, signal });
    });

    peer.on('stream', remoteStream => {
      console.log('Received stream from new user:', userId, remoteStream);
    });

    peer.on('error', err => console.error('Peer connection error:', err));

    const peerObj = { peerID: userId, peer };
    peersRef.current.push(peerObj);
    setPeers(prevPeers => [...prevPeers, peerObj]);
  };

  const answerCall = (from, incomingSignal, stream) => {
    if (from === socketRef.current.id) return;
    if (peersRef.current.find(p => p.peerID === from)) return;

    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream: stream,
      config: {
        iceServers: config.ICE_SERVERS
      }
    });

    peer.on('signal', signal => {
      socketRef.current.emit('accept-call', { to: from, signal });
    });

    peer.on('stream', remoteStream => {
      console.log('Received stream from caller:', from, remoteStream);
    });

    peer.on('error', err => console.error('Peer connection error:', err));

    peer.signal(incomingSignal);

    const peerObj = { peerID: from, peer };
    peersRef.current.push(peerObj);
    setPeers(prevPeers => [...prevPeers, peerObj]);
  };

  return (
    <div className="video-room">
      <div className="video-grid">
        <div className="video-container local-view">
          <video ref={userVideo} autoPlay muted playsInline />
          <div className="video-username">{username} (You)</div>
        </div>
        {peers.map((peerObj) => (
          <Video key={peerObj.peerID} peer={peerObj.peer} peerId={peerObj.peerID} username={username} />
        ))}
        {peers.length === 0 && (
          <div className="waiting-message">
            <div className="loading-spinner"></div>
            <p>Waiting for others to join...</p>
            <p>Share the meeting link to invite others</p>
          </div>
        )}
      </div>
    </div>
  );
};

function Video({ peer, peerId, username }) {
  const ref = useRef();

  useEffect(() => {
    if (!peer) return;

    peer.on('stream', stream => {
      console.log('Stream received in Video component for peer:', peerId, 'by', username, ':', stream);
      if (ref.current) {
        ref.current.srcObject = stream;
      }
    });

    if (peer._remoteStreams && peer._remoteStreams.length > 0) {
      console.log('Remote stream already present in _remoteStreams for peer:', peerId, 'by', username, ':', peer._remoteStreams[0]);
      ref.current.srcObject = peer._remoteStreams[0];
    }

    return () => {
      if (ref.current && ref.current.srcObject) {
        const tracks = ref.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, [peer, peerId, username]);

  return (
    <div className="video-container remote-view">
      <video ref={ref} autoPlay playsInline />
      <div className="video-username">Remote User ({peerId})</div>
    </div>
  );
}

export default VideoRoom;