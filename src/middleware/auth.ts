import { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function verifyToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization
    
    if (!authHeader) {
      console.log('No authorization header')
      res.status(401).json({ error: 'No token provided' })
      return
    }
    
    const token = authHeader.replace('Bearer ', '')
    
    if (!token) {
      console.log('Invalid token format')
      res.status(401).json({ error: 'Invalid token format' })
      return
    }
    
    console.log('Verifying token:', token.substring(0, 20) + '...')
    
    const { data: { user }, error } = await supabase.auth.getUser(token)
    
    if (error) {
      console.error('Token verification error:', error.message)
      res.status(401).json({ error: 'Invalid token', details: error.message })
      return
    }
    
    if (!user) {
      console.log('No user found for token')
      res.status(401).json({ error: 'User not found' })
      return
    }
    
    console.log('Token verified for user:', user.id);
    (req as any).user = user;
    next();
  } catch (error: any) {
    console.error('Auth middleware error:', error)
    res.status(500).json({ error: 'Internal server error', details: error.message })
  }
}