import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
    console.warn('[quiz-rpg] Missing Supabase env.', { url, hasKey: !!key });
}

export const supabase = createClient(url, key, {
    db: { schema: 'quiz' },      // 기본 스키마 quiz
    auth: { persistSession: true },
    global: { headers: { 'x-app': 'quiz-rpg' } }
});
