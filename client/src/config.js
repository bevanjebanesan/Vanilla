const isDevelopment = process.env.NODE_ENV !== 'production';

const config = {
  // Use localhost for development, and the deployed backend URL for production
  SERVER_URL: isDevelopment 
    ? 'http://localhost:5000' 
    : 'https://vanilla-2na6.onrender.com',
  
  // API endpoints
  API: {
    HEALTH: '/api/health',
    USERS: '/api/users',
    MEETINGS: '/api/meetings',
  },
  
  ICE_SERVERS: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ]
};

export default config;
