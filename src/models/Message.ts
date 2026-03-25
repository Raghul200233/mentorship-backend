import { supabase } from '../config/database';

export interface IMessage {
  id: string;
  session_id: string;
  user_id: string;
  content: string;
  message_type: 'text' | 'code' | 'file' | 'system';
  created_at: Date;
}

export class Message {
  static async createMessage(sessionId: string, userId: string, content: string, type: string = 'text') {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        session_id: sessionId,
        user_id: userId,
        content: content,
        message_type: type
      })
      .select(`
        *,
        user:users!messages_user_id_fkey(id, username, full_name, avatar_url)
      `)
      .single();
    
    if (error) throw error;
    return data;
  }

  static async getSessionMessages(sessionId: string, limit: number = 100) {
    const { data, error } = await supabase
      .from('messages')
      .select(`
        *,
        user:users!messages_user_id_fkey(id, username, full_name, avatar_url)
      `)
      .eq('session_id', sessionId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
      .limit(limit);
    
    if (error) throw error;
    return data;
  }
}