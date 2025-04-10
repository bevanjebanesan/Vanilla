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
  const [isSpeechRecognitionActive, setIsSpeechRecognitionActive] = useState(false);
  const [transcripts, setTranscripts] = useState([]);
  const [meetingData, setMeetingData] = useState(null);
  
  const socketRef = useRef();
  const userVideo = useRef();
  const peersRef = useRef([]);
  const userStream = useRef();
  const userIdRef = useRef('');
  const chatEndRef = useRef(null);
  
  // Speech recognition setup
  const recognitionRef = useRef(null);
  
  // Fetch meeting data from the server
  const fetchMeetingData = async () => {
    try {
      const response = await fetch(`${config.SERVER_URL}${config.API.MEETINGS}/${roomId}`);
      if (response.ok) {
        const data = await response.json();
        setMeetingData(data);
        console.log('Meeting data fetched:', data);
      }
    } catch (error) {
      console.error('Error fetching meeting data:', error);
    }
  };
  
  // Clear cached session data
  const clearCachedSessionData = () => {
    peersRef.current = [];
    setPeers([]);
    setMessages([]);
  };
  
  useEffect(() => {
    // Clear any cached data from previous sessions
    clearCachedSessionData();
    
    // Initialize socket connection
    socketRef.current = io(config.SOCKET_URL);
    
    // Get user media
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        // Set local stream
        userStream.current = stream;
        
        // Set local video
        if (userVideo.current) {
          userVideo.current.srcObject = stream;
        }
        
        // When peer server connection is open, join the room
        socketRef.current.on('connect', () => {
          console.log('Socket connected with ID:', socketRef.current.id);
          userIdRef.current = socketRef.current.id;
          socketRef.current.emit('join-room', roomId, socketRef.current.id, username);
        });
        
        // Handle when a new user connects
        socketRef.current.on('user-connected', userId => {
          console.log('New user connected:', userId);
          // Short delay to ensure everything is set up
          setTimeout(() => {
            connectToNewUser(userId, stream);
          }, 1000);
        });
        
        // Handle incoming calls
        socketRef.current.on('receive-call', ({ from, signal }) => {
          console.log('Receiving call from:', from);
          answerCall(from, signal, stream);
        });
        
        // Handle when a call is accepted
        socketRef.current.on('call-accepted', ({ from, signal }) => {
          console.log('Call accepted by:', from);
          const peerObj = peersRef.current.find(p => p.peerID === from);
          if (peerObj) {
            peerObj.peer.signal(signal);
          }
        });
        
        // Handle when a user disconnects
        socketRef.current.on('user-disconnected', userId => {
          console.log('User disconnected:', userId);
          // Find and remove the peer
          const peerObj = peersRef.current.find(p => p.peerID === userId);
          if (peerObj) {
            peerObj.peer.destroy();
          }
          
          // Update peers state
          const remainingPeers = peersRef.current.filter(p => p.peerID !== userId);
          peersRef.current = remainingPeers;
          setPeers(remainingPeers);
        });
        
        // Handle chat messages
        socketRef.current.on('receive-message', message => {
          setMessages(prevMessages => [...prevMessages, message]);
          
          // Scroll to bottom of chat
          setTimeout(() => {
            if (chatEndRef.current) {
              chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
            }
          }, 100);
        });
      })
      .catch(error => {
        console.error('Error accessing media devices:', error);
        alert('Could not access camera or microphone. Please check your permissions.');
      });
    
    // Cleanup on component unmount
    return () => {
      // Stop all tracks in the stream
      if (userStream.current) {
        userStream.current.getTracks().forEach(track => track.stop());
      }
      
      // Close all peer connections
      peersRef.current.forEach(peerObj => {
        if (peerObj.peer) {
          peerObj.peer.destroy();
        }
      });
      
      // Disconnect socket
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [roomId, username]);
  
  // Function to connect to a new user
  const connectToNewUser = (userId, stream) => {
    console.log('Connecting to new user:', userId);
    
    // Create a new peer as the initiator
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream: stream,
      config: {
        iceServers: config.ICE_SERVERS
      }
    });
    
    // When peer generates signal, send it to the user
    peer.on('signal', signal => {
      console.log('Generated signal for new user');
      socketRef.current.emit('send-call', {
        to: userId,
        from: socketRef.current.id,
        signal
      });
    });
    
    // When we get a stream from the peer, create a video element
    peer.on('stream', remoteStream => {
      console.log('Received stream from new user');
    });
    
    // Handle peer errors
    peer.on('error', err => {
      console.error('Peer connection error:', err);
    });
    
    // Store the peer
    const peerObj = {
      peerID: userId,
      peer
    };
    
    peersRef.current.push(peerObj);
    setPeers(prevPeers => [...prevPeers, peerObj]);
  };
  
  // Function to answer a call
  const answerCall = (from, incomingSignal, stream) => {
    console.log('Answering call from:', from);
    
    // Create a new peer as the receiver
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream: stream,
      config: {
        iceServers: config.ICE_SERVERS
      }
    });
    
    // When peer generates signal, send it back to the caller
    peer.on('signal', signal => {
      console.log('Generated answer signal');
      socketRef.current.emit('accept-call', {
        to: from,
        signal
      });
    });
    
    // When we get a stream from the peer, create a video element
    peer.on('stream', remoteStream => {
      console.log('Received stream from caller');
    });
    
    // Handle peer errors
    peer.on('error', err => {
      console.error('Peer connection error:', err);
    });
    
    // Signal the peer with the incoming signal
    peer.signal(incomingSignal);
    
    // Store the peer
    const peerObj = {
      peerID: from,
      peer
    };
    
    peersRef.current.push(peerObj);
    setPeers(prevPeers => [...prevPeers, peerObj]);
  };
  
  // Function to toggle audio
  const toggleAudio = () => {
    if (userStream.current) {
      const audioTrack = userStream.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };
  
  // Function to toggle video
  const toggleVideo = () => {
    if (userStream.current) {
      const videoTrack = userStream.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };
  
  // Function to leave the meeting
  const handleLeave = () => {
    // Stop all tracks in the stream
    if (userStream.current) {
      userStream.current.getTracks().forEach(track => track.stop());
    }
    
    // Emit leave-room event
    if (socketRef.current) {
      socketRef.current.emit('leave-room', roomId);
    }
    
    // Disconnect socket
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    
    onLeave();
  };
  
  // Function to copy meeting link
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
  
  // Function to send a chat message
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
      
      // Add message to local state
      setMessages(prevMessages => [...prevMessages, messageData]);
      
      // Clear message input
      setMessageInput('');
      
      // Scroll to bottom of chat
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
          {/* Local user's video */}
          <div className="video-container local-view">
            <video ref={userVideo} autoPlay muted playsInline />
            <div className="video-username">{username} (You)</div>
          </div>
          
          {/* Remote participants' videos */}
          {peers.map((peerObj) => (
            <Video key={peerObj.peerID} peer={peerObj.peer} />
          ))}
          
          {/* Show waiting message if no other participants */}
          {peers.length === 0 && (
            <div className="waiting-message">
              <div className="loading-spinner"></div>
              <p>Waiting for others to join...</p>
              <p>Share the meeting link to invite others</p>
            </div>
          )}
        </div>
        
        {/* Chat panel */}
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

// Video component for displaying remote video
function Video({ peer }) {
  const ref = useRef();
  
  useEffect(() => {
    if (!peer) return;
    
    // Handle stream event
    peer.on('stream', stream => {
      if (ref.current) {
        ref.current.srcObject = stream;
      }
    });
    
    // Check if we already have a stream
    if (peer._remoteStreams && peer._remoteStreams.length > 0) {
      ref.current.srcObject = peer._remoteStreams[0];
    }
    
    return () => {
      // Cleanup
      if (ref.current && ref.current.srcObject) {
        const tracks = ref.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, [peer]);
  
  return (
    <div className="video-container remote-view">
      <video ref={ref} autoPlay playsInline />
    </div>
  );
}

export default VideoRoom;
