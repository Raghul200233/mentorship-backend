import { Router, Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const router = Router()
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

router.post('/verify', async (req: Request, res: Response): Promise<void> => {
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
    
    res.json({ user })
  } catch (error) {
    console.error('Auth verification error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router