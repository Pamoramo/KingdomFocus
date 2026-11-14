// Procedural audio: synthesized sound effects, generative medieval music and ambience. No audio files.
export type Mood = 'day' | 'night' | 'war';
export type Sfx = 'lute' | 'thunder' | 'click' | 'coin' | 'build' | 'recruit' | 'promote' | 'stage' | 'achieve' | 'error' | 'march' | 'clash' | 'arrows' | 'catapult' | 'horn' | 'victory' | 'defeat' | 'checkin' | 'break' | 'reward';

const NOTE = (n: number) => 146.83 * 2 ** (n / 12); // semitones above D3
const MODES: Record<Mood, number[]> = { day: [0, 2, 3, 5, 7, 9, 10], night: [0, 2, 3, 5, 7, 8, 10], war: [0, 1, 3, 5, 7, 8, 10] }; // dorian, aeolian, phrygian
const PROG: Record<Mood, number[]> = { day: [0, 6, 3, 4], night: [0, 5, 3, 6], war: [0, 1, 0, 6] };
const TEMPO: Record<Mood, number> = { day: 92, night: 66, war: 118 };

class Engine {
  ctx: AudioContext | null = null;
  private master!: GainNode; private music!: GainNode; private sfx!: GainNode; private amb!: GainNode;
  private noiseBuf!: AudioBuffer; private drone: OscillatorNode[] = [];
  private mood: Mood = 'day'; private nextT = 0; private step = 0; private timer: ReturnType<typeof setInterval> | null = null;
  private weather = 'clear'; private rain: { g: GainNode; f: BiquadFilterNode } | null = null;
  private melody = { deg: 4, rest: 0 }; private ambT = 0; private vol = { music: 0.5, sfx: 0.7, ambience: true };

