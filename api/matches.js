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

// In-memory cache for serverless invocation
let memoryMatches = [];

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'GET') {
        if (supabase) {
            try {
                const { data, error } = await supabase.from('matches').select('*').order('created_at', { ascending: false }).limit(50);
                if (!error && data) return res.status(200).json(data);
            } catch (err) {
                console.warn('Supabase fetch failed:', err.message);
            }
        }
        return res.status(200).json(memoryMatches.slice(-50).reverse());
    }

    if (req.method === 'POST') {
        const { playerWhite, playerBlack, winner, reason, plies, bonusTurns, setupMode, moves } = req.body || {};
        const matchRecord = {
            id: 'match_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            player_white: playerWhite || 'Marble Player',
            player_black: playerBlack || 'Chronos Grandmaster',
            winner: winner || 'Draw',
            reason: reason || 'Normal',
            plies: plies || 0,
            bonus_turns: bonusTurns || 0,
            setup_mode: setupMode || 'standard',
            moves: moves || [],
            created_at: new Date().toISOString()
        };

        if (supabase) {
            try {
                await supabase.from('matches').insert([matchRecord]);
            } catch (err) {
                console.warn('Supabase insert failed:', err.message);
            }
        }

        memoryMatches.push(matchRecord);
        return res.status(201).json({ success: true, match: matchRecord });
    }

    res.status(405).json({ error: 'Method not allowed' });
}
