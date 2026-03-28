import { Server, Socket } from 'socket.io'

interface CustomSocket extends Socket {
  sessionId?: string;
  userId?: string;
}

export function setupSocket(io: Server) {
  io.use((socket: CustomSocket, next) => {
    const sessionId = socket.handshake.query.sessionId as string;
    const userId = socket.handshake.query.userId as string;
    
    if (!sessionId || !userId) {
      return next(new Error('Invalid session'));
    }
    
    socket.sessionId = sessionId;
    socket.userId = userId;
    next();
  });

  io.on('connection', (socket: CustomSocket) => {
    const sessionId = socket.sessionId;
    const userId = socket.userId;
    
    if (!sessionId || !userId) {
      socket.disconnect();
      return;
    }
    
    console.log(`✅ User ${userId} connected to session ${sessionId}`);
    socket.join(sessionId);
    
    // Notify others that user joined
    socket.to(sessionId).emit('user-joined', { userId });
    
    // Chat messages
    socket.on('chat-message', ({ sessionId: sessId, message }) => {
      if (sessId !== sessionId) return;
      console.log(`💬 Message in ${sessId}:`, message.text);
      io.to(sessionId).emit('chat-message', message);
    });
    
    // Code updates
    socket.on('code-update', ({ sessionId: sessId, code, language }) => {
      if (sessId !== sessionId) return;
      socket.to(sessionId).emit('code-update', { code, language });
    });
    
    // WebRTC - Offer
    socket.on('webrtc-offer', ({ sessionId: sessId, offer }) => {
      if (sessId !== sessionId) return;
      console.log(`📞 Offer from ${userId}`);
      socket.to(sessId).emit('webrtc-offer', { offer, fromUserId: userId });
    });
    
    // WebRTC - Answer
    socket.on('webrtc-answer', ({ sessionId: sessId, answer }) => {
      if (sessId !== sessionId) return;
      console.log(`📞 Answer from ${userId}`);
      socket.to(sessId).emit('webrtc-answer', { answer });
    });
    
    // WebRTC - ICE Candidate
    socket.on('webrtc-ice-candidate', ({ sessionId: sessId, candidate }) => {
      if (sessId !== sessionId) return;
      socket.to(sessId).emit('webrtc-ice-candidate', { candidate });
    });
    
    // End call
    socket.on('end-call', ({ sessionId: sessId }) => {
      if (sessId !== sessionId) return;
      console.log(`📞 Call ended by ${userId}`);
      socket.to(sessId).emit('peer-ended-call');
    });
    
    socket.on('disconnect', () => {
      console.log(`❌ User ${userId} disconnected from session ${sessionId}`);
      socket.to(sessionId).emit('user-left', { userId });
    });
  });
}