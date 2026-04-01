import express from 'express'
import cors from 'cors'
import http from 'http'
import { Server } from 'socket.io'
import { WebSocketServer } from 'ws'
import * as Y from 'yjs'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import authRoutes from './routes/auth'
import sessionRoutes from './routes/sessions'

dotenv.config()

const app = express()
const server = http.createServer(app)

// CORS
app.use(cors({ origin: '*', credentials: true }))

// Socket.io for chat and video
const io = new Server(server, {
  cors: { origin: '*', credentials: true },
  transports: ['websocket', 'polling']
})

// Yjs WebSocket Server for code sync
const yjsWss = new WebSocketServer({ server, path: '/yjs' })
const documents = new Map<string, Y.Doc>()

yjsWss.on('connection', (ws, req) => {
  const url = new URL(req.url!, `http://${req.headers.host}`)
  const sessionId = url.searchParams.get('sessionId') || 'default'
  
  console.log(`📝 Yjs connected for session: ${sessionId}`)
  
  let doc = documents.get(sessionId)
  if (!doc) {
    doc = new Y.Doc()
    documents.set(sessionId, doc)
  }
  
  // Send initial state
  ws.send(Buffer.from(Y.encodeStateAsUpdate(doc)))
  
  ws.on('message', (data: Buffer) => {
    try {
      const update = new Uint8Array(data)
      Y.applyUpdate(doc!, update)
      
      // Broadcast to all other clients
      yjsWss.clients.forEach(client => {
        if (client !== ws && client.readyState === 1) {
          client.send(data)
        }
      })
    } catch (err) {
      console.error('Yjs error:', err)
    }
  })
  
  ws.on('close', () => {
    console.log(`📝 Yjs disconnected for session: ${sessionId}`)
    if (yjsWss.clients.size === 0) {
      documents.delete(sessionId)
    }
  })
})

// Socket.io handlers for chat and video
const sessions = new Map()

io.on('connection', (socket) => {
  const sessionId = socket.handshake.query.sessionId as string
  const userId = socket.handshake.query.userId as string
  
  if (!sessionId || !userId) return
  
  console.log(`✅ User ${userId} connected to ${sessionId}`)
  socket.join(sessionId)
  
  if (!sessions.has(sessionId)) sessions.set(sessionId, new Set())
  sessions.get(sessionId).add(userId)
  socket.to(sessionId).emit('user-joined', { userId })
  
  // Chat
  socket.on('chat-message', ({ message }) => {
    console.log(`💬 ${message.text}`)
    io.to(sessionId).emit('chat-message', message)
  })
  
  // Code updates (fallback, YJS handles main sync)
  socket.on('code-update', ({ code, language }) => {
    socket.to(sessionId).emit('code-update', { code, language })
  })
  
  // WebRTC
  socket.on('webrtc-offer', ({ offer }) => {
    console.log(`📞 Offer from ${userId}`)
    socket.to(sessionId).emit('webrtc-offer', { offer, fromUserId: userId })
  })
  
  socket.on('webrtc-answer', ({ answer }) => {
    console.log(`📞 Answer from ${userId}`)
    socket.to(sessionId).emit('webrtc-answer', { answer })
  })
  
  socket.on('webrtc-ice-candidate', ({ candidate }) => {
    socket.to(sessionId).emit('webrtc-ice-candidate', { candidate })
  })
  
  socket.on('end-call', () => {
    socket.to(sessionId).emit('peer-ended-call')
  })
  
  socket.on('disconnect', () => {
    console.log(`❌ User ${userId} disconnected`)
    sessions.get(sessionId)?.delete(userId)
    if (sessions.get(sessionId)?.size === 0) sessions.delete(sessionId)
    socket.to(sessionId).emit('user-left', { userId })
  })
})

// Supabase
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)
export { supabase }

app.use(express.json())
app.use('/api/auth', authRoutes)
app.use('/api/sessions', sessionRoutes)

app.get('/health', (req, res) => {
  res.json({ status: 'ok', yjs: 'running', socketio: 'running' })
})

const PORT = parseInt(process.env.PORT || '10000', 10)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Server running on port ${PORT}`)
  console.log(`📡 Socket.io ready`)
  console.log(`🔗 Yjs WebSocket ready on /yjs\n`)
})