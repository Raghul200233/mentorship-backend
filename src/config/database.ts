import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

// Validate environment variables
if (!supabaseUrl) {
  console.error('❌ SUPABASE_URL is not defined in .env file');
  console.error('Please create a .env file with SUPABASE_URL and SUPABASE_ANON_KEY');
  process.exit(1);
}

if (!supabaseKey) {
  console.error('❌ SUPABASE_ANON_KEY is not defined in .env file');
  console.error('Please create a .env file with SUPABASE_URL and SUPABASE_ANON_KEY');
  process.exit(1);
}

console.log('✅ Supabase URL configured:', supabaseUrl);
console.log('✅ Supabase Key configured');

export const supabase = createClient(supabaseUrl, supabaseKey);