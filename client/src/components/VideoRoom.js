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
  
  useEffect(() => {
    // Clear any cached data from previous sessions
    clearCachedSessionData();
    
    // Initialize socket connection
    const initializeSocketConnection = () => {
      console.log('Initializing socket connection to:', config.SOCKET_URL);
      
      // Create socket connection with room ID and username
      socketRef.current = io.connect(config.SOCKET_URL, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        query: {
          roomId,
          username
        }
      });
      
      // Handle socket connection events
      socketRef.current.on('connect', () => {
        console.log('Socket connected successfully with ID:', socketRef.current.id);
        userIdRef.current = socketRef.current.id;
        
        // Join the room after socket is connected
        socketRef.current.emit('join-room', roomId, socketRef.current.id, username);
        
        // Initialize user media after socket connection
        initializeUserMedia();
      });
      
      socketRef.current.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
      });
      
      socketRef.current.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
      });
      
      return true;
    };
    
    // Initialize socket connection
    if (!initializeSocketConnection()) {
      console.error('Failed to initialize socket connection');
      return;
    }
    
    // Cleanup function
    return () => {
      if (socketRef.current) {
        console.log('Disconnecting socket');
        socketRef.current.disconnect();
      }
    };
  }, [roomId, username]);
  
  // Separate useEffect for initializing user media
  const initializeUserMedia = () => {
    console.log('Initializing user media...');
    
    // Get user's audio and video
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        console.log('Got local user media stream:', stream);
        
        // Set the local stream
        userStream.current = stream;
        
        // Set the local video element's srcObject to the stream
        if (userVideo.current) {
          userVideo.current.srcObject = stream;
        }
        
        // Set up socket event listeners for room interactions
        setupSocketEventListeners();
      })
      .catch(error => {
        console.error('Error getting user media:', error);
        alert('Could not access camera or microphone. Please check your permissions and try again.');
      });
  };
  
  // Set up socket event listeners
  const setupSocketEventListeners = () => {
    console.log('Setting up socket event listeners');
    
    // Handle when all users are sent from the server
    socketRef.current.on('all-users', users => {
      console.log('Received all users in room:', users);
      
      // Create peer connections to all existing users
      users.forEach(user => {
        const peer = createPeer(user.id, socketRef.current.id, userStream.current, username);
        
        // Store peer with metadata
        const peerObj = {
          peerID: user.id,
          peer,
          username: user.username
        };
        
        peersRef.current.push(peerObj);
      });
      
      // Update the state to trigger re-render
      setPeers(peersRef.current);
    });
    
    // Handle when a new user joins the room
    socketRef.current.on('user-joined', userData => {
      console.log(`User joined: ${userData.username} (${userData.userId})`);
    });
    
    // Handle incoming calls
    socketRef.current.on('callIncoming', ({ signal, from, name }) => {
      console.log(`Incoming call from ${name} (${from})`);
      
      // Create a new peer connection as the receiver
      const peer = addPeer(signal, from, userStream.current, username);
      
      // Store peer with metadata
      const peerObj = {
        peerID: from,
        peer,
        username: name
      };
      
      peersRef.current.push(peerObj);
      
      // Update the state to trigger re-render
      setPeers(prevPeers => [...prevPeers, peerObj]);
    });
    
    // Handle accepted calls
    socketRef.current.on('callAccepted', ({ signal, from, name }) => {
      console.log(`Call accepted by ${name} (${from})`);
      
      // Find the peer in our array
      const item = peersRef.current.find(p => p.peerID === from);
      
      if (item) {
        // Signal the peer with the received signal
        item.peer.signal(signal);
      } else {
        console.error(`Could not find peer for ${from} in peers array`);
      }
    });
    
    // Handle user disconnection
    socketRef.current.on('user-left', userId => {
      console.log(`User left: ${userId}`);
      
      // Find and close the peer connection
      const peerObj = peersRef.current.find(p => p.peerID === userId);
      if (peerObj) {
        peerObj.peer.destroy();
      }
      
      // Remove from peers array
      const peers = peersRef.current.filter(p => p.peerID !== userId);
      peersRef.current = peers;
      setPeers(peers);
    });
    
    // Handle chat messages
    socketRef.current.on('receive-message', message => {
      console.log('Received message:', message);
      
      // Generate a unique ID for the message if it doesn't have one
      if (!message.id) {
        message.id = `${message.userId}-${Date.now()}`;
      }
      
      setMessages(prevMessages => {
        // Check if this message is already in the array (prevent duplicates)
        const isDuplicate = prevMessages.some(m => 
          m.id === message.id || 
          (m.userId === message.userId && 
           m.timestamp === message.timestamp && 
           m.message === message.message)
        );
        
        if (isDuplicate) {
          console.log('Duplicate message detected, not adding to state');
          return prevMessages;
        }
        
        const newMessages = [...prevMessages, message];
        
        // Scroll to bottom of chat
        setTimeout(() => {
          if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
          }
        }, 100);
        
        return newMessages;
      });
    });
  };
  
  // Auto-scroll chat when new messages arrive
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);
  
  // Function to clear cached session data
  const clearCachedSessionData = () => {
    sessionStorage.removeItem('vanilla_username');
    sessionStorage.removeItem('vanilla_meetingId');
  };
  
  // Function to cleanup all resources
  const cleanupResources = () => {
    console.log('Cleaning up resources...');
    
    // Stop speech recognition if active
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    
    // Stop all media tracks
    if (userStream.current) {
      userStream.current.getTracks().forEach(track => {
        track.stop();
      });
      userStream.current = null;
    }
    
    // Destroy all peer connections
    peersRef.current.forEach(peer => {
      if (peer.peer) {
        peer.peer.destroy();
      }
    });
    peersRef.current = [];
    
    // Disconnect from the socket
    if (socketRef.current) {
      // Remove all listeners to prevent memory leaks and duplicate events
      socketRef.current.off('user-joined');
      socketRef.current.off('callIncoming');
      socketRef.current.off('callAccepted');
      socketRef.current.off('all-users');
      socketRef.current.off('user-left');
      socketRef.current.off('receive-message');
      
      // Leave the room
      if (roomId) {
        socketRef.current.emit('leave-room', roomId, userIdRef.current);
      }
      
      // Disconnect the socket
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    
    // Clear state
    setPeers([]);
    setMessages([]);
    setTranscripts([]);
  };
  
  // Function to handle leaving the meeting
  const handleLeave = () => {
    cleanupResources();
    onLeave();
  };
  
  // Function to generate a unique user ID
  const generateUserId = () => {
    return Math.random().toString(36).substring(2, 15);
  };
  
  // Function to create a peer (initiator)
  const createPeer = (userToCall, callerId, stream, callerName) => {
    console.log(`Creating peer connection to ${userToCall} as initiator`);
    
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream: stream,
      config: {
        iceServers: config.ICE_SERVERS
      }
    });
    
    peer.on('signal', signal => {
      console.log('Generated offer signal, sending to peer');
      socketRef.current.emit('callUser', {
        userToCall,
        signalData: signal,
        from: callerId,
        name: callerName
      });
    });
    
    peer.on('stream', remoteStream => {
      console.log(`Received stream from peer ${userToCall}`, remoteStream);
    });
    
    peer.on('connect', () => {
      console.log(`Connected to peer ${userToCall}`);
    });
    
    peer.on('close', () => {
      console.log(`Connection to peer ${userToCall} closed`);
    });
    
    peer.on('error', err => {
      console.error(`Peer connection error with ${userToCall}:`, err);
    });
    
    return peer;
  };
  
  // Function to add a peer (non-initiator)
  const addPeer = (incomingSignal, callerId, stream, myName) => {
    console.log(`Adding peer connection from ${callerId} as receiver`);
    
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream: stream,
      config: {
        iceServers: config.ICE_SERVERS
      }
    });
    
    peer.on('signal', signal => {
      console.log('Generated answer signal, sending to peer');
      socketRef.current.emit('answerCall', {
        signal,
        to: callerId,
        name: myName
      });
    });
    
    peer.on('stream', remoteStream => {
      console.log(`Received stream from peer ${callerId}`, remoteStream);
    });
    
    peer.on('connect', () => {
      console.log(`Connected to peer ${callerId}`);
    });
    
    peer.on('close', () => {
      console.log(`Connection to peer ${callerId} closed`);
    });
    
    peer.on('error', err => {
      console.error(`Peer connection error with ${callerId}:`, err);
    });
    
    // Signal the peer with the incoming signal
    peer.signal(incomingSignal);
    
    return peer;
  };
  
  // Function to toggle audio
  const toggleAudio = () => {
    if (userStream.current) {
      userStream.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(prev => !prev);
    }
  };
  
  // Function to toggle video
  const toggleVideo = () => {
    if (userStream.current) {
      userStream.current.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(prev => !prev);
    }
  };
  
  // Function to toggle speech recognition
  const toggleSpeechRecognition = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert('Speech recognition is not supported in your browser.');
      return;
    }
    
    if (isSpeechRecognitionActive) {
      // Stop speech recognition
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      setIsSpeechRecognitionActive(false);
    } else {
      // Start speech recognition
      const SpeechRecognition = window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      
      // Store interim results
      let interimTranscript = '';
      let finalTranscript = '';
      
      recognition.onresult = (event) => {
        // Process results
        interimTranscript = '';
        finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }
        
        // Only send final transcripts to avoid flooding
        if (finalTranscript !== '') {
          // Send transcript to other users
          const transcriptData = {
            transcript: finalTranscript,
            userId: userIdRef.current,
            username,
            roomId,
            timestamp: new Date().toISOString(),
            id: `${userIdRef.current}-${Date.now()}`
          };
          
          socketRef.current.emit('send-transcript', transcriptData);
          
          // Add to local state with deduplication
          setTranscripts(prevTranscripts => {
            // Check if this transcript is already in the array (prevent duplicates)
            const isDuplicate = prevTranscripts.some(t => 
              t.transcript === finalTranscript && 
              t.userId === userIdRef.current &&
              Math.abs(new Date(t.timestamp) - new Date()) < 2000
            );
            
            if (isDuplicate) {
              return prevTranscripts;
            }
            
            return [...prevTranscripts, transcriptData];
          });
        }
      };
      
      recognition.onend = () => {
        // Restart if still active
        if (isSpeechRecognitionActive) {
          recognition.start();
        }
      };
      
      recognition.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        if (event.error === 'no-speech') {
          // This is a common error, just restart
          if (isSpeechRecognitionActive && recognitionRef.current) {
            recognition.start();
          }
        } else {
          alert(`Speech recognition error: ${event.error}`);
          setIsSpeechRecognitionActive(false);
        }
      };
      
      recognition.start();
      recognitionRef.current = recognition;
      setIsSpeechRecognitionActive(true);
    }
  };
  
  // Function to send a chat message
  const sendMessage = (e) => {
    e.preventDefault();
    if (messageInput.trim() === '') return;
    
    const messageData = {
      roomId,
      userId: userIdRef.current,
      username,
      message: messageInput,
      timestamp: new Date().toISOString(),
      id: `${userIdRef.current}-${Date.now()}`
    };
    
    // Emit the message to the server
    socketRef.current.emit('send-message', messageData);
    
    // Add to local state immediately for instant feedback
    setMessages(prevMessages => [...prevMessages, messageData]);
    
    // Clear input
    setMessageInput('');
    
    // Scroll to bottom
    setTimeout(() => {
      if (chatEndRef.current) {
        chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };
  
  // Function to copy meeting link to clipboard
  const copyMeetingLink = () => {
    // Use path-based URL format to avoid Vercel authentication issues
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
  
  // Function to share meeting via email
  const shareMeetingViaEmail = () => {
    // Use path-based URL format to avoid Vercel authentication issues
    const meetingLink = `${window.location.origin}/m/${roomId}`;
    const subject = `Join my Vanilla video meeting`;
    const body = `Join my meeting using this link: ${meetingLink}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };
  
  return (
    <div className="video-room">
      <div className="room-header">
        <div className="room-info">
          <h2>Meeting: {roomId}</h2>
          {meetingData && (
            <div className="meeting-stats">
              <span>Participants: {meetingData.participants.length}</span>
              <span>Started: {new Date(meetingData.startTime).toLocaleTimeString()}</span>
            </div>
          )}
          <div className="dropdown">
            <button className="dropdown-button">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
              </svg>
              Share Meeting
            </button>
            <div className="dropdown-content">
              <button onClick={copyMeetingLink}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                Copy Link
              </button>
              <button onClick={shareMeetingViaEmail}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                  <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                Share via Email
              </button>
            </div>
          </div>
          <button className="dropdown-button danger" onClick={handleLeave}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            Leave
          </button>
        </div>
      </div>
      
      <div className="room-content">
        {/* Main video grid for all participants */}
        <div className="video-grid">
          {/* Local user's video */}
          <div className="video-container local-view">
            <video ref={userVideo} autoPlay muted playsInline />
            <div className="video-username">{username} (You)</div>
          </div>
          
          {/* Remote participants' videos */}
          {peers.map((peerData) => (
            <div className="video-container remote-view" key={peerData.peerID}>
              <Video 
                peer={peerData.peer} 
                peerID={peerData.peerID}
                username={peerData.username}
              />
              <div className="video-username">{peerData.username}</div>
            </div>
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
      </div>
      
      <div className="video-controls">
        <button 
          className={`control-button ${isMuted ? 'active' : ''}`} 
          onClick={toggleAudio}
        >
          {isMuted ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23"></line>
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
          )}
        </button>
        
        <button 
          className={`control-button ${isVideoOff ? 'active' : ''}`} 
          onClick={toggleVideo}
        >
          {isVideoOff ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"></path>
              <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7"></polygon>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
            </svg>
          )}
        </button>
        
        <button 
          className={`control-button ${isSpeechRecognitionActive ? 'active' : ''}`}
          onClick={toggleSpeechRecognition}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 18v-6"></path>
            <path d="M8 18v-1"></path>
            <path d="M16 18v-3"></path>
            <rect x="3" y="4" width="18" height="16" rx="2"></rect>
          </svg>
        </button>
        
        <button 
          className="control-button danger"
          onClick={handleLeave}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
        </button>
      </div>
      
      <div className="communication-panel">
        <div className="chat-container">
          <h3>Chat</h3>
          <div className="chat-messages">
            {messages.map((msg, index) => (
              <div key={index} className={`message ${msg.userId === userIdRef.current ? 'own-message' : ''}`}>
                <div className="message-header">
                  <span className="message-sender">{msg.userId === userIdRef.current ? 'You' : msg.username}</span>
                  <span className="message-time">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="message-content">{msg.message}</div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={sendMessage} className="chat-input">
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder="Type a message..."
            />
            <button type="submit">Send</button>
          </form>
        </div>
        
        <div className="transcript-container">
          <h3>Transcripts</h3>
          <div className="transcript-text">
            {transcripts.map((transcript, index) => (
              <div key={index} className="transcript-item">
                <strong>{transcript.userId === userIdRef.current ? 'You' : transcript.username}:</strong> {transcript.transcript}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper component to display remote video
function Video({ peer, peerID, username }) {
  const ref = useRef();
  
  useEffect(() => {
    if (!peer) {
      console.error(`No peer provided for ${username}`);
      return;
    }
    
    // Handle stream event from peer
    const handleStream = (stream) => {
      if (ref.current) {
        ref.current.srcObject = stream;
      }
    };
    
    // Add event listener for stream
    peer.on('stream', handleStream);
    
    // Check if we already have streams from this peer
    if (peer._remoteStreams && peer._remoteStreams.length > 0) {
      handleStream(peer._remoteStreams[0]);
    }
    
    return () => {
      peer.off('stream', handleStream);
    };
  }, [peer, peerID, username]);
  
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
    />
  );
}

export default VideoRoom;
