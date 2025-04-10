const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const fs = require('fs');
require('dotenv').config();

// MongoDB connection
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://bevan_admin:bevan_123@lemon0.ybuuqu2.mongodb.net/ashlin?retryWrites=true&w=majority&appName=Lemon0';
    
    const conn = await mongoose.connect(mongoURI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    console.warn('Continuing without database connection. Some features may not work.');
    // Don't exit the process, allow the server to run without DB
  }
};

// Connect to MongoDB
connectDB();

// Define MongoDB schemas and models
const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const MeetingSchema = new mongoose.Schema({
  meetingId: {
    type: String,
    required: true,
    unique: true
  },
  hostId: {
    type: String,
    required: true
  },
  participants: [{
    userId: String,
    username: String,
    joinedAt: Date
  }],
  startTime: {
    type: Date,
    default: Date.now
  },
  endTime: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  }
});

const ChatMessageSchema = new mongoose.Schema({
  meetingId: {
    type: String,
    required: true
  },
  userId: {
    type: String,
    required: true
  },
  username: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const User = mongoose.model('User', UserSchema);
const Meeting = mongoose.model('Meeting', MeetingSchema);
const ChatMessage = mongoose.model('ChatMessage', ChatMessageSchema);

const app = express();
app.use(cors());
app.use(express.json());

// API routes
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// User API routes
app.post('/api/users', async (req, res) => {
  try {
    const { username, email } = req.body;
    const user = new User({ username, email });
    await user.save();
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Meeting API routes
app.post('/api/meetings', async (req, res) => {
  try {
    const { meetingId, hostId } = req.body;
    const meeting = new Meeting({ meetingId, hostId });
    await meeting.save();
    res.status(201).json(meeting);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get('/api/meetings/:meetingId', async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ meetingId: req.params.meetingId });
    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }
    res.status(200).json(meeting);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Serve static files from the React app
try {
  const clientBuildPath = path.join(__dirname, 'client', 'build');
  
  // Check if the client/build directory exists
  if (fs.existsSync(clientBuildPath)) {
    app.use(express.static(clientBuildPath));
    
    // Handle React routing, return all requests to React app
    app.get('*', (req, res) => {
      if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
        res.sendFile(path.join(clientBuildPath, 'index.html'));
      }
    });
    
    console.log('Serving static files from client/build');
  } else {
    console.error('Client build directory not found at:', clientBuildPath);
    console.error('Please run "npm run build" in the client directory');
  }
} catch (error) {
  console.error('Error setting up static file serving:', error);
}

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Store active users in rooms
const rooms = {};

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  // Get roomId and username from query parameters
  const { roomId, username } = socket.handshake.query;
  
  if (!roomId) {
    console.error('No roomId provided in socket connection');
    return;
  }
  
  // Join room when user explicitly sends join-room event
  socket.on('join-room', (roomId, userId, username) => {
    console.log(`User ${username} (${userId}) joining room: ${roomId}`);
    
    // Join the socket.io room
    socket.join(roomId);
    
    // Store user data in the room
    if (!rooms[roomId]) {
      rooms[roomId] = { users: [] };
    }
    
    // Add user to room if not already in
    const existingUser = rooms[roomId].users.find(user => user.id === userId);
    if (!existingUser) {
      rooms[roomId].users.push({ id: userId, username });
    }
    
    // Get all other users in the room
    const otherUsers = rooms[roomId].users.filter(user => user.id !== userId);
    
    // Send all existing users to the new user
    socket.emit('all-users', otherUsers);
    
    // Notify all users in the room about the new user
    socket.to(roomId).emit('user-joined', { userId, username });
    
    console.log(`Room ${roomId} now has ${rooms[roomId].users.length} users`);
  });
  
  // Handle call signaling
  socket.on('callUser', ({ userToCall, signalData, from, name }) => {
    console.log(`Call from ${name} (${from}) to ${userToCall}`);
    io.to(userToCall).emit('callIncoming', { signal: signalData, from, name });
  });
  
  // Handle call answer
  socket.on('answerCall', ({ signal, to, name }) => {
    console.log(`Call answered by ${name} to ${to}`);
    io.to(to).emit('callAccepted', { signal, from: socket.id, name });
  });
  
  // Handle chat messages
  socket.on('send-message', (roomId, message) => {
    console.log(`Message in room ${roomId} from ${message.username}: ${message.message}`);
    socket.to(roomId).emit('receive-message', message);
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    // Find which room this user was in
    const roomsWithUser = Object.entries(rooms).filter(([_, room]) => 
      room.users.some(user => user.id === socket.id)
    );
    
    // Remove user from all rooms they were in
    roomsWithUser.forEach(([roomId, room]) => {
      console.log(`Removing user ${socket.id} from room ${roomId}`);
      
      // Filter out the disconnected user
      room.users = room.users.filter(user => user.id !== socket.id);
      
      // Notify other users in the room
      socket.to(roomId).emit('user-left', socket.id);
      
      // Clean up empty rooms
      if (room.users.length === 0) {
        console.log(`Room ${roomId} is now empty, cleaning up`);
        delete rooms[roomId];
      } else {
        console.log(`Room ${roomId} now has ${room.users.length} users`);
      }
    });
  });
  
  // Handle explicit room leaving
  socket.on('leave-room', (roomId) => {
    console.log(`User ${socket.id} leaving room ${roomId}`);
    
    if (rooms[roomId]) {
      // Remove user from room
      rooms[roomId].users = rooms[roomId].users.filter(user => user.id !== socket.id);
      
      // Notify other users in the room
      socket.to(roomId).emit('user-left', socket.id);
      
      // Leave the socket.io room
      socket.leave(roomId);
      
      // Clean up empty rooms
      if (rooms[roomId].users.length === 0) {
        console.log(`Room ${roomId} is now empty, cleaning up`);
        delete rooms[roomId];
      } else {
        console.log(`Room ${roomId} now has ${rooms[roomId].users.length} users`);
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
