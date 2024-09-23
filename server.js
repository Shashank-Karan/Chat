const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const VERSION = '9.7'; // Updated version number

// In-memory storage for messages and user information
const messages = [];
const users = new Map();

app.use(express.static(path.join(__dirname, 'public')));

const activeCallIds = new Map(); // Store active call IDs and participants

io.on('connection', (socket) => {
  console.log('New user connected');

  socket.on('join', (username) => {
    users.set(socket.id, { username, personalCallId: generatePersonalCallId() });
    io.emit('userJoined', { userId: socket.id, username });
    socket.emit('version', VERSION); // Send version to client
  });

  socket.on('message', (message) => {
    const user = users.get(socket.id);
    const newMessage = { ...message, username: user.username, userId: socket.id };
    messages.push(newMessage);
    io.emit('message', newMessage);
  });

  socket.on('reaction', ({ messageId, reaction }) => {
    const message = messages.find(m => m.id === messageId);
    if (message) {
      if (!message.reactions) message.reactions = {};
      if (!message.reactions[reaction]) message.reactions[reaction] = 0;
      message.reactions[reaction]++;
      io.emit('reaction', { messageId, reaction, count: message.reactions[reaction] });
    }
  });

  socket.on('fileShare', (fileInfo) => {
    const user = users.get(socket.id);
    const newFile = { ...fileInfo, username: user.username, userId: socket.id };
    io.emit('fileShare', newFile);
  });

  socket.on('startCall', () => {
    const user = users.get(socket.id);
    const callId = generateUniqueCallId();
    activeCallIds.set(callId, [socket.id]);
    socket.join(callId);
    socket.emit('callStarted', callId);
  });

  socket.on('joinCall', (callId) => {
    if (activeCallIds.has(callId)) {
      const participants = activeCallIds.get(callId);
      participants.push(socket.id);
      activeCallIds.set(callId, participants);
      socket.join(callId);
      socket.emit('callJoined', callId);
      socket.to(callId).emit('participantJoined', users.get(socket.id).username);
    } else {
      socket.emit('callError', 'Invalid call ID');
    }
  });

  socket.on('leaveCall', (callId) => {
    if (activeCallIds.has(callId)) {
      const participants = activeCallIds.get(callId);
      const index = participants.indexOf(socket.id);
      if (index > -1) {
        participants.splice(index, 1);
        socket.leave(callId);
        if (participants.length === 0) {
          activeCallIds.delete(callId);
        } else {
          activeCallIds.set(callId, participants);
          socket.to(callId).emit('participantLeft', users.get(socket.id).username);
        }
      }
    }
  });

  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      users.delete(socket.id);
      io.emit('userLeft', { userId: socket.id, username: user.username });
    }
  });
});

function generatePersonalCallId() {
  return Math.random().toString(36).substring(2, 10);
}

function generateUniqueCallId() {
  return Math.random().toString(36).substring(2, 10);
}

server.listen(PORT, () => {
  console.log(`Server v${VERSION} running on port ${PORT}`);
});