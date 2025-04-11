import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import Peer from 'simple-peer';
import config from '../config';

const VideoRoom = ({ roomId, username, onLeave }) => {
  const [peers, setPeers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const socketRef = useRef();
  const userVideo = useRef();
  const peersRef = useRef([]);
  const userStream = useRef();
  const userIdRef = useRef('');
  const chatEndRef = useRef(null);

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

        socketRef.current.on('receive-message', message => {
          setMessages(prevMessages => [...prevMessages, message]);
          setTimeout(() => {
            if (chatEndRef.current) {
              chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
            }
          }, 100);
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

  const toggleAudio = () => {
    if (userStream.current) {
      const audioTrack = userStream.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
      }
    }
  };

  const toggleVideo = () => {
    if (userStream.current) {
      const videoTrack = userStream.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
      }
    }
  };

  const handleLeave = () => {
    if (userStream.current) {
      userStream.current.getTracks().forEach(track => track.stop());
    }
    if (socketRef.current) {
      socketRef.current.emit('leave-room', roomId);
      socketRef.current.disconnect();
    }
    onLeave();
  };

  const copyMeetingLink = () => {
    const meetingLink = `${window.location.origin}/m/${roomId}`;
    navigator.clipboard.writeText(meetingLink)
      .then(() => {
        alert('Meeting link copied to clipboard!');
      })
      .catch(err => {
        console.error('Failed to copy meeting link:', err);
        alert('Failed to copy meeting link. Please try again.');
      });
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (messageInput.trim() && socketRef.current) {
      const messageData = {
        roomId,
        userId: userIdRef.current,
        username,
        message: messageInput,
        timestamp: new Date().toISOString()
      };
      socketRef.current.emit('send-message', roomId, messageData);
      setMessages(prevMessages => [...prevMessages, messageData]);
      setMessageInput('');
      setTimeout(() => {
        if (chatEndRef.current) {
          chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    }
  };

  return (
    <div className="video-room">
      <div className="room-header">
        <div className="room-info">
          <h2>Meeting: {roomId}</h2>
          <button
            className="copy-link-button"
            onClick={copyMeetingLink}
            title="Copy meeting link"
          >
            Copy Link
          </button>
        </div>

        <div className="controls">
          <button
            className={`control-button ${isMuted ? 'active' : ''}`}
            onClick={toggleAudio}
            title={isMuted ? "Unmute" : "Mute"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
          </button>

          <button
            className={`control-button ${isVideoOff ? 'active' : ''}`}
            onClick={toggleVideo}
            title={isVideoOff ? "Turn on camera" : "Turn off camera"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7"></polygon>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
            </svg>
          </button>

          <button
            className="control-button"
            onClick={handleLeave}
            title="Leave meeting"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </button>
        </div>
      </div>

      <div className="room-content">
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

        <div className="chat-panel">
          <div className="chat-header">
            <h3>Chat</h3>
          </div>

          <div className="chat-messages">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`chat-message ${msg.userId === userIdRef.current ? 'sent' : 'received'}`}
              >
                <div className="message-sender">{msg.username}</div>
                <div className="message-content">{msg.message}</div>
                <div className="message-time">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <form className="chat-input" onSubmit={sendMessage}>
            <input
              type="text"
              placeholder="Type a message..."
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
            />
            <button type="submit">
              Send
            </button>
          </form>
        </div>
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