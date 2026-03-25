import { supabase } from '../config/database';
import crypto from 'crypto';

export class CodeSnapshot {
  static async createSnapshot(
    sessionId: string, 
    userId: string, 
    code: string, 
    language: string,
    type: 'auto' | 'manual' | 'checkpoint' = 'auto'
  ) {
    const hash = crypto.createHash('sha256').update(code).digest('hex');
    const lineCount = code.split('\n').length;
    const charCount = code.length;

    const { data, error } = await supabase
      .from('code_snapshots')
      .insert({
        session_id: sessionId,
        user_id: userId,
        code_content: code,
        language: language,
        snapshot_type: type,
        line_count: lineCount,
        character_count: charCount,
        hash: hash
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
}