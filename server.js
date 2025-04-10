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
const roomUsers = {};

io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);

  // When a user joins a room
  socket.on('join-room', async (roomId, userId, username) => {
    console.log(`User ${username} (${userId}) joined room ${roomId}`);
    
    // Initialize room if it doesn't exist
    if (!roomUsers[roomId]) {
      roomUsers[roomId] = [];
      
      // Check if meeting exists in database, create if not
      try {
        let meeting = await Meeting.findOne({ meetingId: roomId });
        if (!meeting) {
          meeting = new Meeting({ meetingId: roomId, hostId: userId });
          await meeting.save();
          console.log(`Created new meeting in database: ${roomId}`);
        }
        
        // Update meeting with new participant
        await Meeting.findOneAndUpdate(
          { meetingId: roomId },
          { 
            $push: { 
              participants: { 
                userId, 
                username, 
                joinedAt: new Date() 
              } 
            },
            isActive: true
          }
        );
      } catch (error) {
        console.error(`Error updating meeting in database: ${error.message}`);
      }
    }
    
    // Add user to room
    roomUsers[roomId].push({
      id: userId,
      username,
      socketId: socket.id
    });
    
    // Join the socket room
    socket.join(roomId);
    
    // Notify other users in the room
    socket.to(roomId).emit('user-joined', userId, username);
    
    // Send the list of users already in the room to the new user
    const usersInRoom = roomUsers[roomId].filter(user => user.id !== userId);
    socket.emit('all-users', usersInRoom);
    
    console.log(`Room ${roomId} now has users:`, roomUsers[roomId]);
    
    // Handle user disconnection
    socket.on('disconnect', async () => {
      console.log(`User ${username} (${userId}) disconnected from room ${roomId}`);
      
      // Remove user from room
      if (roomUsers[roomId]) {
        roomUsers[roomId] = roomUsers[roomId].filter(user => user.id !== userId);
        
        // If room is empty, mark meeting as inactive in database
        if (roomUsers[roomId].length === 0) {
          try {
            await Meeting.findOneAndUpdate(
              { meetingId: roomId },
              { 
                isActive: false,
                endTime: new Date()
              }
            );
            console.log(`Meeting ${roomId} marked as inactive in database`);
          } catch (error) {
            console.error(`Error updating meeting in database: ${error.message}`);
          }
          
          delete roomUsers[roomId];
          console.log(`Room ${roomId} deleted (empty)`);
        } else {
          console.log(`Room ${roomId} now has users:`, roomUsers[roomId]);
        }
      }
      
      // Notify other users in the room
      socket.to(roomId).emit('user-left', userId);
    });
  });
  
  // Handle WebRTC signaling
  socket.on('callUser', ({ userToCall, signalData, from, name }) => {
    console.log(`Call request from ${name} (${from}) to user ID ${userToCall}`);
    
    // Find the socket ID for the user to call
    let socketId = null;
    
    // Search through all rooms to find the user
    Object.keys(roomUsers).forEach(roomId => {
      const user = roomUsers[roomId].find(user => user.id === userToCall);
      if (user) {
        socketId = user.socketId;
      }
    });
    
    if (socketId) {
      io.to(socketId).emit('callIncoming', {
        signal: signalData,
        from,
        name
      });
      console.log(`Call signal sent to socket ${socketId}`);
    } else {
      console.log(`Could not find socket for user ${userToCall}`);
    }
  });
  
  socket.on('answerCall', ({ signal, to, name }) => {
    console.log(`Answer from ${name} to user ID ${to}`);
    
    // Find the socket ID for the caller
    let socketId = null;
    
    // Search through all rooms to find the user
    Object.keys(roomUsers).forEach(roomId => {
      const user = roomUsers[roomId].find(user => user.id === to);
      if (user) {
        socketId = user.socketId;
      }
    });
    
    if (socketId) {
      io.to(socketId).emit('callAccepted', {
        signal,
        from: socket.id,
        name
      });
      console.log(`Answer signal sent to socket ${socketId}`);
    } else {
      console.log(`Could not find socket for user ${to}`);
    }
  });
  
  // Handle chat messages
  socket.on('send-message', async (message) => {
    console.log(`Message from ${message.username} in room ${message.roomId}: ${message.message}`);
    
    // Save message to database
    try {
      const chatMessage = new ChatMessage({
        meetingId: message.roomId,
        userId: message.userId,
        username: message.username,
        message: message.message
      });
      await chatMessage.save();
    } catch (error) {
      console.error(`Error saving chat message to database: ${error.message}`);
    }
    
    // Broadcast message to all users in the room
    socket.to(message.roomId).emit('receive-message', message);
  });
  
  // Handle speech-to-text transcripts
  socket.on('send-transcript', (transcript) => {
    console.log(`Transcript from ${transcript.username} in room ${transcript.roomId}`);
    
    // Broadcast transcript to all users in the room
    socket.to(transcript.roomId).emit('receive-transcript', transcript);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