  /** Must be called from a user gesture (browsers block audio until then). */
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new AudioContext(); } catch { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.9; this.master.connect(c.destination);
    const comp = c.createDynamicsCompressor(); comp.connect(this.master);
    this.music = c.createGain(); this.sfx = c.createGain(); this.amb = c.createGain();
    for (const g of [this.music, this.sfx, this.amb]) g.connect(comp);
    // gentle hall reverb for the music bus
    const verb = c.createConvolver(), len = c.sampleRate * 2.2, ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3; }
    verb.buffer = ir; const wet = c.createGain(); wet.gain.value = 0.28; this.music.connect(verb).connect(wet).connect(comp);
    this.noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const nd = this.noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.apply(); this.nextT = c.currentTime + 0.2;
    this.timer = setInterval(() => this.schedule(), 90);
    this.startDrone(); this.setWeather(this.weather as never);
  }
  setVolumes(v: { music?: number; sfx?: number; ambience?: boolean }) { this.vol = { music: v.music ?? this.vol.music, sfx: v.sfx ?? this.vol.sfx, ambience: v.ambience ?? this.vol.ambience }; this.apply(); }
  private apply() { if (!this.ctx) return; const t = this.ctx.currentTime; this.music.gain.setTargetAtTime(this.vol.music * 0.55, t, 0.3); this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.05); this.amb.gain.setTargetAtTime(this.vol.ambience ? 0.35 : 0, t, 0.3); }
  /** Weather ambience: a looping filtered-noise bed (rain hiss, storm downpour or winter wind). */
  setWeather(w: 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'snow') {
    this.weather = w; if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    if (!this.rain) {
      const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const f = c.createBiquadFilter(), g = c.createGain(); g.gain.value = 0; src.connect(f).connect(g).connect(this.amb); src.start(); this.rain = { g, f };
    }
    const cfg: Record<string, [number, BiquadFilterType, number]> = { clear: [0, 'lowpass', 400], cloudy: [0.05, 'lowpass', 350], fog: [0.03, 'lowpass', 300], rain: [0.22, 'bandpass', 1400], storm: [0.36, 'bandpass', 1000], snow: [0.08, 'lowpass', 500] };
    const [vol, type, freq] = cfg[w]; this.rain.f.type = type; this.rain.f.frequency.setTargetAtTime(freq, t, 0.5); this.rain.g.gain.setTargetAtTime(vol, t, 1.2);
  }
  setMood(m: Mood) { if (m === this.mood) return; this.mood = m; this.startDrone(); }

  // ---------- voices ----------
  private env(g: GainNode, t: number, peak: number, a: number, d: number) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  private osc(type: OscillatorType, f: number, t: number, peak: number, a: number, d: number, out: AudioNode, detune = 0) {
    const c = this.ctx!, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = f; o.detune.value = detune;
    this.env(g, t, peak, a, d); o.connect(g).connect(out); o.start(t); o.stop(t + a + d + 0.05); return o;
  }
  private noise(t: number, dur: number, peak: number, out: AudioNode, filter: BiquadFilterType, freq: number, q = 1) {
    const c = this.ctx!, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; f.type = filter; f.frequency.value = freq; f.Q.value = q; this.env(g, t, peak, 0.005, dur);
    s.connect(f).connect(g).connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05); return f;
  }
  /** Plucked lute/harp: bright attack through a closing low-pass. */
  private pluck(f: number, t: number, peak = 0.12, out: AudioNode = this.music) {
    const c = this.ctx!, lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(f * 8, t); lp.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.4); lp.connect(out);
    this.osc('triangle', f, t, peak, 0.004, 0.9, lp); this.osc('sawtooth', f, t, peak * 0.25, 0.004, 0.35, lp, 4);
  }
  /** Recorder / shawm melody voice with soft vibrato. */
  private flute(f: number, t: number, dur: number, peak = 0.06) {
    const c = this.ctx!, o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    o.type = this.mood === 'war' ? 'square' : 'sine'; o.frequency.value = f; lfo.frequency.value = 5.2; lg.gain.value = f * 0.006; lfo.connect(lg).connect(o.frequency);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = this.mood === 'war' ? 1800 : 3000;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak * (this.mood === 'war' ? 0.4 : 1), t + 0.06); g.gain.setValueAtTime(peak * (this.mood === 'war' ? 0.4 : 1), t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(this.music); o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }
  private drum(t: number, accent: boolean) {
    const c = this.ctx!, o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(accent ? 110 : 90, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.18);
    this.env(g, t, accent ? 0.22 : 0.12, 0.003, 0.25); o.connect(g).connect(this.music); o.start(t); o.stop(t + 0.3);
    this.noise(t, 0.08, accent ? 0.06 : 0.03, this.music, 'bandpass', 900, 0.8);
  }
  private startDrone() {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    for (const o of this.drone) { try { o.stop(t + 1.5); } catch { /* already stopped */ } }
    this.drone = [];
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = this.mood === 'war' ? 500 : 320; lp.connect(this.music);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 2); g.connect(lp);
    for (const [n, det] of [[-12, 0], [-5, 3], [-12, -6]]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(n); o.detune.value = det; o.connect(g); o.start(t); this.drone.push(o); }
  }

  // ---------- generative music ----------
  private schedule() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const c = this.ctx, beat = 60 / TEMPO[this.mood] / 2; // eighth notes
    while (this.nextT < c.currentTime + 0.35) {
      const t = this.nextT, st = this.step, bar = Math.floor(st / 8) % 4, pos = st % 8, mode = MODES[this.mood];
      const root = PROG[this.mood][bar], chord = [root, root + 2, root + 4].map((d) => mode[d % 7] + 12 * Math.floor(d / 7));
      // lute arpeggio
      const arp = this.mood === 'night' ? [0, -1, 1, -1, 2, -1, 1, -1] : [0, 1, 2, 1, 0, 2, 1, 2];
      if (arp[pos] >= 0) this.pluck(NOTE(chord[arp[pos]]), t, pos === 0 ? 0.11 : 0.07);
      if (pos === 0) this.pluck(NOTE(chord[0] - 12), t, 0.1);
      // percussion
      const pat = this.mood === 'war' ? [1, 0, 1, 1, 1, 0, 1, 0] : this.mood === 'day' ? [1, 0, 0, 1, 0, 0, 1, 0] : [1, 0, 0, 0, 0, 0, 0, 0];
      if (pat[pos]) this.drum(t, pos === 0);
      // melody: a random walk over the mode, phrased with rests
      if (pos % 2 === 0 || this.mood === 'war') {
        if (this.melody.rest > 0) this.melody.rest--;
        else if (Math.random() < (this.mood === 'night' ? 0.45 : 0.7)) {
          const m = this.melody; m.deg = Math.max(0, Math.min(11, m.deg + [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)]));
          if (pos === 0 && Math.random() < 0.6) m.deg = [0, 2, 4, 7][Math.floor(Math.random() * 4)] + 0;
          const note = mode[m.deg % 7] + 12 * Math.floor(m.deg / 7) + 12, len = beat * (Math.random() < 0.3 ? 4 : 2);
          this.flute(NOTE(note), t, len);
          if (Math.random() < 0.12) m.rest = 6;
        }
      }
      this.step++; this.nextT += beat;
    }
    if (this.vol.ambience && c.currentTime > this.ambT) this.ambience();
  }
  private ambience() {
    const c = this.ctx!, t = c.currentTime;
    if (this.mood === 'night') { for (let i = 0; i < 6; i++) this.osc('sine', 4300 + Math.random() * 300, t + i * 0.06, 0.02, 0.005, 0.03, this.amb); this.ambT = t + 1.2 + Math.random() * 2; }
    else if (this.mood === 'day') {
      const n = 2 + Math.floor(Math.random() * 4), base = 2400 + Math.random() * 1600;
      for (let i = 0; i < n; i++) { const o = this.osc('sine', base, t + i * 0.13, 0.03, 0.01, 0.09, this.amb); o.frequency.setValueAtTime(base, t + i * 0.13); o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.4), t + i * 0.13 + 0.08); }
      this.ambT = t + 3 + Math.random() * 6;
    } else { this.noise(t, 1.6, 0.02, this.amb, 'lowpass', 400); this.ambT = t + 2; }
  }

  /** Murmured speech: a few soft blips at a voice-specific pitch (like distant chatter). */
  babble(chars: number, base = 440) {
    if (!this.ctx || this.vol.sfx <= 0) return; const t0 = this.ctx.currentTime + 0.02, n = Math.min(7, Math.max(2, Math.ceil(chars / 6)));
    for (let i = 0; i < n; i++) { const f = base * (0.85 + Math.random() * 0.3) * (i === n - 1 ? 0.85 : 1); this.osc('triangle', f, t0 + i * 0.075, 0.035, 0.008, 0.05, this.sfx); }
  }
  // ---------- sound effects ----------
  play(name: Sfx) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime + 0.01, out = this.sfx;
    const notes = (fs: number[], gap: number, type: OscillatorType = 'square', peak = 0.08, d = 0.22) => fs.forEach((f, i) => this.osc(type, f, t + i * gap, peak, 0.005, d, out));
    switch (name) {
      case 'lute': [0, 3, 5, 7, 5, 3, 7, 10, 12].forEach((n, i) => this.pluck(NOTE(n + 12), t + i * 0.24, 0.1, out)); break;
      case 'thunder': { const f = this.noise(t, 2.8, 0.5, out, 'lowpass', 160); f.frequency.exponentialRampToValueAtTime(60, t + 2.8); this.noise(t, 0.25, 0.25, out, 'highpass', 900); break; }
      case 'click': this.osc('square', 1400, t, 0.03, 0.002, 0.03, out); break;
      case 'coin': notes([988, 1319], 0.07, 'square', 0.06, 0.18); break;
      case 'reward': notes([523, 659, 784, 1046, 1319], 0.09, 'square', 0.07, 0.3); break;
      case 'checkin': notes([660, 880, 1320], 0.12, 'square', 0.06, 0.25); break;
      case 'break': notes([784, 659, 523], 0.14, 'triangle', 0.1, 0.35); break;
      case 'build': for (let i = 0; i < 3; i++) this.noise(t + i * 0.16, 0.06, 0.25, out, 'bandpass', 1600, 3); this.osc('sine', 70, t + 0.5, 0.25, 0.005, 0.3, out); break;
      case 'recruit': this.osc('sawtooth', 220, t, 0.07, 0.04, 0.3, out); this.osc('sawtooth', 330, t + 0.25, 0.07, 0.04, 0.45, out); break;
      case 'promote': case 'achieve': notes([659, 784, 988, 1319], 0.08, 'triangle', 0.12, 0.4); break;
      case 'stage': case 'victory': [[392, 494, 587], [440, 554, 659], [523, 659, 784]].forEach((ch, i) => ch.forEach((f) => this.osc('sawtooth', f, t + i * 0.28, 0.04, 0.02, i === 2 ? 1.2 : 0.3, out))); break;
      case 'defeat': [392, 349, 311, 262].forEach((f, i) => this.osc('sawtooth', f, t + i * 0.3, 0.05, 0.03, 0.4, out)); break;
      case 'horn': this.osc('sawtooth', 196, t, 0.07, 0.15, 0.9, out); this.osc('sawtooth', 294, t, 0.04, 0.15, 0.9, out); break;
      case 'march': for (let i = 0; i < 8; i++) this.drum(t + i * 0.12, i % 4 === 0); break;
      case 'error': this.osc('square', 140, t, 0.05, 0.005, 0.18, out); break;
      case 'clash': for (let i = 0; i < 4; i++) { const tt = t + i * 0.09 + Math.random() * 0.05; this.noise(tt, 0.12, 0.12, out, 'highpass', 3000); this.osc('square', 1800 + Math.random() * 1500, tt, 0.02, 0.002, 0.08, out); } break;
      case 'arrows': { const f = this.noise(t, 0.5, 0.08, out, 'bandpass', 2500, 2); f.frequency.exponentialRampToValueAtTime(700, t + 0.5); break; }
      case 'catapult': this.osc('sine', 90, t, 0.3, 0.005, 0.25, out); this.noise(t + 0.6, 0.5, 0.2, out, 'lowpass', 600); break;
    }
  }
}
export const audio = new Engine();
