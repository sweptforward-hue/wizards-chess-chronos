/**
 * Chronos Engine Web Worker
 * Offloads stochastic Expectiminimax search from the main thread,
 * ensuring flawless 60 FPS Three.js rendering during AI thinking.
 */

import { ChronosEngine } from './chronos_engine.js';

const engine = new ChronosEngine();

self.onmessage = function (e) {
    const { type, payload } = e.data;

    if (type === 'CALCULATE_MOVE') {
        const { board, color, consecutiveBonus, snowballCap, maxTimeMs } = payload;
        try {
            const result = engine.getBestMove(board, color, consecutiveBonus, snowballCap, maxTimeMs);
            self.postMessage({
                type: 'MOVE_READY',
                payload: result
            });
        } catch (err) {
            self.postMessage({
                type: 'ERROR',
                payload: err.message
            });
        }
    }
};
