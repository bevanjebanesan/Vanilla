const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

const config = {
  // Use localhost for development, and the deployed backend URL for production
  SERVER_URL: isDevelopment 
    ? 'http://localhost:5000' 
    : 'https://vanilla-backend.onrender.com',
  
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
