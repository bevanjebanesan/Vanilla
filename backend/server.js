const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // Replace with your frontend origin in production
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 5000;

// In-memory fallback for meeting data
let meetings = {}; // meetingId => [socketId1, socketId2, ...]

io.on("connection", (socket) => {
  console.log(`⚡ New client connected: ${socket.id}`);

  socket.on("join-meeting", ({ meetingId, userName }) => {
    socket.join(meetingId);
    socket.meetingId = meetingId;
    socket.userName = userName;

    if (!meetings[meetingId]) {
      meetings[meetingId] = [];
    }

    meetings[meetingId].push(socket.id);

    // Send list of all other users to the newly joined user
    const otherUsers = meetings[meetingId].filter(id => id !== socket.id);
    socket.emit("all-users", otherUsers);

    // Notify existing users about the new user
    otherUsers.forEach(existingUserId => {
      io.to(existingUserId).emit("user-joined", {
        signal: null,
        callerID: socket.id,
      });
    });
  });

  socket.on("sending-signal", ({ userToSignal, callerID, signal }) => {
    io.to(userToSignal).emit("user-joined", {
      signal,
      callerID,
    });
  });

  socket.on("returning-signal", ({ callerID, signal }) => {
    io.to(callerID).emit("receiving-returned-signal", {
      signal,
      id: socket.id,
    });
  });

  socket.on("disconnect", () => {
    console.log(`🔥 Client disconnected: ${socket.id}`);

    const meetingId = socket.meetingId;
    if (meetingId && meetings[meetingId]) {
      meetings[meetingId] = meetings[meetingId].filter(id => id !== socket.id);

      // Notify remaining users
      socket.to(meetingId).emit("user-disconnected", socket.id);

      if (meetings[meetingId].length === 0) {
        delete meetings[meetingId];
      }
    }
  });
});

// Optional: MongoDB support for persistent meetings
mongoose
  .connect(process.env.MONGO_URI || "mongodb://localhost:27017/videoapp", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("✅ MongoDB connected");
    server.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
  });
