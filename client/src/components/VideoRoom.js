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
    
    // Connect to the server
    socketRef.current = io.connect(config.SOCKET_URL);
    
    // Generate a unique user ID
    userIdRef.current = generateUserId();
    
    // Get user's media stream
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        console.log("Got local media stream");
        userStream.current = stream;
        userVideo.current.srcObject = stream;
        
        // Join the room
        socketRef.current.emit('join-room', roomId, userIdRef.current, username);
        
        // Fetch meeting data after joining
        fetchMeetingData();
        
        // Set up event listeners for new users
        socketRef.current.on('user-joined', (userId, username) => {
          console.log(`User ${username} (${userId}) joined the room`);
          
          // Create a peer connection to the new user
          const peer = createPeer(userId, userIdRef.current, stream, username);
          
          peersRef.current.push({
            peerID: userId,
            peer,
            username
          });
          
          setPeers(prevPeers => [...prevPeers, {
            peerID: userId,
            peer,
            username
          }]);
        });
        
        // Handle incoming calls
        socketRef.current.on('callIncoming', ({ signal, from, name }) => {
          console.log(`Incoming call from ${name} (${from})`);
          
          const peer = addPeer(signal, from, stream, username);
          
          peersRef.current.push({
            peerID: from,
            peer,
            username: name
          });
          
          setPeers(prevPeers => [...prevPeers, {
            peerID: from,
            peer,
            username: name
          }]);
        });
        
        // Handle accepted calls
        socketRef.current.on('callAccepted', ({ signal, from, name }) => {
          console.log(`Call accepted by ${name} (${from})`);
          
          const item = peersRef.current.find(p => p.peerID === from);
          if (item) {
            item.peer.signal(signal);
          }
        });
        
        // Get all users currently in the room
        socketRef.current.on('all-users', users => {
          console.log('All users in room:', users);
          
          // Create peer connections to all existing users
          users.forEach(user => {
            const peer = createPeer(user.id, userIdRef.current, stream, username);
            
            peersRef.current.push({
              peerID: user.id,
              peer,
              username: user.username
            });
            
            setPeers(prevPeers => [...prevPeers, {
              peerID: user.id,
              peer,
              username: user.username
            }]);
          });
        });
        
        // Handle user leaving
        socketRef.current.on('user-left', userId => {
          console.log(`User ${userId} left the room`);
          
          // Find and remove the peer connection
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
          setMessages(prevMessages => [...prevMessages, message]);
        });
        
        // Handle transcripts
        socketRef.current.on('receive-transcript', transcript => {
          console.log('Received transcript:', transcript);
          setTranscripts(prevTranscripts => [...prevTranscripts, transcript]);
        });
      })
      .catch(err => {
        console.error('Error accessing media devices:', err);
        alert('Could not access camera or microphone. Please check your permissions.');
      });
    
    // Cleanup on component unmount
    return () => {
      cleanupResources();
    };
  }, [roomId, username]);
  
  // Function to clear cached session data
  const clearCachedSessionData = () => {
    // Clear any session storage
    sessionStorage.removeItem('vanilla_username');
    sessionStorage.removeItem('vanilla_meetingId');
    sessionStorage.removeItem('vanilla_userId');
    
    // Clear any local storage
    localStorage.removeItem('vanilla_username');
    localStorage.removeItem('vanilla_meetingId');
    localStorage.removeItem('vanilla_userId');
    
    // Clear any IndexedDB data related to WebRTC
    if (window.indexedDB) {
      try {
        // Clear WebRTC-related databases
        const databases = ['WebRTCIdentityStore', 'rtcStatsDatabase'];
        databases.forEach(dbName => {
          window.indexedDB.deleteDatabase(dbName);
        });
      } catch (error) {
        console.error('Error clearing IndexedDB:', error);
      }
    }
  };
  
  // Function to cleanup all resources
  const cleanupResources = () => {
    console.log('Cleaning up all resources');
    
    // Stop all media tracks
    if (userStream.current) {
      userStream.current.getTracks().forEach(track => {
        track.stop();
      });
      userStream.current = null;
    }
    
    // Clear video element source
    if (userVideo.current) {
      userVideo.current.srcObject = null;
    }
    
    // Close all peer connections
    peersRef.current.forEach(peer => {
      if (peer.peer) {
        peer.peer.destroy();
      }
    });
    peersRef.current = [];
    
    // Stop speech recognition if active
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    
    // Disconnect socket
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    
    // Clear cached session data
    clearCachedSessionData();
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
      stream,
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
    
    peer.on('stream', stream => {
      console.log(`Received stream from peer ${userToCall}`, stream);
    });
    
    peer.on('error', err => {
      console.error('Peer connection error:', err);
    });
    
    return peer;
  };
  
  // Function to add a peer (non-initiator)
  const addPeer = (incomingSignal, callerId, stream, myName) => {
    console.log(`Adding peer connection from ${callerId} as receiver`);
    
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream,
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
    
    peer.on('stream', stream => {
      console.log(`Received stream from peer ${callerId}`, stream);
    });
    
    peer.on('error', err => {
      console.error('Peer connection error:', err);
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
      
      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map(result => result[0])
          .map(result => result.transcript)
          .join('');
        
        if (event.results[0].isFinal) {
          // Send transcript to other users
          const transcriptData = {
            transcript,
            userId: userIdRef.current,
            username,
            roomId,
            timestamp: new Date().toISOString()
          };
          
          socketRef.current.emit('send-transcript', transcriptData);
          setTranscripts(prevTranscripts => [...prevTranscripts, transcriptData]);
        }
      };
      
      recognition.onend = () => {
        // Restart if still active
        if (isSpeechRecognitionActive) {
          recognition.start();
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
      timestamp: new Date().toISOString()
    };
    
    socketRef.current.emit('send-message', messageData);
    
    // Add message to local state
    setMessages(prevMessages => [...prevMessages, messageData]);
    
    // Clear input
    setMessageInput('');
  };
  
  // Function to copy meeting link to clipboard
  const copyMeetingLink = () => {
    const meetingLink = `${window.location.origin}?join=${roomId}`;
    navigator.clipboard.writeText(meetingLink)
      .then(() => {
        // Show the link in an alert so the user can see it
        alert(`Meeting link copied to clipboard!\n\n${meetingLink}`);
      })
      .catch(err => console.error('Failed to copy meeting link:', err));
  };
  
  // Function to share meeting via email
  const shareMeetingViaEmail = () => {
    const meetingLink = `${window.location.origin}?join=${roomId}`;
    const subject = 'Join my Vanilla video meeting';
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
      
      <div className="video-grid">
        <div className="video-item">
          <video ref={userVideo} autoPlay muted playsInline />
          <div className="name-tag">{username} (You)</div>
        </div>
        
        {peers.map((peer) => (
          <div className="video-item" key={peer.peerID}>
            <Video peer={peer.peer} />
            <div className="name-tag">{peer.username}</div>
          </div>
        ))}
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
function Video({ peer }) {
  const videoRef = useRef();
  
  useEffect(() => {
    console.log("Setting up video ref for peer");
    
    if (!peer) {
      console.error("No peer provided to Video component");
      return;
    }
    
    // Handle when we get a stream from the peer
    peer.on('stream', stream => {
      console.log("Received stream in Video component", stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    });
    
    // Check if we already have a stream
    if (peer.streams && peer.streams.length > 0) {
      console.log("Peer already has streams:", peer.streams);
      videoRef.current.srcObject = peer.streams[0];
    }
    
    return () => {
      // Cleanup
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, [peer]);
  
  return <video ref={videoRef} autoPlay playsInline />;
}

export default VideoRoom;
