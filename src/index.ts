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

// ── Yjs WebSocket Server (code sync) ──────────────────────────────────────────
const yjsWss = new WebSocketServer({ server, path: '/yjs' })

// documents keyed by sessionId
const documents = new Map<string, Y.Doc>()
// clients keyed by sessionId → Set of WebSockets
const yjsClients = new Map<string, Set<any>>()

yjsWss.on('connection', (ws, req) => {
  const url = new URL(req.url!, `http://${req.headers.host}`)
  const sessionId = url.searchParams.get('sessionId')

  if (!sessionId) {
    console.log('❌ Yjs: no sessionId — closing')
    ws.close()
    return
  }

  console.log(`📝 Yjs connected — session: ${sessionId}`)

  // Register client under its sessionId
  if (!yjsClients.has(sessionId)) yjsClients.set(sessionId, new Set())
  yjsClients.get(sessionId)!.add(ws)

  // Get or create doc
  let doc = documents.get(sessionId)
  if (!doc) {
    doc = new Y.Doc()
    documents.set(sessionId, doc)
    console.log(`📄 New Yjs doc for session: ${sessionId}`)
  }

  // Send full current state to the new client
  const initialUpdate = Y.encodeStateAsUpdate(doc)
  ws.send(Buffer.from(initialUpdate))

  ws.on('message', (data: Buffer) => {
    try {
      const update = new Uint8Array(data)
      Y.applyUpdate(doc!, update)

      // ✅ Broadcast ONLY to clients in the SAME session (not all Yjs clients)
      const peers = yjsClients.get(sessionId)
      if (peers) {
        peers.forEach(client => {
          if (client !== ws && client.readyState === 1) {
            client.send(data)
          }
        })
      }
    } catch (err) {
      console.error('Yjs update error:', err)
    }
  })

  ws.on('close', () => {
    console.log(`📝 Yjs disconnected — session: ${sessionId}`)
    const peers = yjsClients.get(sessionId)
    if (peers) {
      peers.delete(ws)
      if (peers.size === 0) {
        yjsClients.delete(sessionId)
        const d = documents.get(sessionId)
        if (d) { d.destroy(); documents.delete(sessionId) }
        console.log(`🗑️  Yjs doc cleaned up — session: ${sessionId}`)
      }
    }
  })
})

console.log('✅ Yjs WebSocket server ready on /yjs')

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