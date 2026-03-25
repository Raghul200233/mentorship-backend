import { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function verifyToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    
    if (!token) {
      res.status(401).json({ error: 'No token provided' })
      return
    }
    
    const { data: { user }, error } = await supabase.auth.getUser(token)
    
    if (error || !user) {
      res.status(401).json({ error: 'Invalid token' })
      return
    }
    
    (req as any).user = user
    next()
  } catch (error) {
    console.error('Auth middleware error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}