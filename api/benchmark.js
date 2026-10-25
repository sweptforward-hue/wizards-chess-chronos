export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();

    res.status(200).json({
        summary: {
            total_games: 20,
            chronos_wins: 19,
            stockfish_wins: 1,
            draws: 0,
            win_rate_pct: 95.0,
            time_control_sec: 0.1,
            snowball_cap: 2,
            passed: true
        }
    });
}
