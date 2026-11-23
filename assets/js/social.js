const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const root = document.documentElement;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/* ---------- Mobile menu ---------- */
const menuToggle = document.querySelector(".menu-toggle");
const navLinks = document.querySelector(".nav-links");
menuToggle?.addEventListener("click", () => {
  const open = menuToggle.getAttribute("aria-expanded") === "true";
  menuToggle.setAttribute("aria-expanded", String(!open));
  navLinks?.classList.toggle("is-open", !open);
});
navLinks?.addEventListener("click", (e) => {
  if (e.target instanceof Element && e.target.closest("a")) {
    menuToggle?.setAttribute("aria-expanded", "false");
    navLinks.classList.remove("is-open");
  }
});

/* ---------- Sunset → night as you scroll ---------- */
const golden = {
  "sky-1": "#3b2d6b", "sky-2": "#c0587e", "sky-3": "#ff9e6d", "sky-4": "#ffd29a",
  "sea-1": "#6a4f8f", "sea-2": "#23284f", "sand-1": "#e8b98a", "sand-2": "#b9805f",
  "mtn-far": "#7a5a92", "mtn-near": "#3e2f62", "snow-shade": "#e9d9ee",
};
const night = {
  "sky-1": "#070a22", "sky-2": "#1b1d4a", "sky-3": "#4b3a75", "sky-4": "#a8607e",
  "sea-1": "#2a2a5a", "sea-2": "#0b0f2a", "sand-1": "#6e5670", "sand-2": "#3a2d4a",
  "mtn-far": "#2e2b5a", "mtn-near": "#16183a", "snow-shade": "#9aa3c7",
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => {
  const [r1, g1, b1] = hex(a);
  const [r2, g2, b2] = hex(b);
  const m = (x, y) => Math.round(x + (y - x) * t);
  return `rgb(${m(r1, r2)}, ${m(g1, g2)}, ${m(b1, b2)})`;
};

const nav = document.querySelector(".nav");
const nowPlaying = document.querySelector(".now-playing");
let scrollT = 0;

const onScroll = () => {
  const t = clamp(window.scrollY / (window.innerHeight * 0.9));
  scrollT = t;
  for (const key of Object.keys(golden)) root.style.setProperty(`--${key}`, mix(golden[key], night[key], t));
  root.style.setProperty("--stars", String(clamp((t - 0.35) / 0.5)));
  root.style.setProperty("--sun-y", `${t * 200}px`);
  nav?.classList.toggle("is-scrolled", window.scrollY > 40);
  nowPlaying?.classList.toggle("is-shown", window.scrollY > window.innerHeight * 0.55 || music.playing);
};
window.addEventListener("scroll", onScroll, { passive: true });

/* ---------- Reveal on scroll ---------- */
const reveals = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); }
    }),
    { threshold: 0.15 }
  );
  reveals.forEach((el) => io.observe(el));
} else {
  reveals.forEach((el) => el.classList.add("is-visible"));
}

/* ---------- Scene canvases: snowfall + music wave on the horizon ---------- */
const scene = document.querySelector(".scene");
const snowCanvas = document.querySelector(".snow");
const waveCanvas = document.querySelector(".horizon-wave");
const snowCtx = snowCanvas?.getContext("2d");
const waveCtx = waveCanvas?.getContext("2d");
let flakes = [];
let sceneW = 0;
let sceneH = 0;
let horizonY = 0;

const sizeCanvases = () => {
  if (!scene) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  sceneW = scene.clientWidth;
  sceneH = scene.clientHeight;
  [snowCanvas, waveCanvas].forEach((c) => {
    if (!c) return;
    c.width = sceneW * dpr;
    c.height = sceneH * dpr;
    c.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
  });
  // match the SVG's "xMidYMax slice" mapping to find the horizon line on screen
  const scale = Math.max(sceneW / 1440, sceneH / 900);
  horizonY = sceneH - 900 * scale + 598 * scale;
  const count = Math.round(clamp(sceneW / 14, 40, 120));
  flakes = Array.from({ length: count }, () => ({
    x: Math.random() * sceneW,
    y: Math.random() * sceneH,
    r: Math.random() * 1.8 + 0.6,
    s: Math.random() * 0.5 + 0.25,
    d: Math.random() * Math.PI * 2,
  }));
};

