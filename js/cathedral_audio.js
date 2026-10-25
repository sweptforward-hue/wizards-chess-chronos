/**
 * CathedralAudio: Procedural Web Audio API sound generator for Gothic Cathedral Chess.
 */
export class CathedralAudio {
    constructor() {
        this.ctx = null;
        this.enabled = true;
    }

    init() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) this.ctx = new AudioCtx();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    playSelect() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(528, now);
        osc.frequency.exponentialRampToValueAtTime(660, now + 0.14);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.17);
    }

    playSlide() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(135, now);
        osc.frequency.exponentialRampToValueAtTime(82, now + 0.35);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.4);
    }

    playShatter() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        const impactOsc = this.ctx.createOscillator();
        const impactGain = this.ctx.createGain();
        impactOsc.type = 'sawtooth';
        impactOsc.frequency.setValueAtTime(120, now);
        impactOsc.frequency.exponentialRampToValueAtTime(32, now + 0.48);
        impactGain.gain.setValueAtTime(0.28, now);
        impactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        impactOsc.connect(impactGain);
        impactGain.connect(this.ctx.destination);
        impactOsc.start(now);
        impactOsc.stop(now + 0.52);

        const shardFreqs = [880, 1174, 1567, 2093, 2637];
        shardFreqs.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            const start = now + idx * 0.035;
            osc.frequency.setValueAtTime(freq + (Math.random() - 0.5) * 90, start);
            osc.frequency.exponentialRampToValueAtTime(freq * 0.65, start + 0.35);
            gain.gain.setValueAtTime(0.07, start);
            gain.gain.exponentialRampToValueAtTime(0.0008, start + 0.38);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(start);
            osc.stop(start + 0.4);
        });
    }

    playCheckFanfare() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const notes = [293.66, 349.23, 440.0, 587.33];
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + idx * 0.09);
            gain.gain.setValueAtTime(0.09, now + idx * 0.09);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.6);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + idx * 0.09);
            osc.stop(now + idx * 0.09 + 0.65);
        });
    }

    playCoinSpin() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const freqs = [1318.5, 1760, 2637, 3520];
        freqs.forEach((f, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, now + i * 0.045);
            gain.gain.setValueAtTime(0.06 / (i + 1), now + i * 0.045);
            gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.75);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + i * 0.045);
            osc.stop(now + 0.78);
        });
    }

    playCoinLand(isHeads) {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const chord = isHeads ? [587.33, 880, 1174.66] : [392, 349.23, 293.66];
        chord.forEach((f, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = isHeads ? 'triangle' : 'sine';
            osc.frequency.setValueAtTime(f, now + idx * 0.06);
            gain.gain.setValueAtTime(0.09, now + idx * 0.06);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.45);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + idx * 0.06);
            osc.stop(now + idx * 0.06 + 0.48);
        });
    }
}
