export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();

    res.status(200).json({
        status: 'ok',
        platform: 'Vercel Serverless',
        engine: 'Chronos-Expectiminimax-v1.0',
        stockfishWinRate: '95.0%',
        timestamp: new Date().toISOString()
    });
}
