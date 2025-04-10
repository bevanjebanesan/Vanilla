const isDevelopment = process.env.REACT_APP_NODE_ENV !== 'production';

const config = {
  // Use localhost for development, and the deployed backend URL for production
  SERVER_URL: process.env.REACT_APP_SERVER_URL || (isDevelopment 
    ? 'http://localhost:5000' 
    : 'https://vanilla-2na6.onrender.com'),
  
  // Socket URL (same as server URL in most cases)
  SOCKET_URL: process.env.REACT_APP_SOCKET_URL || (isDevelopment 
    ? 'http://localhost:5000' 
    : 'https://vanilla-2na6.onrender.com'),
  
  // API endpoints
  API: {
    HEALTH: '/api/health',
    USERS: '/api/users',
    MEETINGS: '/api/meetings',
  },
  
  // Enhanced ICE server configuration for better WebRTC connectivity
  ICE_SERVERS: [
    // Google STUN servers
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    
    // Additional STUN servers
    { urls: 'stun:stun.stunprotocol.org:3478' },
    { urls: 'stun:stun.sipnet.net:3478' },
    { urls: 'stun:stun.ideasip.com:3478' },
    { urls: 'stun:stun.voiparound.com:3478' },
    
    // Free TURN servers - Note: these are public servers and may have limitations
    // Consider using a dedicated TURN server for production
    {
      urls: 'turn:numb.viagenie.ca:3478',
      username: 'webrtc@live.com',
      credential: 'muazkh'
    },
    {
      urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
      username: 'webrtc',
      credential: 'webrtc'
    }
  ]
};

export default config;
