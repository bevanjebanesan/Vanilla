import React, { useState, useEffect } from 'react';
import VideoRoom from './components/VideoRoom';
import config from './config';
import './App.css';

function App() {
  const [username, setUsername] = useState('');
  const [meetingId, setMeetingId] = useState('');
  const [inMeeting, setInMeeting] = useState(false);
  const [showNameInput, setShowNameInput] = useState(false);
  const [action, setAction] = useState(''); // 'create' or 'join'
  const [email, setEmail] = useState(''); // Optional email for registered users

  // Check for meeting ID in URL when component mounts and clear session storage
  useEffect(() => {
    // Clear any stored session data to prevent auto-joining with previous credentials
    sessionStorage.removeItem('vanilla_username');
    sessionStorage.removeItem('vanilla_meetingId');
    localStorage.removeItem('vanilla_username');
    localStorage.removeItem('vanilla_meetingId');
    
    // Function to handle direct meeting links
    const processDirectLink = () => {
      // Check URL path for meeting ID (e.g., /m/abcdef)
      const pathMatch = window.location.pathname.match(/\/m\/([a-zA-Z0-9]+)/);
      if (pathMatch && pathMatch[1]) {
        console.log(`Found meeting ID in path: ${pathMatch[1]}`);
        setMeetingId(pathMatch[1]);
        setAction('join');
        setShowNameInput(true);
        return true;
      }
      
      // Check query parameters
      const params = new URLSearchParams(window.location.search);
      const joinMeetingId = params.get('join');
      if (joinMeetingId) {
        console.log(`Found meeting ID in query params: ${joinMeetingId}`);
        setMeetingId(joinMeetingId);
        setAction('join');
        setShowNameInput(true);
        
        // Clean up the URL
        window.history.replaceState({}, document.title, window.location.pathname);
        return true;
      }
      
      // Check hash fragment
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const hashJoinId = hashParams.get('join');
      if (hashJoinId) {
        console.log(`Found meeting ID in hash fragment: ${hashJoinId}`);
        setMeetingId(hashJoinId);
        setAction('join');
        setShowNameInput(true);
        
        // Clean up the URL
        window.history.replaceState({}, document.title, window.location.pathname);
        return true;
      }
      
      return false;
    };
    
    // Process any direct meeting links
    processDirectLink();
  }, []);

  const handleCreateMeeting = () => {
    setAction('create');
    setShowNameInput(true);
  };

  const handleJoinMeeting = () => {
    setAction('join');
    setShowNameInput(true);
  };

  const createUserInDatabase = async (username, email = '') => {
    try {
      const response = await fetch(`${config.SERVER_URL}${config.API.USERS}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, email }),
      });
      
      if (response.ok) {
        const userData = await response.json();
        console.log('User created in database:', userData);
        return userData;
      } else {
        console.error('Failed to create user in database');
        return null;
      }
    } catch (error) {
      console.error('Error creating user:', error);
      return null;
    }
  };

  const createMeetingInDatabase = async (meetingId, hostId) => {
    try {
      const response = await fetch(`${config.SERVER_URL}${config.API.MEETINGS}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ meetingId, hostId }),
      });
      
      if (response.ok) {
        const meetingData = await response.json();
        console.log('Meeting created in database:', meetingData);
        return meetingData;
      } else {
        console.error('Failed to create meeting in database');
        return null;
      }
    } catch (error) {
      console.error('Error creating meeting:', error);
      return null;
    }
  };

  const handleNameSubmit = async (e) => {
    e.preventDefault();
    
    if (!username.trim()) {
      alert('Please enter your name');
      return;
    }
    
    // Create user in database
    const userData = await createUserInDatabase(username, email);
    const userId = userData ? userData._id : Math.random().toString(36).substring(2, 15);
    
    if (action === 'create') {
      // Generate a random meeting ID
      const newMeetingId = Math.random().toString(36).substring(2, 7);
      setMeetingId(newMeetingId);
      
      // Create meeting in database
      await createMeetingInDatabase(newMeetingId, userId);
      
      setInMeeting(true);
    } else if (action === 'join') {
      if (!meetingId.trim()) {
        alert('Please enter a meeting ID');
        return;
      }
      setInMeeting(true);
    }
  };

  const handleLeaveMeeting = () => {
    // Clear all meeting data when leaving
    setInMeeting(false);
    setShowNameInput(false);
    setUsername('');
    setMeetingId('');
    setEmail('');
    
    // Clear browser storage
    sessionStorage.removeItem('vanilla_username');
    sessionStorage.removeItem('vanilla_meetingId');
    localStorage.removeItem('vanilla_username');
    localStorage.removeItem('vanilla_meetingId');
    
    // Force reload the page to clear any cached data
    window.location.href = window.location.pathname;
  };

  return (
    <div className="App">
      {!inMeeting && (
        <header className="app-header">
          <h1>Vanilla</h1>
        </header>
      )}
      
      {!showNameInput && !inMeeting ? (
        <div className="home-container">
          <h2>Welcome to Vanilla Video Conferencing</h2>
          <p>Connect with anyone, anywhere with high-quality video and audio.</p>
          <div className="action-buttons">
            <button className="action-button" onClick={handleCreateMeeting}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 7l-7 5 7 5V7z"></path>
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
              </svg>
              Create Meeting
            </button>
            <button className="action-button" onClick={handleJoinMeeting}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                <polyline points="10 17 15 12 10 7"></polyline>
                <line x1="15" y1="12" x2="3" y2="12"></line>
              </svg>
              Join Meeting
            </button>
          </div>
        </div>
      ) : showNameInput && !inMeeting ? (
        <div className="name-input-container">
          <h2>{action === 'create' ? 'Create a Meeting' : 'Join a Meeting'}</h2>
          <form onSubmit={handleNameSubmit}>
            <input
              type="text"
              placeholder="Your Name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            
            <input
              type="email"
              placeholder="Email (optional)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            
            {action === 'join' && (
              <input
                type="text"
                placeholder="Meeting ID"
                value={meetingId}
                onChange={(e) => setMeetingId(e.target.value)}
                required
              />
            )}
            
            <button type="submit">{action === 'create' ? 'Create Meeting' : 'Join Meeting'}</button>
            <button type="button" onClick={() => setShowNameInput(false)}>Back</button>
          </form>
        </div>
      ) : (
        <VideoRoom 
          roomId={meetingId} 
          username={username} 
          onLeave={handleLeaveMeeting} 
        />
      )}
    </div>
  );
}

export default App;
