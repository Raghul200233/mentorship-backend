import { supabase } from '../config/database';

export interface IUser {
  id: string;
  email: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
  bio?: string;
  expertise: string[];
  is_mentor: boolean;
  is_available: boolean;
  mentor_rating: number;
  total_sessions: number;
  created_at: Date;
  updated_at: Date;
}

export class User {
  static async createUser(email: string, username: string, isMentor: boolean = false) {
    const { data, error } = await supabase
      .from('users')
      .insert({
        email: email,
        username: username,
        is_mentor: isMentor,
        expertise: []
      })
      .select()
      .single();
    
    if (error) throw error;
    return data as IUser;
  }

  static async getUserById(userId: string) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error) throw error;
    return data as IUser;
  }

  static async getUserByEmail(email: string) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (error) throw error;
    return data as IUser;
  }

  static async updateUser(userId: string, updates: Partial<IUser>) {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  static async getAllMentors() {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('is_mentor', true)
      .eq('is_available', true)
      .order('mentor_rating', { ascending: false });
    
    if (error) throw error;
    return data;
  }
}