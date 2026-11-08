// Fully synthesized audio: no sound files needed.
export class Audio {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0;
    this.musicBus.connect(this.master);
    this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbience();
    this.startMusic();
  }

  get t() { return this.ctx.currentTime; }

  noise({ dur = 0.2, freq = 1200, q = 1, type = 'bandpass', gain = 0.5, attack = 0.005, sweep = 0 } = {}) {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, this.t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), this.t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, this.t);
    g.gain.exponentialRampToValueAtTime(gain, this.t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, this.t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(this.t, Math.random());
    src.stop(this.t + dur + 0.05);
  }

  tone({ freq = 220, to = null, dur = 0.3, type = 'sine', gain = 0.3, attack = 0.01 } = {}) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, this.t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, this.t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, this.t);
    g.gain.exponentialRampToValueAtTime(gain, this.t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, this.t + dur);
    o.connect(g).connect(this.sfx);
    o.start();
    o.stop(this.t + dur + 0.05);
  }

  swing(heavy = false) { this.noise({ dur: heavy ? 0.35 : 0.22, freq: heavy ? 700 : 1400, sweep: 0.4, q: 0.8, gain: 0.35 }); }
  hit() {
    this.noise({ dur: 0.18, freq: 500, type: 'lowpass', gain: 0.8 });
    this.noise({ dur: 0.25, freq: 2600, q: 2, gain: 0.25, sweep: 0.5 });
    this.tone({ freq: 90, to: 40, dur: 0.2, gain: 0.5 });
  }
  hurt() { this.noise({ dur: 0.3, freq: 300, type: 'lowpass', gain: 0.9 }); this.tone({ freq: 140, to: 60, dur: 0.3, type: 'sawtooth', gain: 0.15 }); }
  roll() { this.noise({ dur: 0.35, freq: 400, type: 'lowpass', gain: 0.35, attack: 0.05 }); }
  step() { this.noise({ dur: 0.08, freq: 900, gain: 0.07 }); }
  heal() { this.tone({ freq: 330, to: 660, dur: 0.6, gain: 0.15 }); this.noise({ dur: 0.5, freq: 3000, q: 4, gain: 0.08 }); }
  shatter() { this.noise({ dur: 0.4, freq: 3500, q: 1.5, gain: 0.4 }); this.noise({ dur: 0.5, freq: 600, type: 'lowpass', gain: 0.3 }); }
  screech() { this.tone({ freq: 700, to: 300, dur: 0.5, type: 'sawtooth', gain: 0.08 }); this.noise({ dur: 0.5, freq: 1800, q: 6, gain: 0.15, sweep: 0.6 }); }
  roar() {
    this.tone({ freq: 110, to: 45, dur: 1.8, type: 'sawtooth', gain: 0.35, attack: 0.15 });
    this.tone({ freq: 166, to: 70, dur: 1.6, type: 'square', gain: 0.08, attack: 0.15 });
    this.noise({ dur: 1.8, freq: 500, type: 'lowpass', gain: 0.7, attack: 0.15, sweep: 0.3 });
  }
  slam() { this.noise({ dur: 0.7, freq: 200, type: 'lowpass', gain: 1 }); this.tone({ freq: 60, to: 25, dur: 0.7, gain: 0.7 }); }
  lantern() { [392, 494, 587].forEach((f, i) => setTimeout(() => this.tone({ freq: f, dur: 1.6, gain: 0.08, attack: 0.05 }), i * 120)); }
  gate() { this.tone({ freq: 50, to: 35, dur: 2.5, type: 'sawtooth', gain: 0.12, attack: 0.3 }); this.noise({ dur: 2.5, freq: 150, type: 'lowpass', gain: 0.4, attack: 0.3 }); }
  death() { this.tone({ freq: 220, to: 55, dur: 3, type: 'triangle', gain: 0.25, attack: 0.05 }); }

  startAmbience() {
    // Wind: filtered noise with slow LFO.
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 0.6;
    const g = this.ctx.createGain(); g.gain.value = 0.06;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = this.ctx.createGain(); lg.gain.value = 250;
    lfo.connect(lg).connect(f.frequency);
    src.connect(f).connect(g).connect(this.master);
    src.start(); lfo.start();
    // Distant bell every ~20s.
    setInterval(() => {
      if (this.ctx.state !== 'running') return;
      [1, 2.76, 5.4].forEach((m, i) => this.tone({ freq: 98 * m, dur: 6 - i, gain: 0.03 / (i + 1), attack: 0.01 }));
    }, 21000);
  }

  startMusic() {
    // Boss music: low drone + heartbeat pulse, faded in via setMusic().
    const ctx = this.ctx;
    [55, 82.4, 110.5].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = i === 2 ? 'sawtooth' : 'triangle'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = i === 2 ? 0.02 : 0.08;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
      o.connect(lp).connect(g).connect(this.musicBus); o.start();
    });
    this.beat = 0;
    this.bpm = 70;
    const pulse = () => {
      if (this.musicBus.gain.value > 0.01) {
        const t = this.t;
        for (const off of [0, 0.22]) {
          const o = ctx.createOscillator(); o.frequency.setValueAtTime(70, t + off); o.frequency.exponentialRampToValueAtTime(35, t + off + 0.2);
          const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t + off); g.gain.exponentialRampToValueAtTime(0.5, t + off + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.25);
          o.connect(g).connect(this.musicBus); o.start(t + off); o.stop(t + off + 0.3);
        }
        if (this.beat++ % 4 === 0) this.tone({ freq: [220, 207.6, 196, 233][Math.floor(this.beat / 4) % 4], dur: 3, type: 'sawtooth', gain: 0.025, attack: 0.5 });
      }
      setTimeout(pulse, 60000 / this.bpm);
    };
    pulse();
  }

  setMusic(on, intense = false) {
    if (!this.ctx) return;
    this.bpm = intense ? 96 : 70;
    this.musicBus.gain.cancelScheduledValues(this.t);
    this.musicBus.gain.setTargetAtTime(on ? 0.6 : 0, this.t, on ? 0.8 : 1.5);
  }
}
