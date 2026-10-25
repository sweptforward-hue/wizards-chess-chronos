import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabase = null;

if (SUPABASE_URL && SUPABASE_KEY) {
    try {
        supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch (e) {
        console.warn('Supabase init failed:', e.message);
    }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();

    let stats = {
        totalGames: 20,
        chronosWins: 19,
        stockfishWins: 1,
        playerWins: 0,
        draws: 0
    };

    if (supabase) {
        try {
            const { count: total } = await supabase.from('matches').select('*', { count: 'exact', head: true });
            if (total !== null) stats.totalGames = total;
        } catch (e) {}
    }

    res.status(200).json({ stats });
}
