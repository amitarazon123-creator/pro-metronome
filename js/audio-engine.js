// AudioEngine: precision lookahead scheduler for the subdivision metronome.
//
// Timing strategy ("A Tale of Two Clocks"):
//   - A setTimeout loop runs frequently (every `lookahead` ms) but is ONLY
//     used to decide which upcoming notes fall inside the next
//     `scheduleAheadTime` window.
//   - Every note that is scheduled gets an exact, sample-accurate start
//     time on the Web Audio clock (`AudioContext.currentTime`), and
//     playback is triggered via `AudioBufferSourceNode/OscillatorNode.start(time)`.
//   - Because the actual sound trigger is handed to the Web Audio API's own
//     high-resolution clock (not the JS event loop), the audible timing is
//     immune to setTimeout/rAF jitter, GC pauses, and tab-throttling.
//
// Subdivision alignment:
//   Quarter / Eighth / Eighth-Triplet / Sixteenth subdivisions don't share a
//   common grid at the sixteenth-note resolution alone (triplets are a
//   division by 3, the others by powers of 2). We instead tick at the LCM of
//   {1, 2, 3, 4} subdivisions-per-beat = 12 ticks per quarter note. Every
//   channel's hits land exactly on one of those 12 ticks:
//     Quarter        -> every 12 ticks (1 hit/beat)
//     Eighth         -> every 6 ticks  (2 hits/beat)
//     Eighth-Triplet -> every 4 ticks  (3 hits/beat)
//     Sixteenth      -> every 3 ticks  (4 hits/beat)

export const VOLUME_LEVELS = [0, 0.3, 0.7, 1.0]; // Off, Low, Medium, High

const TICKS_PER_BEAT = 12;

// Placeholder "samples": synthesized per-voice timbres, each rendered
// straight from oscillators/noise rather than a loaded audio file, so the
// mixer's Sound Selector has something distinct to switch between now.
// Swapping these for real AudioBuffer samples later is a drop-in change —
// _trigger() just needs a buffer to play instead of calling _playX().
export const SOUND_LABELS = {
  click: "Click",
  cowbell: "Cowbell",
  shaker: "Shaker",
  woodblock: "Woodblock",
};
export const SOUND_TYPES = Object.keys(SOUND_LABELS);

export const DEFAULT_CHANNELS = {
  quarter: { label: "1/4", spacingTicks: 12, level: 3, sound: "click" },
  eighth: { label: "1/8", spacingTicks: 6, level: 2, sound: "woodblock" },
  eighthTriplet: { label: "1/8T", spacingTicks: 4, level: 0, sound: "cowbell" },
  sixteenth: { label: "1/16", spacingTicks: 3, level: 0, sound: "shaker" },
};

export class AudioEngine {
  constructor() {
    this.audioContext = null;
    this.masterGain = null;

    this.isPlaying = false;
    this.bpm = 120;

    // Scheduler tuning (standard values for this pattern).
    this.lookaheadMs = 25.0; // how often the scheduler loop runs
    this.scheduleAheadTime = 0.1; // how far ahead (seconds) we schedule audio

    this.nextNoteTime = 0.0;
    this.currentTick = 0;
    this.timerId = null;

    this.channels = structuredClone(DEFAULT_CHANNELS);

    // UI hook: called (channelName, time, didSound) close to the moment a
    // scheduled tick actually becomes audible, for LED / visual sync.
    this.onTick = null;
  }

