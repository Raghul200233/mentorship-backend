import { supabase } from '../config/database';

export interface ISession {
  id: string;
  session_code: string;
  mentor_id: string;
  student_id?: string;
  title: string;
  description?: string;
  status: 'waiting' | 'active' | 'completed' | 'cancelled' | 'expired';
  code_content: string;
  language: string;
  topic?: string;
  started_at?: Date;
  ended_at?: Date;
  duration_minutes?: number;
  created_at: Date;
}

export class Session {
  static async create(mentorId: string, title: string = 'Mentorship Session', topic?: string) {
    const sessionCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const { data, error } = await supabase
      .from('sessions')
      .insert({
        session_code: sessionCode,
        mentor_id: mentorId,
        title: title,
        topic: topic,
        status: 'waiting',
        code_content: `// Welcome to your mentorship session!\n// Topic: ${topic || 'General Mentorship'}\n// Start coding here...\n\nfunction example() {\n  console.log("Let\'s learn together!");\n}\n`,
        language: 'javascript'
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  static async join(sessionCode: string, studentId: string) {
    const { data: session, error: findError } = await supabase
      .from('sessions')
      .select('*')
      .eq('session_code', sessionCode)
      .single();
    
    if (findError || !session) throw new Error('Session not found');
    if (session.status !== 'waiting') throw new Error('Session already active or ended');
    if (session.student_id) throw new Error('Session already has a student');

    const { data, error } = await supabase
      .from('sessions')
      .update({
        student_id: studentId,
        status: 'active',
        started_at: new Date().toISOString()
      })
      .eq('id', session.id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  static async updateCode(sessionId: string, code: string) {
    const { error } = await supabase
      .from('sessions')
      .update({ code_content: code })
      .eq('id', sessionId);
    
    if (error) throw error;
  }

  static async getSession(sessionId: string) {
    const { data, error } = await supabase
      .from('sessions')
      .select(`
        *,
        mentor:users!sessions_mentor_id_fkey(id, username, full_name, avatar_url),
        student:users!sessions_student_id_fkey(id, username, full_name, avatar_url)
      `)
      .eq('id', sessionId)
      .single();
    
    if (error) throw error;
    return data;
  }

  static async completeSession(sessionId: string, rating?: number, feedback?: string) {
    const { data, error } = await supabase
      .from('sessions')
      .update({
        status: 'completed',
        ended_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
}