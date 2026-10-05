/**
 * Placeholder audio synthesized with WebAudio — no asset files needed.
 * Replace any method body with a decoded buffer from /public/audio later.
 */
export class AudioManager {
  private ctx?: AudioContext;
  private master?: GainNode;
  private sfx?: GainNode;
  private amb?: GainNode;
  private noise?: AudioBuffer;
  muted = false;
  volume = 0.7;

  /** Must be called from a user gesture */
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain(); this.sfx.connect(this.master);
    this.amb = this.ctx.createGain(); this.amb.gain.value = 0.35; this.amb.connect(this.master);
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.ambient();
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master && !this.muted) this.master.gain.setTargetAtTime(v, this.ctx!.currentTime, 0.05);
  }
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx!.currentTime, 0.05);
    return this.muted;
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.2, delay = 0, slideTo?: number) {
    if (!this.ctx || !this.sfx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }

  private burst(dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass') {
    if (!this.ctx || !this.sfx || !this.noise) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random()); src.stop(t + dur);
  }

  footstep(run = false) { this.burst(run ? 0.09 : 0.11, 380 + Math.random() * 140, 1.2, run ? 0.3 : 0.2); }
  click() { this.tone(1200, 0.05, 'square', 0.04); }
  investigate() { this.tone(330, 0.25, 'triangle', 0.12, 0, 660); }
  dialogue() { this.tone(520 + Math.random() * 120, 0.05, 'triangle', 0.05); }
  door() { this.tone(880, 0.6, 'sine', 0.12); this.tone(1108, 0.8, 'sine', 0.1, 0.18); }
  evidenceFound() {
    [392, 494, 587, 784].forEach((f, i) => this.tone(f, 1.1 - i * 0.15, 'triangle', 0.1, i * 0.08));
    this.burst(0.6, 3000, 0.7, 0.05, 'highpass');
  }
  vision() { this.tone(110, 1.2, 'sawtooth', 0.06, 0, 55); this.tone(1760, 0.5, 'sine', 0.04, 0.05, 880); }
  warn() { this.tone(220, 0.25, 'square', 0.06); this.tone(196, 0.3, 'square', 0.06, 0.15); }
  result(win: boolean) {
    const notes = win ? [262, 330, 392, 523] : [330, 311, 294, 247];
    notes.forEach((f, i) => this.tone(f, 0.9, 'triangle', 0.12, i * 0.2));
  }


  // ---------------------------------------------------------------- combat
  private lastShot = 0;
  shot(kind: string) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastShot < 0.03) return; // limit voices for very fast guns
    this.lastShot = now;
    switch (kind) {
      case 'pistol': this.burst(0.12, 1800, 0.8, 0.5, 'lowpass'); this.tone(160, 0.08, 'square', 0.12, 0, 60); break;
      case 'heavyPistol': this.burst(0.25, 1200, 0.7, 0.7, 'lowpass'); this.tone(90, 0.2, 'square', 0.2, 0, 40); break;
      case 'smg': this.burst(0.07, 2400, 0.9, 0.35, 'lowpass'); break;
      case 'rifle': this.burst(0.14, 1600, 0.8, 0.5, 'lowpass'); this.tone(120, 0.1, 'square', 0.1, 0, 50); break;
      case 'shotgun': this.burst(0.35, 900, 0.6, 0.8, 'lowpass'); this.tone(70, 0.25, 'sawtooth', 0.2, 0, 35); break;
      case 'sniper': this.burst(0.5, 1100, 0.5, 0.9, 'lowpass'); this.tone(55, 0.4, 'sawtooth', 0.25, 0, 30); break;
      case 'minigun': this.burst(0.05, 2600, 1, 0.3, 'lowpass'); break;
      case 'launcher': this.burst(0.3, 500, 0.6, 0.5, 'lowpass'); this.tone(200, 0.3, 'triangle', 0.15, 0, 80); break;
      case 'cannon': this.burst(0.6, 300, 0.5, 0.9, 'lowpass'); this.tone(45, 0.6, 'sine', 0.4, 0, 25); break;
      case 'flame': this.burst(0.12, 700, 0.4, 0.15, 'bandpass'); break;
      case 'rail': this.tone(2400, 0.4, 'sawtooth', 0.12, 0, 200); this.burst(0.3, 4000, 0.5, 0.3, 'highpass'); break;
      case 'swing': this.burst(0.15, 1200, 2, 0.15, 'bandpass'); break;
    }
  }
  explosion(big = 1) {
    this.burst(0.9 * big, 260, 0.4, 0.9, 'lowpass');
    this.tone(48, 0.9 * big, 'sine', 0.5, 0, 22);
    this.burst(0.4, 3000, 0.4, 0.15, 'highpass');
  }
  hit() { this.burst(0.06, 900, 1.5, 0.18, 'bandpass'); }
  hurt() { this.tone(180, 0.18, 'sawtooth', 0.12, 0, 90); }
  groan() {
    const f = 70 + Math.random() * 60;
    this.tone(f, 0.9, 'sawtooth', 0.035, 0, f * 0.7);
    this.tone(f * 1.5, 0.7, 'triangle', 0.02, 0.05, f);
  }
  empty() { this.tone(900, 0.03, 'square', 0.05); }
  reload() { this.tone(500, 0.05, 'square', 0.05); this.tone(700, 0.05, 'square', 0.05, 0.25); }
  pickup() { this.tone(660, 0.1, 'triangle', 0.1); this.tone(990, 0.15, 'triangle', 0.1, 0.08); }
  weapon() { [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.1, i * 0.07)); }
  mission() { [262, 330, 392, 523, 659].forEach((f, i) => this.tone(f, 0.8, 'triangle', 0.12, i * 0.12)); }
  radio() { this.burst(0.25, 2200, 1.5, 0.12, 'bandpass'); }
  horn() { this.tone(330, 0.35, 'square', 0.12); this.tone(415, 0.35, 'square', 0.1); }

  private engineOsc?: OscillatorNode;
  private engineGain?: GainNode;
  /** rpm 0..1, 0 to silence */
  engine(rpm: number, bike = false) {
    if (!this.ctx || !this.sfx) return;
    if (!this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth';
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
      this.engineOsc.connect(lp).connect(this.engineGain).connect(this.sfx); this.engineOsc.start();
    }
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime((bike ? 70 : 45) + rpm * (bike ? 160 : 110), t, 0.05);
    this.engineGain!.gain.setTargetAtTime(rpm > 0 ? 0.05 + rpm * 0.05 : 0, t, 0.08);
  }

  /** City ambience: low HVAC hum + filtered air + rare distant tone */
  private ambient() {
    if (!this.ctx || !this.amb || !this.noise) return;
    const hum = this.ctx.createOscillator(); hum.frequency.value = 41; hum.type = 'sine';
    const hg = this.ctx.createGain(); hg.gain.value = 0.08;
    hum.connect(hg).connect(this.amb); hum.start();
    const hum2 = this.ctx.createOscillator(); hum2.frequency.value = 110.5; const hg2 = this.ctx.createGain(); hg2.gain.value = 0.025;
    hum2.connect(hg2).connect(this.amb); hum2.start();
    const air = this.ctx.createBufferSource(); air.buffer = this.noise; air.loop = true;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const ag = this.ctx.createGain(); ag.gain.value = 0.06;
    air.connect(lp).connect(ag).connect(this.amb); air.start();
    const pad = () => {
      if (!this.ctx || !this.amb) return;
      const t = this.ctx.currentTime;
      for (const f of [110, 130.8, 155.6]) {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.frequency.value = f; o.type = 'sine';
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + 2); g.gain.exponentialRampToValueAtTime(0.0001, t + 7);
        o.connect(g).connect(this.amb); o.start(t); o.stop(t + 7.2);
      }
      setTimeout(pad, 14000 + Math.random() * 10000);
    };
    setTimeout(pad, 4000);
  }
}
