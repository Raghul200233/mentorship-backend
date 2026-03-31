import { WebSocketServer } from 'ws'
import * as Y from 'yjs'

export function setupYjsServer(server: any) {
  const wss = new WebSocketServer({ 
    server,
    path: '/yjs'
  })
  
  // Store documents by session ID
  const documents = new Map<string, Y.Doc>()
  // Store clients by session ID
  const clients = new Map<string, Set<any>>()
  
  wss.on('connection', (ws, req) => {
    // Extract session ID from URL
    const url = new URL(req.url!, `http://${req.headers.host}`)
    const sessionId = url.searchParams.get('sessionId') || 'default'
    
    console.log(`📝 Yjs client connected for session: ${sessionId}`)
    
    // Add client to session group
    if (!clients.has(sessionId)) {
      clients.set(sessionId, new Set())
    }
    clients.get(sessionId)!.add(ws)
    
    // Get or create document for this session
    let ydoc = documents.get(sessionId)
    if (!ydoc) {
      ydoc = new Y.Doc()
      documents.set(sessionId, ydoc)
      console.log(`📄 Created new document for session: ${sessionId}`)
    }
    
    // Send initial document state to new client
    try {
      const update = Y.encodeStateAsUpdate(ydoc)
      ws.send(update)
    } catch (err) {
      console.error('Error sending initial state:', err)
    }
    
    // Handle updates from client
    ws.on('message', (data: Buffer) => {
      try {
        // Convert Buffer to Uint8Array
        const updateData = new Uint8Array(data)
        
        // Apply update to local document
        Y.applyUpdate(ydoc!, updateData)
        
        // Broadcast to all other clients in same session
        const sessionClients = clients.get(sessionId)
        if (sessionClients) {
          sessionClients.forEach((client) => {
            if (client !== ws && client.readyState === 1) {
              client.send(data)
            }
          })
        }
      } catch (err) {
        console.error('Error processing update:', err)
      }
    })
    
    // Handle client disconnect
    ws.on('close', () => {
      console.log(`❌ Yjs client disconnected for session: ${sessionId}`)
      
      // Remove from clients set
      const sessionClients = clients.get(sessionId)
      if (sessionClients) {
        sessionClients.delete(ws)
        
        // Clean up if no more clients
        if (sessionClients.size === 0) {
          clients.delete(sessionId)
          const doc = documents.get(sessionId)
          if (doc) {
            doc.destroy()
            documents.delete(sessionId)
            console.log(`🗑️ Cleaned up document for session: ${sessionId}`)
          }
        }
      }
    })
  })
  
  console.log('✅ Yjs WebSocket server running on /yjs')
  
  return wss
}