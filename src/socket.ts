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
      console.log('Missing sessionId or userId');
      socket.disconnect();
      return;
    }
    
    console.log(`✅ User ${userId} connected to session ${sessionId}`);
    socket.join(sessionId);
    
    // Handle chat messages
    socket.on('chat-message', ({ sessionId: sessId, message }) => {
      try {
        if (sessId !== sessionId) return;
        console.log(`💬 Message in session ${sessId}:`, message.text);
        io.to(sessionId).emit('chat-message', message);
      } catch (error) {
        console.error('Chat message error:', error);
      }
    });
    
    // Handle code updates
    socket.on('code-update', ({ sessionId: sessId, code, language }) => {
      try {
        if (sessId !== sessionId) return;
        socket.to(sessionId).emit('code-update', { code, language });
      } catch (error) {
        console.error('Code update error:', error);
      }
    });
    
    // WebRTC signaling
    socket.on('webrtc-offer', ({ sessionId: sessId, offer }) => {
      try {
        console.log(`📞 Offer from ${userId} in session ${sessId}`);
        socket.to(sessId).emit('webrtc-offer', { offer, fromUserId: userId });
      } catch (error) {
        console.error('WebRTC offer error:', error);
      }
    });
    
    socket.on('webrtc-answer', ({ sessionId: sessId, answer }) => {
      try {
        console.log(`📞 Answer from ${userId} in session ${sessId}`);
        socket.to(sessId).emit('webrtc-answer', { answer });
      } catch (error) {
        console.error('WebRTC answer error:', error);
      }
    });
    
    socket.on('webrtc-ice-candidate', ({ sessionId: sessId, candidate }) => {
      try {
        socket.to(sessId).emit('webrtc-ice-candidate', { candidate });
      } catch (error) {
        console.error('WebRTC ICE candidate error:', error);
      }
    });
    
    // Handle end call - only notify peer
    socket.on('end-call', ({ sessionId: sessId }) => {
      try {
        console.log(`📞 Call ended by ${userId} in session ${sessId}`);
        socket.to(sessId).emit('peer-ended-call');
      } catch (error) {
        console.error('End call error:', error);
      }
    });
    
    socket.on('disconnect', () => {
      console.log(`❌ User ${userId} disconnected from session ${sessionId}`);
    });
  });
}