  ensureContext() {
    if (!this.audioContext) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new Ctx();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 0.9;
      this.masterGain.connect(this.audioContext.destination);
      this.noiseBuffer = this._createNoiseBuffer();
    }
    return this.audioContext;
  }

  _createNoiseBuffer() {
    const ctx = this.audioContext;
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  setBpm(bpm) {
    this.bpm = Math.min(300, Math.max(30, Math.round(bpm)));
  }

  setChannelLevel(name, level) {
    if (!this.channels[name]) return;
    this.channels[name].level = Math.min(3, Math.max(0, level));
  }

  setChannelSound(name, sound) {
    if (!this.channels[name] || !SOUND_TYPES.includes(sound)) return;
    this.channels[name].sound = sound;
  }

  start() {
    if (this.isPlaying) return;
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") ctx.resume();

    this.isPlaying = true;
    this.currentTick = 0;
    this.nextNoteTime = ctx.currentTime + 0.05;
    this._scheduler();
  }

  stop() {
    this.isPlaying = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  toggle() {
    if (this.isPlaying) this.stop();
    else this.start();
    return this.isPlaying;
  }

  _scheduler() {
    const ctx = this.audioContext;
    while (this.nextNoteTime < ctx.currentTime + this.scheduleAheadTime) {
      this._scheduleTick(this.currentTick, this.nextNoteTime);
      this._advanceTick();
    }
    this.timerId = setTimeout(() => this._scheduler(), this.lookaheadMs);
  }

  _advanceTick() {
    const secondsPerBeat = 60.0 / this.bpm;
    const secondsPerTick = secondsPerBeat / TICKS_PER_BEAT;
    this.nextNoteTime += secondsPerTick;
    this.currentTick = (this.currentTick + 1) % TICKS_PER_BEAT;
  }

  _scheduleTick(tick, time) {
    for (const [name, channel] of Object.entries(this.channels)) {
      if (tick % channel.spacingTicks !== 0) continue;

      const willSound = channel.level > 0;
      if (willSound) {
        const gainValue = VOLUME_LEVELS[channel.level];
        this._trigger(channel.sound, time, gainValue);
      }

      if (this.onTick) {
        const delayMs = Math.max(0, (time - this.audioContext.currentTime) * 1000);
        setTimeout(() => this.onTick(name, willSound), delayMs);
      }
    }
  }

  _trigger(sound, time, gainValue) {
    switch (sound) {
      case "click":
        this._playClick(time, gainValue);
        break;
      case "cowbell":
        this._playCowbell(time, gainValue);
        break;
      case "shaker":
        this._playShaker(time, gainValue);
        break;
      case "woodblock":
        this._playWoodblock(time, gainValue);
        break;
    }
  }

  _envelope(time, duration, gainValue, attack = 0.002) {
    const gain = this.audioContext.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(gainValue, time + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    gain.connect(this.masterGain);
    return gain;
  }

  _noiseSource(time, duration) {
    const ctx = this.audioContext;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.start(time);
    src.stop(time + duration + 0.02);
    return src;
  }

  // Short highpassed noise burst — a tight, neutral click-track tick.
  _playClick(time, gainValue) {
    const duration = 0.02;
    const ctx = this.audioContext;
    const src = this._noiseSource(time, duration);
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 3500;
    const gain = this._envelope(time, duration, gainValue, 0.001);
    src.connect(highpass);
    highpass.connect(gain);
  }

  // Two square oscillators at an inharmonic ratio through a bandpass filter
  // — the classic analog-drum-machine cowbell "clang".
  _playCowbell(time, gainValue) {
    const duration = 0.15;
    const ctx = this.audioContext;
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = 800;
    bandpass.Q.value = 2;
    const gain = this._envelope(time, duration, gainValue);
    bandpass.connect(gain);

    for (const freq of [587, 845]) {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = freq;
      osc.connect(bandpass);
      osc.start(time);
      osc.stop(time + duration + 0.02);
    }
  }

  // Bandpassed noise burst in the high-frequency "sss" range.
  _playShaker(time, gainValue) {
    const duration = 0.08;
    const ctx = this.audioContext;
    const src = this._noiseSource(time, duration);
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = 7000;
    bandpass.Q.value = 0.7;
    const gain = this._envelope(time, duration, gainValue, 0.005);
    src.connect(bandpass);
    bandpass.connect(gain);
  }

  // Fast-decaying triangle tone with a downward pitch slide — a dry "knock".
  _playWoodblock(time, gainValue) {
    const duration = 0.05;
    const ctx = this.audioContext;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(1200, time);
    osc.frequency.exponentialRampToValueAtTime(900, time + duration);
    const gain = this._envelope(time, duration, gainValue, 0.001);
    osc.connect(gain);
    osc.start(time);
    osc.stop(time + duration + 0.01);
  }
}
