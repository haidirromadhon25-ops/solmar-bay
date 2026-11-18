// audio.js — every sound is synthesized with WebAudio. No audio files, no network.
// Engine hum, sirens, gunshots, pickups, UI clicks and a lazy sun-soaked music loop.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let muted = false;
  let musicStep = 0;

  // A minor-key bassline and pad chords, one bar at a time, scheduled by timer.
  const BASS = [55, 55, 65.41, 49, 55, 55, 82.41, 73.42];
  const CHORDS = [
    [220, 261.63, 329.63],
    [174.61, 220, 261.63],
    [196, 246.94, 293.66],
    [164.81, 207.65, 246.94],
  ];

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.55;
      master.connect(ctx.destination);
      // Engine: a sawtooth through a low-pass, pitch follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 40;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: two-tone wail, gain gated by police proximity.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 750;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function noiseBurst(dur, vol, filterFreq) {
    if (!ctx || !master) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start();
  }

  function startMusic() {
    if (!ctx || musicTimer) return;
    musicTimer = setInterval(() => {
      if (muted || !ctx) return;
      const bar = CHORDS[musicStep % CHORDS.length];
      const bass = BASS[musicStep % BASS.length];
      tone(bass, 0.5, 'triangle', 0.16);
      tone(bass / 2, 0.5, 'sine', 0.1);
      for (const f of bar) tone(f, 1.9, 'sine', 0.045, 0.05);
      if (musicStep % 2 === 0) tone(bar[1] * 2, 0.4, 'sine', 0.03, 0.55);
      musicStep += 1;
    }, 480);
  }

  return {
    unlock() {
      if (ensure()) startMusic();
    },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.55;
    },
    isMuted() {
      return muted;
    },
    setEngine(speed01, on) {
      if (!ctx) return;
      const t = ctx.currentTime;
      engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.06 : 0, t, 0.08);
      engineOsc.frequency.setTargetAtTime(42 + speed01 * 130, t, 0.06);
      engineFilter.frequency.setTargetAtTime(280 + speed01 * 900, t, 0.1);
    },
    setSiren(on, near01) {
      if (!ctx) return;
      const t = ctx.currentTime;
      sirenGain.gain.setTargetAtTime(on ? 0.02 + near01 * 0.035 : 0, t, 0.2);
      sirenOsc.frequency.setTargetAtTime(720 + 260 * Math.sin(t * 2.4), t, 0.05);
    },
    gunshot() {
      noiseBurst(0.16, 0.5, 2400);
      tone(160, 0.12, 'square', 0.22, 0, 60);
    },
    enemyShot() {
      noiseBurst(0.14, 0.22, 1600);
    },
    crash(strength01) {
      noiseBurst(0.25, 0.15 + strength01 * 0.4, 900);
      tone(90, 0.2, 'sine', 0.3, 0, 40);
    },
    pickup() {
      tone(660, 0.09, 'sine', 0.25);
      tone(990, 0.14, 'sine', 0.25, 0.08);
    },
    cash() {
      tone(880, 0.08, 'triangle', 0.22);
      tone(1174, 0.08, 'triangle', 0.22, 0.07);
      tone(1568, 0.16, 'triangle', 0.22, 0.14);
    },
    click() {
      tone(520, 0.05, 'square', 0.12);
    },
    denied() {
      tone(180, 0.16, 'square', 0.16, 0, 120);
    },
    missionStart() {
      [523, 659, 784].forEach((f, i) => tone(f, 0.22, 'triangle', 0.22, i * 0.11));
    },
    missionDone() {
      [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.3, 'triangle', 0.24, i * 0.1));
    },
    busted() {
      [392, 370, 349, 311].forEach((f, i) => tone(f, 0.4, 'sawtooth', 0.14, i * 0.22));
    },
    hurt() {
      tone(220, 0.12, 'sawtooth', 0.2, 0, 110);
    },
    sirenBlip() {
      tone(950, 0.12, 'triangle', 0.2, 0, 700);
      tone(700, 0.12, 'triangle', 0.2, 0.12, 950);
    },
  };
}
