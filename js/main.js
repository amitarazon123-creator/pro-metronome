import { AudioEngine, SOUND_LABELS, SOUND_TYPES } from "./audio-engine.js";

const STORAGE_KEY = "subdivision-metronome-state-v1";

const engine = new AudioEngine();

const bpmInput = document.getElementById("bpmValue");
const playStopBtn = document.getElementById("playStopBtn");
const playStopLabel = document.getElementById("playStopLabel");
const tapTempoBtn = document.getElementById("tapTempoBtn");
const mixerEl = document.getElementById("mixer");
const statusText = document.getElementById("statusText");
const audioStateText = document.getElementById("audioStateText");

const LEVEL_NAMES = ["Off", "Low", "Med", "High"];

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveState() {
  const channels = Object.fromEntries(
    Object.entries(engine.channels).map(([name, ch]) => [name, { level: ch.level, sound: ch.sound }])
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ bpm: engine.bpm, channels }));
}

function applyStoredState() {
  const saved = loadState();
  if (!saved) return;

  if (Number.isFinite(saved.bpm)) engine.setBpm(saved.bpm);

  if (saved.channels) {
    for (const [name, ch] of Object.entries(saved.channels)) {
      if (!engine.channels[name]) continue;
      if (Number.isInteger(ch.level)) engine.setChannelLevel(name, ch.level);
      if (SOUND_TYPES.includes(ch.sound)) engine.setChannelSound(name, ch.sound);
    }
  }
}

function renderBpm() {
  bpmInput.value = engine.bpm;
}

function buildMixer() {
  mixerEl.innerHTML = "";
  for (const [name, channel] of Object.entries(engine.channels)) {
    const strip = document.createElement("div");
    strip.className = "channel";
    strip.dataset.channel = name;

    const led = document.createElement("div");
    led.className = "led";
    led.id = `led-${name}`;

    const label = document.createElement("div");
    label.className = "channel-label";
    label.textContent = channel.label;

    const soundSelect = document.createElement("select");
    soundSelect.className = "sound-select";
    for (const sound of SOUND_TYPES) {
      const option = document.createElement("option");
      option.value = sound;
      option.textContent = SOUND_LABELS[sound];
      if (sound === channel.sound) option.selected = true;
      soundSelect.appendChild(option);
    }
    soundSelect.addEventListener("change", () => {
      engine.setChannelSound(name, soundSelect.value);
      saveState();
    });

    const selector = document.createElement("div");
    selector.className = "level-selector";

    for (let level = 0; level <= 3; level++) {
      const btn = document.createElement("button");
      btn.className = "level-btn";
      btn.dataset.level = String(level);
      btn.textContent = LEVEL_NAMES[level];
      if (level === channel.level) btn.classList.add("active");
      btn.addEventListener("click", () => {
        engine.setChannelLevel(name, level);
        selector.querySelectorAll(".level-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        saveState();
      });
      selector.appendChild(btn);
    }

    strip.append(led, label, soundSelect, selector);
    mixerEl.appendChild(strip);
  }
}

function flashLed(name, didSound) {
  const led = document.getElementById(`led-${name}`);
  if (!led || !didSound) return;
  led.classList.add("lit");
  setTimeout(() => led.classList.remove("lit"), 60);
}

function setPlayingUi(isPlaying) {
  playStopBtn.setAttribute("aria-pressed", String(isPlaying));
  playStopLabel.textContent = isPlaying ? "■ Stop" : "▶ Play";
  statusText.textContent = isPlaying
    ? "Engine running — audio clock is the timing source."
    : "Engine idle. Press Play to start the audio clock.";
}

playStopBtn.addEventListener("click", () => {
  const isPlaying = engine.toggle();
  setPlayingUi(isPlaying);
});

document.querySelectorAll(".tempo-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const delta = parseInt(btn.dataset.adjust, 10);
    engine.setBpm(engine.bpm + delta);
    renderBpm();
    saveState();
  });
});

// Typed tempo entry: commit on Enter/blur, clamp+snap back via renderBpm().
bpmInput.addEventListener("focus", () => bpmInput.select());
bpmInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") bpmInput.blur();
});
bpmInput.addEventListener("change", () => {
  const value = parseInt(bpmInput.value, 10);
  if (!Number.isNaN(value)) engine.setBpm(value);
  renderBpm();
  saveState();
});

let tapTimes = [];
tapTempoBtn.addEventListener("click", () => {
  const now = performance.now();
  if (tapTimes.length > 0 && now - tapTimes[tapTimes.length - 1] > 2000) {
    tapTimes = [];
  }
  tapTimes.push(now);
  if (tapTimes.length > 8) tapTimes.shift();

  if (tapTimes.length > 1) {
    const intervals = [];
    for (let i = 1; i < tapTimes.length; i++) {
      intervals.push(tapTimes[i] - tapTimes[i - 1]);
    }
    const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    engine.setBpm(60000 / avgMs);
    renderBpm();
    saveState();
  }
});

engine.onTick = (name, didSound) => flashLed(name, didSound);

setInterval(() => {
  if (!engine.audioContext) {
    audioStateText.textContent = "";
    return;
  }
  audioStateText.textContent = `audio: ${engine.audioContext.state}`;
}, 500);

applyStoredState();
buildMixer();
renderBpm();
setPlayingUi(false);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js");
  });
}
