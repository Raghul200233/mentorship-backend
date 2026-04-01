import express from 'express'
import cors from 'cors'
import http from 'http'
import { Server } from 'socket.io'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import authRoutes from './routes/auth'
import sessionRoutes from './routes/sessions'
import { setupYjsServer } from './yjs-server'

dotenv.config()

const app = express()
const server = http.createServer(app)

// Allow all origins for Render
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}))

// Socket.io with proper configuration
const io = new Server(server, {
  cors: {
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
})

// Store active sessions
const sessions = new Map<string, Set<string>>()

// Socket.io connection handler
io.on('connection', (socket) => {
  const sessionId = socket.handshake.query.sessionId as string
  const userId = socket.handshake.query.userId as string
  
  if (!sessionId || !userId) {
    socket.disconnect()
    return
  }
  
  console.log(`✅ User ${userId} connected to session ${sessionId}`)
  
  // Add to session
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, new Set())
  }
  sessions.get(sessionId)!.add(userId)
  socket.join(sessionId)
  
  // Notify others
  socket.to(sessionId).emit('user-joined', { userId })
  
  // Chat messages
  socket.on('chat-message', ({ sessionId: sessId, message }) => {
    if (sessId !== sessionId) return
    console.log(`💬 Message in ${sessId}:`, message.text)
    io.to(sessionId).emit('chat-message', message)
  })
  
  // Code updates
  socket.on('code-update', ({ sessionId: sessId, code, language }) => {
    if (sessId !== sessionId) return
    socket.to(sessionId).emit('code-update', { code, language })
  })
  
  // WebRTC signaling
  socket.on('webrtc-offer', ({ sessionId: sessId, offer }) => {
    if (sessId !== sessionId) return
    console.log(`📞 Offer from ${userId}`)
    socket.to(sessId).emit('webrtc-offer', { offer, fromUserId: userId })
  })
  
  socket.on('webrtc-answer', ({ sessionId: sessId, answer }) => {
    if (sessId !== sessionId) return
    console.log(`📞 Answer from ${userId}`)
    socket.to(sessId).emit('webrtc-answer', { answer })
  })
  
  socket.on('webrtc-ice-candidate', ({ sessionId: sessId, candidate }) => {
    if (sessId !== sessionId) return
    socket.to(sessId).emit('webrtc-ice-candidate', { candidate })
  })
  
  socket.on('end-call', ({ sessionId: sessId }) => {
    if (sessId !== sessionId) return
    console.log(`📞 Call ended by ${userId}`)
    socket.to(sessId).emit('peer-ended-call')
  })
  
  socket.on('disconnect', () => {
    console.log(`❌ User ${userId} disconnected`)
    const sessionClients = sessions.get(sessionId)
    if (sessionClients) {
      sessionClients.delete(userId)
      if (sessionClients.size === 0) {
        sessions.delete(sessionId)
      }
    }
    socket.to(sessionId).emit('user-left', { userId })
  })
})

// Setup Yjs server for CRDT code sync
setupYjsServer(server)

// Validate environment variables
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing required environment variables')
  process.exit(1)
}

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

export { supabase }

app.use(express.json())

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/sessions', sessionRoutes)

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    yjs: 'running',
    socketio: 'running',
    activeSessions: sessions.size
  })
})

// Test database connection
app.get('/test-db', async (req, res) => {
  try {
    const { data, error } = await supabase.from('profiles').select('count')
    if (error) throw error
    res.json({ connected: true, message: 'Database connection successful' })
  } catch (error: any) {
    res.status(500).json({ connected: false, error: error.message })
  }
})

const PORT: number = parseInt(process.env.PORT || '10000', 10)

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Server running on port ${PORT}`)
  console.log(`📡 Socket.io server ready for chat/video`)
  console.log(`🔗 Yjs WebSocket server ready on ws://localhost:${PORT}/yjs`)
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}\n`)
})

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server')
  server.close(() => {
    console.log('HTTP server closed')
    process.exit(0)
  })
})