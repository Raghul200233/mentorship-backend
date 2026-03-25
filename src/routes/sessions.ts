import { Router, Request, Response } from 'express'
import { supabase } from '../index'
import { verifyToken } from '../middleware/auth'

const router = Router()

interface AuthRequest extends Request {
  user?: any
}

router.get('/', verifyToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    console.log('📋 Fetching sessions for user:', req.user?.id)
    
    const { data: sessions, error } = await supabase
      .from('sessions')
      .select(`
        *,
        mentor:profiles!mentor_id(id, email, name, role),
        student:profiles!student_id(id, email, name, role)
      `)
      .or(`mentor_id.eq.${req.user?.id},student_id.eq.${req.user?.id}`)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('❌ Supabase error:', error)
      res.status(500).json({ error: 'Failed to fetch sessions', details: error.message })
      return
    }
    
    console.log(`✅ Found ${sessions?.length || 0} sessions`)
    res.json(sessions || [])
  } catch (error: any) {
    console.error('❌ Server error:', error)
    res.status(500).json({ error: 'Failed to fetch sessions', details: error.message })
  }
})

router.post('/', verifyToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    console.log('🚀 Creating session for mentor:', req.user?.id)
    
    // First, ensure profile exists
    const { data: existingProfile, error: profileCheckError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user?.id)
      .single()
    
    if (profileCheckError && profileCheckError.code !== 'PGRST116') {
      console.error('❌ Profile check error:', profileCheckError)
      res.status(500).json({ error: 'Failed to check profile', details: profileCheckError.message })
      return
    }
    
    // Create profile if it doesn't exist
    if (!existingProfile) {
      console.log('📝 Creating profile for user:', req.user?.id)
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: req.user?.id,
          email: req.user?.email,
          name: req.user?.email?.split('@')[0],
          role: req.user?.user_metadata?.role || 'mentor'
        })
      
      if (insertError) {
        console.error('❌ Failed to create profile:', insertError)
        res.status(500).json({ error: 'Failed to create user profile', details: insertError.message })
        return
      }
      console.log('✅ Profile created successfully')
    }
    
    // Create the session
    const { data: session, error } = await supabase
      .from('sessions')
      .insert({
        mentor_id: req.user?.id,
        status: 'waiting',
        code_content: '// Start coding here...\n\nfunction hello() {\n  console.log("Hello, World!");\n}'
      })
      .select()
      .single()

    if (error) {
      console.error('❌ Supabase error creating session:', error)
      res.status(500).json({ error: 'Failed to create session', details: error.message })
      return
    }
    
    // Generate shareable link
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
    const inviteLink = `${frontendUrl}/session/${session.id}`
    
    console.log('✅ Session created successfully:', session.id)
    console.log('🔗 Invite link:', inviteLink)
    
    res.json({ 
      ...session, 
      inviteLink 
    })
  } catch (error: any) {
    console.error('❌ Server error:', error)
    res.status(500).json({ error: 'Failed to create session', details: error.message })
  }
})

router.delete('/:id', verifyToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    console.log('🗑️ Deleting session:', req.params.id)
    
    // First, check if user has permission to delete (only mentor or admin)
    const { data: session, error: fetchError } = await supabase
      .from('sessions')
      .select('mentor_id')
      .eq('id', req.params.id)
      .single()
    
    if (fetchError) {
      console.error('❌ Error fetching session:', fetchError)
      res.status(404).json({ error: 'Session not found' })
      return
    }
    
    if (session.mentor_id !== req.user?.id) {
      res.status(403).json({ error: 'Only the mentor can delete this session' })
      return
    }
    
    // Delete all messages first (cascade should handle, but let's be explicit)
    await supabase
      .from('messages')
      .delete()
      .eq('session_id', req.params.id)
    
    // Delete the session
    const { error: deleteError } = await supabase
      .from('sessions')
      .delete()
      .eq('id', req.params.id)
    
    if (deleteError) {
      console.error('❌ Error deleting session:', deleteError)
      res.status(500).json({ error: 'Failed to delete session' })
      return
    }
    
    console.log('✅ Session deleted successfully')
    res.json({ message: 'Session deleted successfully' })
  } catch (error: any) {
    console.error('❌ Server error:', error)
    res.status(500).json({ error: 'Failed to delete session', details: error.message })
  }
})

router.get('/:id', verifyToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    console.log('🔍 Fetching session:', req.params.id)
    
    const { data: session, error } = await supabase
      .from('sessions')
      .select(`
        *,
        mentor:profiles!mentor_id(id, email, name, role),
        student:profiles!student_id(id, email, name, role),
        messages:messages(
          *,
          user:profiles(id, email, name)
        )
      `)
      .eq('id', req.params.id)
      .single()

    if (error) {
      console.error('❌ Supabase error:', error)
      res.status(500).json({ error: 'Failed to fetch session', details: error.message })
      return
    }
    
    if (!session) {
      res.status(404).json({ error: 'Session not found' })
      return
    }
    
    // Generate shareable link
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
    const inviteLink = `${frontendUrl}/session/${session.id}`
    
    console.log('✅ Session found')
    res.json({ ...session, inviteLink })
  } catch (error: any) {
    console.error('❌ Server error:', error)
    res.status(500).json({ error: 'Failed to fetch session', details: error.message })
  }
})

router.post('/:id/join', verifyToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    console.log('👥 User joining session:', req.params.id, 'User:', req.user?.id)
    
    // First, ensure profile exists for the joining user
    const { data: existingProfile, error: profileCheckError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user?.id)
      .single()
    
    if (profileCheckError && profileCheckError.code !== 'PGRST116') {
      console.error('❌ Profile check error:', profileCheckError)
      res.status(500).json({ error: 'Failed to check profile', details: profileCheckError.message })
      return
    }
    
    // Create profile if it doesn't exist
    if (!existingProfile) {
      console.log('📝 Creating profile for joining user:', req.user?.id)
      await supabase
        .from('profiles')
        .insert({
          id: req.user?.id,
          email: req.user?.email,
          name: req.user?.email?.split('@')[0],
          role: req.user?.user_metadata?.role || 'student'
        })
    }
    
    const { data: session, error } = await supabase
      .from('sessions')
      .update({
        student_id: req.user?.id,
        status: 'active'
      })
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) {
      console.error('❌ Supabase error:', error)
      res.status(500).json({ error: 'Failed to join session', details: error.message })
      return
    }
    
    console.log('✅ User joined session')
    res.json(session)
  } catch (error: any) {
    console.error('❌ Server error:', error)
    res.status(500).json({ error: 'Failed to join session', details: error.message })
  }
})

export default router