const drawSnow = () => {
  if (!snowCtx) return;
  snowCtx.clearRect(0, 0, sceneW, sceneH);
  const alpha = 0.55 + scrollT * 0.4;
  snowCtx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  for (const f of flakes) {
    f.y += f.s;
    f.d += 0.01;
    f.x += Math.sin(f.d) * 0.35;
    if (f.y > sceneH) { f.y = -4; f.x = Math.random() * sceneW; }
    snowCtx.beginPath();
    snowCtx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    snowCtx.fill();
  }
};

/* ---------- Generative lo-fi "sunset mix" (Web Audio) ---------- */
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const CHORDS = [
  [53, 57, 60, 64], // Fmaj7
  [52, 55, 59, 62], // Em7
  [50, 53, 57, 60], // Dm7
  [48, 52, 55, 59], // Cmaj7
];
const KEY_NOTES = [60, 62, 64, 67, 69, 72, 74, 76]; // C major pentatonic, fits every chord
const BPM = 72;
const SIXTEENTH = 60 / BPM / 4;

const music = {
  ctx: null, bus: null, master: null, analyser: null, noise: null,
  playing: false, timer: null, nextTime: 0, step: 0, crackle: null,
};

const initAudio = () => {
  if (music.ctx) return music.ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  music.ctx = ctx;

  const comp = ctx.createDynamicsCompressor();
  const master = ctx.createGain();
  master.gain.value = 0.9;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.8;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2400;

  // simple reverb from decaying noise
  const len = ctx.sampleRate * 2.6;
  const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = impulse.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  const verb = ctx.createConvolver();
  verb.buffer = impulse;
  const wet = ctx.createGain();
  wet.gain.value = 0.38;

  const bus = ctx.createGain();
  bus.connect(filter);
  filter.connect(comp);
  filter.connect(verb);
  verb.connect(wet);
  wet.connect(comp);
  comp.connect(master);
  master.connect(analyser);
  analyser.connect(ctx.destination);

  // shared white-noise buffer
  const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  music.bus = bus;
  music.master = master;
  music.analyser = analyser;
  music.noise = nb;
  return ctx;
};

const tone = (freq, t, { type = "sine", gain = 0.1, attack = 0.01, decay = 0.6, detune = 0 } = {}) => {
  const { ctx, bus } = music;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  o.connect(g);
  g.connect(bus);
  o.start(t);
  o.stop(t + attack + decay + 0.05);
};

const noiseHit = (t, { gain = 0.05, decay = 0.06, type = "highpass", freq = 7000 } = {}) => {
  const { ctx, bus, noise } = music;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  src.connect(f);
  f.connect(g);
  g.connect(bus);
  src.start(t, Math.random() * 0.5);
  src.stop(t + decay + 0.02);
};

