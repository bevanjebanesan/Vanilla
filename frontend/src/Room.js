// client/src/Room.js
import React, { useEffect, useRef, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';

const socket = io('http://localhost:5000');

const Room = () => {
  const { roomId } = useParams();
  const { state } = useLocation();
  const name = state?.name || 'Anonymous';

  const [peers, setPeers] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [captions, setCaptions] = useState({});
  const userVideo = useRef();
  const peersRef = useRef([]);
  const chatEndRef = useRef(null);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
      userVideo.current.srcObject = stream;

      socket.emit('join-meeting', { meetingId: roomId, userId: name });

      socket.on('all-users', (users) => {
        const peers = [];
        users.forEach(({ socketId, userId }) => {
          const peer = createPeer(socketId, socket.id, stream);
          peersRef.current.push({ peerID: socketId, peer, userId });
          peers.push({ peerID: socketId, peer, userId });
        });
        setPeers(peers);
      });
      
      socket.on('user-joined', ({ signal, socketId, userId }) => {
        const peer = addPeer(signal, socketId, stream);
        peersRef.current.push({ peerID: socketId, peer, userId });
        setPeers((users) => [...users, { peerID: socketId, peer, userId }]);
      });
      

      socket.on('signal', ({ socketId, signal }) => {
        const item = peersRef.current.find((p) => p.peerID === socketId);
        if (item) {
          item.peer.signal(signal);
        }
      });

      socket.on('user-left', (id) => {
        setPeers((prev) => prev.filter((p) => p.peerID !== id));
        peersRef.current = peersRef.current.filter((p) => p.peerID !== id);
      });

      socket.on('chat-message', ({ message, name }) => {
        setChatMessages((prev) => [...prev, { message, name }]);
      });

      socket.on('caption', ({ text, from }) => {
        setCaptions((prev) => ({ ...prev, [from]: text }));
      });
    });
  }, []);

  const createPeer = (userToSignal, callerID, stream) => {
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream,
    });

    peer.on('signal', (signal) => {
      socket.emit('sending-signal', { userToSignal, callerID, signal });
    });

    return peer;
  };

  const addPeer = (incomingSignal, callerID, stream) => {
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream,
    });

    peer.on('signal', (signal) => {
      socket.emit('returning-signal', { signal, callerID });
    });

    peer.signal(incomingSignal);

    return peer;
  };

  const sendMessage = () => {
    if (message.trim() !== '') {
      socket.emit('chat-message', { meetingId: roomId, message, name });
      setChatMessages((prev) => [...prev, { message, name: 'You' }]);
      setMessage('');
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const Video = ({ peer, userId, caption }) => {
    const ref = useRef();

    useEffect(() => {
      peer.on('stream', (stream) => {
        ref.current.srcObject = stream;
      });
    }, [peer]);

    return (
      <div>
        <video playsInline autoPlay ref={ref} />
        <p>{userId}</p>
        <p>{caption}</p>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ flex: 2, padding: '1rem' }}>
        <h2>Meeting: {roomId}</h2>
        <video muted ref={userVideo} autoPlay playsInline style={{ width: '300px', borderRadius: '10px' }} />
        <div>
          {peers.map((peer) => (
            <Video key={peer.peerID} peer={peer.peer} userId={peer.userId} caption={captions[peer.userId]} />
          ))}
        </div>
      </div>
      <div style={{ flex: 1, padding: '1rem', borderLeft: '1px solid #ccc' }}>
        <h3>Chat</h3>
        <div style={{ height: '60vh', overflowY: 'auto', marginBottom: '1rem' }}>
          {chatMessages.map((msg, i) => (
            <div key={i}><strong>{msg.name}:</strong> {msg.message}</div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <input
          type="text"
          placeholder="Type message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          style={{ width: '100%', padding: '10px' }}
        />
      </div>
    </div>
  );
};

export default Room;
