// client/src/Home.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Home = () => {
  const [name, setName] = useState('');
  const [meetingId, setMeetingId] = useState('');
  const navigate = useNavigate();

  const createMeeting = async () => {
    const res = await fetch('http://localhost:5000/create-meeting', {
      method: 'POST',
    });
    const data = await res.json();
    navigate(`/room/${data.meetingId}`, { state: { name } });
  };

  const joinMeeting = async () => {
    const res = await fetch(`http://localhost:5000/meetings/${meetingId}`);
    const data = await res.json();
    if (data.exists) {
      navigate(`/room/${meetingId}`, { state: { name } });
    } else {
      alert('Meeting not found!');
    }
  };

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>🚀 Zoom Lite</h1>
      <input
        type="text"
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ margin: '10px', padding: '10px' }}
      />
      <br />
      <button onClick={createMeeting} style={{ margin: '10px' }}>
        Create Meeting
      </button>
      <br />
      <input
        type="text"
        placeholder="Meeting ID"
        value={meetingId}
        onChange={(e) => setMeetingId(e.target.value)}
        style={{ margin: '10px', padding: '10px' }}
      />
      <br />
      <button onClick={joinMeeting} style={{ margin: '10px' }}>
        Join Meeting
      </button>
    </div>
  );
};

export default Home;