const kick = (t) => {
  const { ctx, bus } = music;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(110, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
  g.gain.setValueAtTime(0.55, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
  o.connect(g);
  g.connect(bus);
  o.start(t);
  o.stop(t + 0.35);
};

const startCrackle = () => {
  if (music.crackle) return;
  const { ctx } = music;
  const len = ctx.sampleRate * 3;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() < 0.0009 ? (Math.random() * 2 - 1) : (Math.random() * 2 - 1) * 0.015;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1500;
  const g = ctx.createGain();
  g.gain.value = 0.18;
  src.connect(hp);
  hp.connect(g);
  g.connect(music.master);
  src.start();
  music.crackle = { gain: g, src };
};

let lastFloat = 0;
const scheduleStep = (step, t) => {
  const s = step % 16;
  const chord = CHORDS[Math.floor(step / 16) % CHORDS.length];
  const swing = s % 2 === 1 ? SIXTEENTH * 0.18 : 0;
  const at = t + swing;

  if (s === 0) {
    const barLen = SIXTEENTH * 16;
    chord.forEach((n, i) => {
      tone(midi(n), t + i * 0.025, { type: "triangle", gain: 0.045, attack: 0.5, decay: barLen });
      tone(midi(n), t + i * 0.025, { type: "sine", gain: 0.03, attack: 0.6, decay: barLen, detune: 7 });
    });
  }
  if (s === 0 || s === 10) tone(midi(chord[0] - 12), t, { type: "sine", gain: 0.2, attack: 0.02, decay: 0.9 });
  if (s === 0 || s === 8 || (s === 11 && Math.random() < 0.4)) kick(t);
  if (s === 4 || s === 12) noiseHit(t, { gain: 0.09, decay: 0.2, type: "bandpass", freq: 1800 });
  if (s % 4 === 2) noiseHit(at, { gain: 0.035, decay: 0.05 });
  if (s % 2 === 0 && Math.random() < 0.42) {
    const n = chord[Math.floor(Math.random() * chord.length)] + 12;
    tone(midi(n), at, { type: "sine", gain: 0.055, attack: 0.01, decay: 0.7 });
    const delay = Math.max(0, (at - music.ctx.currentTime) * 1000);
    setTimeout(() => {
      const now = performance.now();
      if (now - lastFloat > 650) { lastFloat = now; floatFromPlayer(); }
    }, delay);
  }
};

const scheduler = () => {
  const { ctx } = music;
  while (music.nextTime < ctx.currentTime + 0.15) {
    scheduleStep(music.step, music.nextTime);
    music.nextTime += SIXTEENTH;
    music.step += 1;
  }
};

const toggles = document.querySelectorAll("[data-toggle-music]");
const npState = document.querySelector(".np-state");
const playLabel = document.querySelector(".play-label");

const setPlayingUI = (on) => {
  document.body.classList.toggle("is-playing", on);
  toggles.forEach((b) => {
    b.classList.toggle("is-playing", on);
    b.setAttribute("aria-label", on ? "Pause the sunset mix" : "Play the sunset mix");
  });
  if (npState) npState.textContent = on ? "playing" : "paused";
  if (playLabel) playLabel.textContent = on ? "Pause the sunset mix" : "Play the sunset mix";
  onScroll();
};

const play = () => {
  const ctx = initAudio();
  if (!ctx) return;
  ctx.resume();
  startCrackle();
  const now = ctx.currentTime;
  music.master.gain.cancelScheduledValues(now);
  music.master.gain.setValueAtTime(music.master.gain.value, now);
  music.master.gain.linearRampToValueAtTime(0.9, now + 1.2);
  music.nextTime = now + 0.1;
  music.step = 0;
  clearInterval(music.timer);
  music.timer = setInterval(scheduler, 25);
  music.playing = true;
  setPlayingUI(true);
};

const pause = () => {
  if (!music.ctx) return;
  clearInterval(music.timer);
  music.timer = null;
  const now = music.ctx.currentTime;
  music.master.gain.cancelScheduledValues(now);
  music.master.gain.setValueAtTime(music.master.gain.value, now);
  music.master.gain.linearRampToValueAtTime(0.0001, now + 0.8);
  // bring level back for the playable keys once the fade finishes
  setTimeout(() => {
    if (!music.playing && music.ctx) music.master.gain.setValueAtTime(0.9, music.ctx.currentTime);
  }, 900);
  if (music.crackle) {
    music.crackle.gain.gain.setValueAtTime(music.crackle.gain.gain.value, now);
    music.crackle.gain.gain.linearRampToValueAtTime(0, now + 0.8);
    music.crackle.src.stop(now + 0.85);
    music.crackle = null;
  }
  music.playing = false;
  setPlayingUI(false);
};

toggles.forEach((b) => b.addEventListener("click", () => (music.playing ? pause() : play())));

/* ---------- Floating music notes ---------- */
const GLYPHS = ["♪", "♫", "♬", "♩"];
const spawnNote = (x, y) => {
  if (reduceMotion) return;
  const el = document.createElement("span");
  el.className = "note-float";
  el.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.setProperty("--dx", `${Math.round(Math.random() * 60 - 30)}px`);
  el.style.setProperty("--rot", `${Math.round(Math.random() * 40 - 20)}deg`);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1900);
};
const floatFromPlayer = () => {
  const source =
    [document.querySelector(".deck .record"), document.querySelector(".play-cta[data-toggle-music]"), nowPlaying]
      .map((el) => el?.getBoundingClientRect())
      .find((r) => r && r.width && r.bottom > 0 && r.top < window.innerHeight);
  if (source) spawnNote(source.left + source.width / 2 - 8, source.top);
};

/* ---------- Playable keys ---------- */
const keys = [...document.querySelectorAll(".key")];
const KEYBOARD = ["a", "s", "d", "f", "g", "h", "j", "k"];
const hitKey = (i) => {
  const ctx = initAudio();
  if (ctx) {
    ctx.resume();
    if (!music.playing) music.master.gain.setValueAtTime(0.9, ctx.currentTime);
    const t = ctx.currentTime + 0.01;
    tone(midi(KEY_NOTES[i]), t, { type: "triangle", gain: 0.14, attack: 0.01, decay: 1.1 });
    tone(midi(KEY_NOTES[i] + 12), t, { type: "sine", gain: 0.05, attack: 0.01, decay: 0.8 });
  }
  const key = keys[i];
  if (!key) return;
  key.classList.add("is-hit");
  setTimeout(() => key.classList.remove("is-hit"), 170);
  const r = key.getBoundingClientRect();
  spawnNote(r.left + r.width / 2 - 8, r.top - 6);
};
keys.forEach((k, i) => k.addEventListener("pointerdown", () => hitKey(i)));
keys.forEach((k, i) =>
  k.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); hitKey(i); }
  })
);
document.addEventListener("keydown", (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const i = KEYBOARD.indexOf(e.key.toLowerCase());
  if (i === -1) return;
  const deck = document.querySelector(".deck");
  const r = deck?.getBoundingClientRect();
  if (!r || r.bottom < 0 || r.top > window.innerHeight) return; // only while the keys are on screen
  hitKey(i);
});

