import express from 'express'
import cors from 'cors'
import http from 'http'
import { Server } from 'socket.io'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const server = http.createServer(app)

// Basic CORS configuration
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  'https://mentorship-frontend.vercel.app',
  'http://localhost:3000'
].filter(Boolean)

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  },
  transports: ['websocket', 'polling']
})

// Middleware
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}))
app.use(express.json())

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    message: 'Server is running'
  })
})

// Simple test endpoint
app.get('/test', (req, res) => {
  res.json({ message: 'Backend is working!' })
})

// WebSocket connection handler
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id)
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id)
  })
})

const PORT = parseInt(process.env.PORT || '3001', 10)

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Server running on port ${PORT}`)
  console.log(`📡 WebSocket server ready`)
  console.log(`🔗 Health check: http://localhost:${PORT}/health`)
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