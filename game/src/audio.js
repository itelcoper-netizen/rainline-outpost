// Fully synthesized Web Audio: rain, wind, thunder, gunfire, hits, reloads,
// UI stingers. No audio files anywhere.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.rainGain = null;
    this.rainFilter = null;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    this.startRain();
    this.startWind();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }

  noiseBuffer(seconds = 2) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  startRain() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(3);
    src.loop = true;
    this.rainFilter = this.ctx.createBiquadFilter();
    this.rainFilter.type = 'bandpass';
    this.rainFilter.frequency.value = 1400;
    this.rainFilter.Q.value = 0.4;
    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = 0.10;
    src.connect(this.rainFilter).connect(this.rainGain).connect(this.master);
    src.start();
    // Slow swell so the rain breathes.
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain).connect(this.rainGain.gain);
    lfo.start();
  }

  startWind() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(4);
    src.loop = true;
    src.playbackRate.value = 0.5;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 320;
    const g = this.ctx.createGain(); g.gain.value = 0.05;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  burst({ duration = 0.2, freq = 800, type = 'lowpass', gain = 0.5, when = 0, decay = null }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(Math.max(duration, 0.1));
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (decay ?? duration));
    src.connect(f).connect(g).connect(this.master);
    src.start(t); src.stop(t + (decay ?? duration) + 0.05);
  }

  tone({ freq = 440, to = null, duration = 0.1, type = 'sine', gain = 0.2, when = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + duration + 0.05);
  }

  shot() {
    this.burst({ duration: 0.14, freq: 2600, type: 'highpass', gain: 0.55 });
    this.tone({ freq: 150, to: 55, duration: 0.12, type: 'sine', gain: 0.5 });
    this.burst({ duration: 0.3, freq: 500, gain: 0.18 });
  }

  enemyShot(distance = 20) {
    const att = Math.max(0.06, 0.4 - distance * 0.008);
    this.burst({ duration: 0.12, freq: 1800, type: 'highpass', gain: att });
    this.tone({ freq: 120, to: 50, duration: 0.1, type: 'sine', gain: att * 0.7 });
  }

  thunder(delay = 0.4, strength = 1) {
    this.burst({ duration: 2.2, freq: 140, gain: 0.55 * strength, when: delay, decay: 2.4 });
    this.burst({ duration: 0.7, freq: 400, gain: 0.3 * strength, when: delay });
  }

  hit(head = false) {
    this.tone({ freq: head ? 1900 : 1300, duration: 0.06, type: 'square', gain: 0.16 });
  }

  kill() {
    this.tone({ freq: 520, to: 780, duration: 0.12, type: 'triangle', gain: 0.22 });
    this.tone({ freq: 780, to: 1040, duration: 0.14, type: 'triangle', gain: 0.18, when: 0.1 });
  }

  reload() {
    this.tone({ freq: 900, duration: 0.04, type: 'square', gain: 0.12 });
    this.tone({ freq: 600, duration: 0.04, type: 'square', gain: 0.12, when: 0.35 });
    this.tone({ freq: 1100, duration: 0.05, type: 'square', gain: 0.14, when: 0.85 });
  }

  dryFire() { this.tone({ freq: 1400, duration: 0.03, type: 'square', gain: 0.1 }); }

  hurt() {
    this.tone({ freq: 220, to: 140, duration: 0.18, type: 'sawtooth', gain: 0.14 });
  }

  pickup() {
    this.tone({ freq: 660, duration: 0.08, type: 'sine', gain: 0.18 });
    this.tone({ freq: 990, duration: 0.1, type: 'sine', gain: 0.18, when: 0.08 });
  }

  alert() {
    this.tone({ freq: 440, to: 620, duration: 0.16, type: 'square', gain: 0.08 });
  }

  win() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone({ freq: f, duration: 0.22, type: 'triangle', gain: 0.2, when: i * 0.14 }));
  }

  lose() {
    [392, 330, 262, 196].forEach((f, i) => this.tone({ freq: f, duration: 0.3, type: 'triangle', gain: 0.18, when: i * 0.18 }));
  }
}
