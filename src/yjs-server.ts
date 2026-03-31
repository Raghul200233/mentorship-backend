import { WebSocketServer } from 'ws'
import * as Y from 'yjs'
import { setupWSConnection } from 'y-websocket/bin/utils'

export function setupYjsServer(server: any) {
  const wss = new WebSocketServer({ 
    server,
    path: '/yjs'
  })
  
  wss.on('connection', (conn, req) => {
    // Extract session ID from URL
    const url = new URL(req.url!, `http://${req.headers.host}`)
    const sessionId = url.searchParams.get('sessionId')
    
    console.log(`📝 Yjs client connected for session: ${sessionId || 'default'}`)
    
    // Setup Yjs connection with persistence
    setupWSConnection(conn, req, {
      gc: true,                    // Garbage collection
      docName: sessionId || 'default',
      callback: (update: any) => {
        // Optional: Save updates to database for persistence
        console.log(`📝 Update received for session: ${sessionId}`)
      }
    })
    
    conn.on('close', () => {
      console.log(`❌ Yjs client disconnected for session: ${sessionId}`)
    })
  })
  
  console.log('✅ Yjs WebSocket server running on /yjs')
  
  return wss
}