/* ---------- Animation loop: snow, horizon wave, EQ ---------- */
const eqBars = [...document.querySelectorAll(".deck-eq i")];
let timeData = null;
let freqData = null;

const drawWave = () => {
  if (!waveCtx) return;
  waveCtx.clearRect(0, 0, sceneW, sceneH);
  if (!music.analyser || !music.playing || window.scrollY > sceneH) return;
  timeData = timeData || new Uint8Array(music.analyser.fftSize);
  music.analyser.getByteTimeDomainData(timeData);
  waveCtx.lineWidth = 2;
  waveCtx.strokeStyle = "rgba(255, 220, 160, 0.9)";
  waveCtx.shadowColor = "rgba(255, 190, 120, 0.9)";
  waveCtx.shadowBlur = 14;
  waveCtx.beginPath();
  const n = timeData.length;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * sceneW;
    const edge = Math.sin((i / (n - 1)) * Math.PI); // taper towards the edges
    const y = horizonY - 4 + ((timeData[i] - 128) / 128) * 60 * edge;
    i === 0 ? waveCtx.moveTo(x, y) : waveCtx.lineTo(x, y);
  }
  waveCtx.stroke();
};

const drawEq = () => {
  if (!eqBars.length) return;
  if (!music.analyser || !music.playing) {
    eqBars.forEach((b) => (b.style.height = "10%"));
    return;
  }
  freqData = freqData || new Uint8Array(music.analyser.frequencyBinCount);
  music.analyser.getByteFrequencyData(freqData);
  eqBars.forEach((b, i) => {
    const lo = Math.floor(Math.pow(i / eqBars.length, 2) * 180) + 1;
    const hi = Math.floor(Math.pow((i + 1) / eqBars.length, 2) * 180) + 2;
    let sum = 0;
    for (let k = lo; k < hi; k++) sum += freqData[k];
    const v = sum / (hi - lo) / 255;
    b.style.height = `${Math.max(10, Math.min(100, v * 120))}%`;
  });
};

