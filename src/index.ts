import express from 'express'
import cors from 'cors'
import http from 'http'
import { Server } from 'socket.io'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import authRoutes from './routes/auth'
import sessionRoutes from './routes/sessions'
import { setupSocket } from './socket'
import { setupYjsServer } from './yjs-server'

dotenv.config()

const app = express()
const server = http.createServer(app)

// Configure CORS for production
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  'https://mentorship-frontend.vercel.app',
  'https://mentorship-frontend-three-tau.vercel.app',
  'http://localhost:3000'
].filter(Boolean)

// Socket.io for chat and video signaling
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  },
  transports: ['websocket', 'polling']
})

// Setup Yjs server for CRDT code sync
setupYjsServer(server)

// Validate environment variables
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing required environment variables:')
  console.error('   SUPABASE_URL and SUPABASE_SERVICE_KEY are required')
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

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      console.log('Origin not allowed:', origin)
      callback(null, false)
    }
  },
  credentials: true
}))
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
    socketio: 'running'
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

// Socket.io setup (for chat and video)
setupSocket(io)

const PORT: number = parseInt(process.env.PORT || '3001', 10)

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Server running on port ${PORT}`)
  console.log(`📡 Socket.io server ready for chat/video`)
  console.log(`🔗 Yjs WebSocket server ready on ws://localhost:${PORT}/yjs`)
  console.log(`🗄️  Supabase URL: ${process.env.SUPABASE_URL}`)
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