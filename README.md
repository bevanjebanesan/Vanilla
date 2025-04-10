# Vanilla - Video Conferencing Application

Vanilla is a Zoom clone that allows users to create and join video conferences with features like real-time chat and speech-to-text conversion.

## Features

- User authentication (login/register)
- Guest access to meetings
- Create and join meetings with a meeting ID
- Real-time video conferencing with multiple participants
- Real-time chat during meetings
- Speech-to-text conversion
- MongoDB database integration for persistent data storage
- Designed for future integration of sign language to text conversion

## Tech Stack

- **Frontend**: React.js
- **Backend**: Node.js, Express
- **Real-time Communication**: Socket.io, WebRTC
- **Database**: MongoDB
- **Deployment**: Render (Backend), Vercel (Frontend)

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- MongoDB Atlas account (for database)
- GitHub account (for deployment)

## Installation

1. Clone the repository
   ```
   git clone https://github.com/bevanjebanesan/Vanilla.git
   cd Vanilla
   ```

2. Install server dependencies:
   ```
   npm install
   ```

3. Install client dependencies:
   ```
   cd client
   npm install
   ```

4. Create a `.env` file in the root directory with the following variables:
   ```
   MONGODB_URI=your_mongodb_connection_string
   PORT=5000
   ```

## Running the Application Locally

1. Start the backend server:
   ```
   npm run server
   ```

2. In a separate terminal, start the frontend:
   ```
   cd client
   npm start
   ```

3. Open your browser and navigate to `http://localhost:3000`

## Deployment

### GitHub Setup

1. Initialize Git repository (if not already done):
   ```
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. Connect to GitHub:
   ```
   git remote add origin https://github.com/bevanjebanesan/Vanilla.git
   git branch -M main
   git push -u origin main
   ```

### MongoDB Setup

1. Create a MongoDB Atlas account at https://www.mongodb.com/cloud/atlas
2. Create a new cluster
3. Set up database access (username and password)
4. Create a database named "ashlin"
5. Get your connection string and add it to your `.env` file:
   ```
   MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/ashlin?retryWrites=true&w=majority
   ```

### Backend Deployment (Render)

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Configure the service:
   - Name: vanilla-backend
   - Environment: Node
   - Build Command: `npm install`
   - Start Command: `node server.js`
   - Add the environment variable for MONGODB_URI

### Frontend Deployment (Vercel)

1. Create a new project on Vercel
2. Import your GitHub repository
3. Configure the project:
   - Framework Preset: Create React App
   - Root Directory: client
   - Build Command: `npm run build`
   - Output Directory: build
   - Add environment variables if needed

## Using the Application

1. **Create a Meeting**:
   - Click on "Create Meeting"
   - Enter your name and optional email
   - Share the meeting ID or link with others

2. **Join a Meeting**:
   - Click on "Join Meeting"
   - Enter your name, optional email, and the meeting ID
   - Or use a shared meeting link

3. **During a Meeting**:
   - Toggle your microphone and camera using the control buttons
   - Use the chat panel to send messages
   - Enable speech-to-text to convert your speech to text
   - Share the meeting link with others using the share options
   - Leave the meeting using the "Leave" button

## Troubleshooting

- **Video/Audio Issues**: Ensure your browser has permission to access your camera and microphone
- **Connection Issues**: Check your internet connection and firewall settings
- **WebRTC Issues**: The application uses STUN servers for connection. If behind a strict firewall, some connections might fail

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- WebRTC for enabling real-time communication
- Socket.io for signaling
- MongoDB for database storage
- Render and Vercel for hosting