const loop = () => {
  if (!reduceMotion && window.scrollY < sceneH) drawSnow();
  drawWave();
  drawEq();
  requestAnimationFrame(loop);
};

sizeCanvases();
let lastW = window.innerWidth;
let lastH = window.innerHeight;
window.addEventListener("resize", () => {
  // phones fire resize when the address bar shows/hides; only rebuild on real size changes
  if (window.innerWidth !== lastW || Math.abs(window.innerHeight - lastH) > 160) {
    lastW = window.innerWidth;
    lastH = window.innerHeight;
    sizeCanvases();
  }
});
onScroll();
if (reduceMotion) drawSnow();
requestAnimationFrame(loop);

/* ---------- Reels: muted clips that play only while on screen ---------- */
document.querySelectorAll(".reel video, .lens-btn--video video").forEach((video) => {
  const box = video.closest(".reel, .lens-btn--video");
  if (reduceMotion || !("IntersectionObserver" in window)) return;
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting) { video.preload = "auto"; video.play().then(() => box.classList.add("is-playing")).catch(() => {}); }
    else video.pause();
  }, { threshold: 0.5 }).observe(box);
});

/* ---------- Lens gallery: masonry rows from each frame's aspect ratio ---------- */
const lensGrid = document.querySelector(".lens");
const layoutLens = () => {
  if (!lensGrid) return;
  const items = [...lensGrid.children];
  if (!items.length) return;
  const colW = items[0].getBoundingClientRect().width;
  const gap = parseFloat(getComputedStyle(items[0]).marginBottom) || 0;
  const rowH = parseFloat(getComputedStyle(lensGrid).gridAutoRows) || 4;
  items.forEach((li) => {
    const btn = li.querySelector(".lens-btn");
    const img = li.querySelector("img");
    const ratio = btn?.classList.contains("lens-crop") ? 1.6 : (+img.getAttribute("height") / +img.getAttribute("width")) || 1;
    li.style.gridRowEnd = "span " + Math.ceil((colW * ratio + gap) / rowH);
  });
};
layoutLens();
addEventListener("resize", layoutLens);

/* ---------- Beach football ---------- */
const field = document.querySelector(".pitch-field");
const ball = field?.querySelector(".ball");
const keeper = field?.querySelector(".keeper");
const shootBtn = document.querySelector(".shoot");
const goalsEl = document.querySelector(".goals");
const savesEl = document.querySelector(".saves");
let goals = 0;
let saves = 0;
const keeperY = () => {
  const tr = keeper ? getComputedStyle(keeper).transform : "none";
  return tr && tr !== "none" ? new DOMMatrixReadOnly(tr).m42 : 0;
};
shootBtn?.addEventListener("click", () => {
  if (!field || !ball || !keeper) return;
  shootBtn.disabled = true;
  field.classList.remove("is-goal", "is-save");
  const target = Math.round(Math.random() * 90 - 45);
  ball.style.left = "calc(100% - 38px)";
  ball.style.top = `calc(50% + ${target}px)`;
  ball.style.transform = "rotate(540deg) scale(0.85)";
  setTimeout(() => {
    keeper.style.animationPlayState = "paused";
    if (Math.abs(keeperY() - target) < 26) {
      saves += 1;
      field.classList.add("is-save");
      ball.style.left = "60%";
    } else {
      goals += 1;
      field.classList.add("is-goal");
      const r = field.getBoundingClientRect();
      for (let i = 0; i < 4; i++) setTimeout(() => spawnNote(r.right - 60 - Math.random() * 80, r.top + r.height / 2), i * 120);
    }
    if (goalsEl) goalsEl.textContent = String(goals);
    if (savesEl) savesEl.textContent = String(saves);
  }, 600);
  setTimeout(() => {
    field.classList.remove("is-goal", "is-save");
    keeper.style.animationPlayState = "";
    ball.style.transition = "none";
    ball.style.left = "";
    ball.style.top = "";
    ball.style.transform = "";
    void ball.offsetWidth;
    ball.style.transition = "";
    shootBtn.disabled = false;
  }, 1800);
});
