import express from 'express'
import cors from 'cors'
import http from 'http'
import { Server } from 'socket.io'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import authRoutes from './routes/auth'
import sessionRoutes from './routes/sessions'

dotenv.config()

const app = express()
const server = http.createServer(app)

// CORS
app.use(cors({
  origin: '*',
  credentials: true
}))

// Socket.io
const io = new Server(server, {
  cors: {
    origin: '*',
    credentials: true
  },
  transports: ['websocket', 'polling']
})

// Store active users
const activeUsers = new Map()

// Socket connection
io.on('connection', (socket) => {
  const sessionId = socket.handshake.query.sessionId as string
  const userId = socket.handshake.query.userId as string
  
  console.log(`✅ User ${userId} connected to session ${sessionId}`)
  
  // Store user
  activeUsers.set(socket.id, { userId, sessionId })
  socket.join(sessionId)
  
  // Notify others
  socket.to(sessionId).emit('user-joined', { userId })
  
  // Chat messages
  socket.on('chat-message', ({ sessionId: sessId, message }) => {
    console.log(`💬 Message:`, message.text)
    io.to(sessId).emit('chat-message', message)
  })
  
  // WebRTC Offer
  socket.on('webrtc-offer', ({ sessionId: sessId, offer }) => {
    console.log(`📞 Offer from ${userId}`)
    socket.to(sessId).emit('webrtc-offer', { offer, fromUserId: userId })
  })
  
  // WebRTC Answer
  socket.on('webrtc-answer', ({ sessionId: sessId, answer }) => {
    console.log(`📞 Answer from ${userId}`)
    socket.to(sessId).emit('webrtc-answer', { answer })
  })
  
  // ICE Candidate
  socket.on('webrtc-ice-candidate', ({ sessionId: sessId, candidate }) => {
    console.log(`📡 ICE candidate from ${userId}`)
    socket.to(sessId).emit('webrtc-ice-candidate', { candidate })
  })
  
  // End call
  socket.on('end-call', ({ sessionId: sessId }) => {
    console.log(`📞 Call ended by ${userId}`)
    socket.to(sessId).emit('peer-ended-call')
  })
  
  // Disconnect
  socket.on('disconnect', () => {
    console.log(`❌ User ${userId} disconnected`)
    activeUsers.delete(socket.id)
    socket.to(sessionId).emit('user-left', { userId })
  })
})

// Validate environment
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)
export { supabase }

app.use(express.json())
app.use('/api/auth', authRoutes)
app.use('/api/sessions', sessionRoutes)

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

const PORT = parseInt(process.env.PORT || '10000', 10)

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Server running on port ${PORT}`)
  console.log(`📡 Socket.io ready\n`)
})