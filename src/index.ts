import express from 'express'
import cors from 'cors'
import http from 'http'
import { Server } from 'socket.io'
import { WebSocketServer } from 'ws'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import authRoutes from './routes/auth'
import sessionRoutes from './routes/sessions'

// y-websocket server utilities (CommonJS module)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { setupWSConnection } = require('y-websocket/bin/utils')

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

// ── Yjs WebSocket Server — uses y-websocket's official CRDT protocol ─────────
// noServer:true lets us intercept only /yjs/* upgrade requests
// so socket.io continues to handle /socket.io/* upgrades independently.
const yjsWss = new WebSocketServer({ noServer: true })

yjsWss.on('connection', (ws: any, req: any) => {
  // setupWSConnection uses req.url to key the Y.Doc (one doc per unique path)
  // e.g. /yjs/<sessionId> → doc name 'yjs/<sessionId>'
  console.log(`📝 Yjs connected — ${req.url}`)
  setupWSConnection(ws, req, { gc: true })
})

// Route HTTP upgrade requests: /yjs/* → yjsWss, everything else → socket.io
server.on('upgrade', (req: any, socket: any, head: any) => {
  const pathname = req.url?.split('?')[0] ?? ''
  if (pathname.startsWith('/yjs')) {
    yjsWss.handleUpgrade(req, socket, head, (ws: any) => {
      yjsWss.emit('connection', ws, req)
    })
  }
  // socket.io manages its own upgrade listener for /socket.io/* paths
})

console.log('✅ Yjs WebSocket server ready on /yjs/<sessionId>')

// ── Socket.io — chat & WebRTC signalling ─────────────────────────────────────
const sessions = new Map<string, Set<string>>()

io.on('connection', (socket) => {
  const sessionId = socket.handshake.query.sessionId as string
  const userId    = socket.handshake.query.userId    as string

  if (!sessionId || !userId) {
    console.log('❌ Socket: missing sessionId or userId — closing')
    socket.disconnect()
    return
  }

  console.log(`✅ User ${userId} joined session ${sessionId}`)
  socket.join(sessionId)

  if (!sessions.has(sessionId)) sessions.set(sessionId, new Set())
  sessions.get(sessionId)!.add(userId)

  // Notify other users in the room
  socket.to(sessionId).emit('user-joined', { userId })

  // ── Chat ─────────────────────────────────────────────────────────────────
  socket.on('chat-message', ({ message }) => {
    console.log(`💬 [${sessionId}] ${userId}: ${message?.text}`)
    // Broadcast to everyone in the session room (including sender so they get confirmation)
    io.to(sessionId).emit('chat-message', message)
  })

  // ── WebRTC signalling ─────────────────────────────────────────────────────
  socket.on('webrtc-offer', ({ offer }) => {
    console.log(`📞 Offer: ${userId} → room ${sessionId}`)
    socket.to(sessionId).emit('webrtc-offer', { offer, fromUserId: userId })
  })

  socket.on('webrtc-answer', ({ answer }) => {
    console.log(`📞 Answer: ${userId} → room ${sessionId}`)
    socket.to(sessionId).emit('webrtc-answer', { answer })
  })

  socket.on('webrtc-ice-candidate', ({ candidate }) => {
    socket.to(sessionId).emit('webrtc-ice-candidate', { candidate })
  })

  socket.on('end-call', () => {
    console.log(`📞 Call ended by ${userId}`)
    socket.to(sessionId).emit('peer-ended-call')
  })

  socket.on('disconnect', (reason) => {
    console.log(`❌ User ${userId} disconnected (${reason})`)
    sessions.get(sessionId)?.delete(userId)
    if ((sessions.get(sessionId)?.size ?? 0) === 0) sessions.delete(sessionId)
    socket.to(sessionId).emit('user-left', { userId })
  })
})

// ── Supabase ──────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)
export { supabase }

app.use(express.json())
app.use('/api/auth', authRoutes)
app.use('/api/sessions', sessionRoutes)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', yjs: 'running', socketio: 'running' })
})

const PORT = parseInt(process.env.PORT || '10000', 10)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Server on port ${PORT}`)
  console.log(`📡 Socket.io ready`)
  console.log(`🔗 Yjs WS on ws://0.0.0.0:${PORT}/yjs?sessionId=xxx\n`)
})