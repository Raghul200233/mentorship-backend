import { Server as SocketServer, Socket } from 'socket.io';
import { Session } from '../models/Session';
import { Message } from '../models/Message';

export class SocketService {
  private io: SocketServer;

  constructor(io: SocketServer) {
    this.io = io;
    this.setupListeners();
  }

  private setupListeners() {
    this.io.on('connection', (socket: Socket) => {
      console.log('User connected:', socket.id);

      socket.on('join-session', async (data: { sessionId: string, userId: string, username: string }) => {
        const { sessionId, userId, username } = data;
        
        socket.join(sessionId);
        console.log(`User ${username} (${userId}) joined session ${sessionId}`);
        
        // Send current code to the new user
        const session = await Session.getSession(sessionId);
        socket.emit('code-update', { code: session.code_content });
        
        // Load previous messages
        const messages = await Message.getSessionMessages(sessionId);
        socket.emit('load-messages', messages);
        
        // Notify others
        socket.to(sessionId).emit('user-joined', { userId, username });
      });

      socket.on('code-change', async (data: { sessionId: string, code: string, userId: string }) => {
        const { sessionId, code, userId } = data;
        await Session.updateCode(sessionId, code);
        socket.to(sessionId).emit('code-update', { code, userId });
      });

      socket.on('send-message', async (data: { sessionId: string, message: any }) => {
        const { sessionId, message } = data;
        // Save message to database
        await Message.createMessage(sessionId, message.userId, message.content);
        this.io.to(sessionId).emit('new-message', message);
      });

      socket.on('webrtc-signal', (data: { sessionId: string, signal: any }) => {
        const { sessionId, signal } = data;
        socket.to(sessionId).emit('webrtc-signal', signal);
      });

      socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
      });
    });
  }
}