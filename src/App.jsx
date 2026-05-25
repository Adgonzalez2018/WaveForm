import React, { useEffect, useRef, useState, useCallback } from "react";
import "./styles.css";

// ─── constants ───────────────────────────────────────────────────────────────
const W = 6000;
const H = 1371;
const MID = H / 2;
const PT = 2200;
const SPACING = 4;

const DEFAULTS = {
  wordA: "INEVERSEEYOU",
  wordB: "PRESENTS",
  amplitude: 160,
  morphDuration: 2000,
  holdDuration: 1200,
  dotRadius: 3.2,
  noiseLevel: 3,   // 1-5
  grainLevel: 0,
  bitcrushLevel: 0,
  brokennessLevel: 0,
  dotColor: "#000000",
  bgColor: "white",
};

// ─── math helpers ────────────────────────────────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function eio(t) { return 0.5 - 0.5 * Math.cos(Math.PI * t); }

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function seededRand(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleSeeded(arr, seed) {
  const a = [...arr];
  const r = seededRand(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fitPts(pts, n, seed) {
  if (!pts.length) return Array.from({ length: n }, () => ({ x: W / 2, y: H / 2 }));
  const s = shuffleSeeded(pts, seed);
  const out = s.slice(0, Math.min(s.length, n));
  let i = 0;
  while (out.length < n) out.push(s[i++ % s.length]);
  return out;
}

function getDFS(text) {
  const l = text.length;
  if (l <= 8) return 120;
  if (l <= 12) return 108;
  if (l <= 16) return 96;
  if (l <= 22) return 82;
  if (l <= 30) return 68;
  return 56;
}

function buildTextPoints(text) {
  const oc = document.createElement("canvas");
  oc.width = W; oc.height = H;
  const ctx = oc.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `400 ${getDFS(text)}px Futura, sans-serif`;
  ctx.fillText(text.toUpperCase(), W / 2, H / 2);
  const data = ctx.getImageData(0, 0, W, H).data;
  const pts = [];
  for (let y = 0; y < H; y += SPACING)
    for (let x = 0; x < W; x += SPACING)
      if (data[(y * W + x) * 4 + 3] > 50) pts.push({ x, y });
  return pts;
}

function getBounds(pts) {
  if (!pts.length) return { cx: W / 2, w: W * 0.5 };
  let minX = Infinity, maxX = -Infinity;
  for (const p of pts) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; }
  return { cx: (minX + maxX) / 2, w: maxX - minX };
}

function normalizeSamples(raw) {
  if (!raw || !raw.length) return [];
  const mean = raw.reduce((s, v) => s + v, 0) / raw.length;
  const c = raw.map(v => v - mean);
  const peak = Math.max(...c.map(v => Math.abs(v)), 1e-6);
  return c.map(v => v / peak);
}

function bitcrushSamples(samples, level) {
  if (!samples.length || level <= 0) return samples;
  const steps = Math.max(1, Math.round(32 / Math.pow(2, level - 1)));
  return samples.map(s => Math.round(s * steps) / steps);
}

// ─── noisy wave builder ───────────────────────────────────────────────────────
// noiseLevel 1-5 controls how distorted/chaotic the wave looks
function buildWaveTargets(samples, count, bounds, t_anim, amplitude, noiseLevel) {
  const { cx, w } = bounds;
  const pw = Math.max(w * 1.1, W * 0.72);
  const sx = cx - pw / 2, ex = cx + pw / 2;

  // noise scale factors per level
  const NL = noiseLevel;
  const microScale  = 4  + NL * 8;      // fast wiggles
  const macroScale  = 1  + NL * 3;      // slow undulation amplitude
  const derivBoost  = 20 + NL * 22;     // edge sharpening
  const jitterAmp   = 1  + NL * 3.5;    // per-point jitter
  const laneSpread  = 2  + NL * 2.8;    // lane width
  const harmonics   = 2  + NL;          // extra sine harmonics
  const driftSpeed  = 0.18 + NL * 0.08;
  const warp        = NL * 0.015;       // non-linear time warp

  const drift = t_anim * driftSpeed;
  const wb1 = t_anim * (1.3 + NL * 0.4);
  const wb2 = t_anim * (2.1 + NL * 0.6);
  const wb3 = t_anim * (3.7 + NL * 0.3);

  const rand = seededRand(42 + NL * 7);

  const pts = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);

    // warped sample lookup — higher noise = more chaotic phase modulation
    const phase1 = rand() * Math.PI * 2;
    const phase2 = rand() * Math.PI * 2;
    const phase3 = rand() * Math.PI * 2;
    const warpedT = t + Math.sin(t * 8 + wb1 + phase1) * warp
                      + Math.sin(t * 23 + wb2 + phase2) * warp * 0.5;

    const samplePos = (((warpedT + drift) % 1) + 1) % 1;

    let y = MID;

    if (samples.length > 0) {
      const fi = samplePos * (samples.length - 1);
      const i0 = Math.floor(fi), i1 = Math.min(samples.length - 1, i0 + 1);
      const s = lerp(samples[i0] ?? 0, samples[i1] ?? 0, fi - i0);
      const prev = samples[Math.max(0, i0 - 1)] ?? 0;
      const next = samples[Math.min(samples.length - 1, i1 + 1)] ?? 0;
      const deriv = next - prev;

      // stacked harmonic noise
      let harmNoise = 0;
      for (let h = 1; h <= harmonics; h++) {
        harmNoise += Math.sin(t * (18 * h) + wb1 * h * 0.7 + phase1 * h) * (macroScale / h);
        harmNoise += Math.sin(t * (41 * h) + wb2 * h * 0.5 + phase2 * h) * (macroScale * 0.4 / h);
      }

      const microNoise =
        Math.sin(t * 74 + wb3 + phase3) * microScale +
        Math.sin(t * 137 + wb1 + phase2) * microScale * 0.5 +
        Math.sin(t * 223 + wb2 + phase1) * microScale * 0.25;

      const lane = (i % 5) - 2;
      const laneOff = lane * laneSpread;

      // per-point jitter — high noise makes individual dots jump around
      const jx = (rand() - 0.5) * jitterAmp * 3;
      const jy = (rand() - 0.5) * jitterAmp;

      y = clamp(
        MID + s * amplitude + deriv * derivBoost + harmNoise + microNoise + laneOff + jy,
        2, H - 2
      );

      pts.push({
        x: lerp(sx, ex, t) + Math.sin(t * 14 + wb1 * 0.9 + phase1) * (1.5 + NL) + jx,
        y,
      });
    } else {
      // fallback: pure synth wave, gets noisier with level
      let harmSum = 0;
      for (let h = 1; h <= harmonics; h++) {
        harmSum += Math.sin(t * Math.PI * (10 * h) + t_anim * (1.5 + h * 0.4)) * (amplitude * 0.35 / h);
      }
      const micro = Math.sin(t * 210 + wb3) * microScale * 0.5;
      y = clamp(MID + harmSum + micro, 2, H - 2);
      pts.push({ x: lerp(sx, ex, t), y });
    }
  }
  return pts;
}

// ─── Audio helpers ────────────────────────────────────────────────────────────
async function decodeAudioFile(buf) {
  const ac = new AudioContext();
  const decoded = await ac.decodeAudioData(buf);
  const ch = decoded.getChannelData(0);
  const step = Math.max(1, Math.floor(ch.length / 3000));
  const samples = [];
  for (let i = 0; i < ch.length; i += step) samples.push(ch[i]);
  return normalizeSamples(samples);
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function App() {
  const svgRef = useRef(null);
  const rafRef = useRef(null);
  const stateRef = useRef({
    ptsA: [], ptsB: [], wavePts: [],
    stage: "from",
    stageStart: performance.now(),
    t_anim: 0,
    lastFrame: performance.now(),
    audioSamples: [],
    amplitude: DEFAULTS.amplitude,
    morphDuration: DEFAULTS.morphDuration,
    holdDuration: DEFAULTS.holdDuration,
    dotRadius: DEFAULTS.dotRadius,
    noiseLevel: DEFAULTS.noiseLevel,
    grainLevel: DEFAULTS.grainLevel,
    bitcrushLevel: DEFAULTS.bitcrushLevel,
    brokennessLevel: DEFAULTS.brokennessLevel,
    pendingRebuild: false,
    wordA: DEFAULTS.wordA,
    wordB: DEFAULTS.wordB,
    liveMic: false,
    micAnalyser: null,
    micBuf: null,
  });

  const [wordA, setWordA] = useState(DEFAULTS.wordA);
  const [wordB, setWordB] = useState(DEFAULTS.wordB);
  const [amplitude, setAmplitude] = useState(DEFAULTS.amplitude);
  const [morphDuration, setMorphDuration] = useState(DEFAULTS.morphDuration);
  const [dotRadius, setDotRadius] = useState(DEFAULTS.dotRadius);
  const [noiseLevel, setNoiseLevel] = useState(DEFAULTS.noiseLevel);
  const [grainLevel, setGrainLevel] = useState(DEFAULTS.grainLevel);
  const [bitcrushLevel, setBitcrushLevel] = useState(DEFAULTS.bitcrushLevel);
  const [brokennessLevel, setBrokennessLevel] = useState(DEFAULTS.brokennessLevel);
  const [dotColor, setDotColor] = useState(DEFAULTS.dotColor);
  const [bgColor, setBgColor] = useState(DEFAULTS.bgColor);
  const [isRecording, setIsRecording] = useState(false);
  const [audioLabel, setAudioLabel] = useState("no audio");
  const [liveMic, setLiveMic] = useState(false);
  const mediaRecRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const fileRef = useRef(null);

  // sync sliders into ref
  useEffect(() => { stateRef.current.amplitude = amplitude; }, [amplitude]);
  useEffect(() => { stateRef.current.morphDuration = morphDuration; stateRef.current.holdDuration = Math.round(morphDuration * 0.6); }, [morphDuration]);
  useEffect(() => { stateRef.current.dotRadius = dotRadius; }, [dotRadius]);
  useEffect(() => { stateRef.current.noiseLevel = noiseLevel; }, [noiseLevel]);
  useEffect(() => { stateRef.current.grainLevel = grainLevel; }, [grainLevel]);
  useEffect(() => { stateRef.current.bitcrushLevel = bitcrushLevel; }, [bitcrushLevel]);
  useEffect(() => { stateRef.current.brokennessLevel = brokennessLevel; }, [brokennessLevel]);
  useEffect(() => { stateRef.current.wordA = wordA; stateRef.current.wordB = wordB; stateRef.current.pendingRebuild = true; }, [wordA, wordB]);

  const rebuildPoints = useCallback(() => {
    const s = stateRef.current;
    const rawA = buildTextPoints(s.wordA);
    const rawB = buildTextPoints(s.wordB);
    s.ptsA = fitPts(rawA, PT, hashStr(s.wordA));
    s.ptsB = fitPts(rawB, PT, hashStr(s.wordB));
    s.pendingRebuild = false;
  }, []);

  function getLiveSamples() {
    const s = stateRef.current;
    if (s.liveMic && s.micAnalyser && s.micBuf) {
      s.micAnalyser.getFloatTimeDomainData(s.micBuf);
      return normalizeSamples(Array.from(s.micBuf));
    }
    return s.audioSamples;
  }

  function getWaveBounds(morphT) {
    const s = stateRef.current;
    const bA = getBounds(s.ptsA), bB = getBounds(s.ptsB);
    return { cx: lerp(bA.cx, bB.cx, morphT), w: lerp(bA.w, bB.w, morphT) };
  }

  function getEffectSamples() {
    const s = stateRef.current;
    return bitcrushSamples(getLiveSamples(), s.bitcrushLevel);
  }

  // SVG render — update circle positions directly for perf
  function renderFrame(now) {
    const s = stateRef.current;
    const dt = (now - s.lastFrame) / 1000;
    s.lastFrame = now;
    s.t_anim += dt;

    const elapsed = now - s.stageStart;
    const {
      morphDuration: md,
      holdDuration: hd,
      amplitude: amp,
      dotRadius: dr,
      noiseLevel: nl,
      grainLevel: grain,
      brokennessLevel: brokenness,
    } = s;

    let morphT = 0;
    let rendPts = [];

    if (s.stage === "from") {
      rendPts = s.ptsA;
      if (elapsed >= hd) { s.stage = "collapse"; s.stageStart = now; }
    } else if (s.stage === "collapse") {
      const e = eio(clamp(elapsed / md, 0, 1));
      morphT = e * 0.45;
      s.wavePts = buildWaveTargets(getEffectSamples(), PT, getWaveBounds(morphT), s.t_anim, amp, nl);
      rendPts = s.ptsA.map((a, i) => ({ x: lerp(a.x, s.wavePts[i].x, e), y: lerp(a.y, s.wavePts[i].y, e) }));
      if (elapsed >= md) { s.stage = "wave"; s.stageStart = now; }
    } else if (s.stage === "wave") {
      morphT = 0.5;
      s.wavePts = buildWaveTargets(getEffectSamples(), PT, getWaveBounds(morphT), s.t_anim, amp, nl);
      rendPts = s.wavePts;
      if (elapsed >= hd) { s.stage = "expand"; s.stageStart = now; }
    } else if (s.stage === "expand") {
      const rawE = clamp(elapsed / md, 0, 1);
      const e = 1 - Math.pow(1 - rawE, 3);
      morphT = 0.55 + e * 0.45;
      s.wavePts = buildWaveTargets(getEffectSamples(), PT, getWaveBounds(morphT), s.t_anim, amp, nl);
      rendPts = s.ptsB.map((b, i) => ({ x: lerp(s.wavePts[i].x, b.x, e), y: lerp(s.wavePts[i].y, b.y, e) }));
      if (elapsed >= md) { s.stage = "to"; s.stageStart = now; }
    } else {
      rendPts = s.ptsB;
      if (elapsed >= hd) {
        if (s.pendingRebuild) rebuildPoints();
        // swap A/B
        [s.ptsA, s.ptsB] = [s.ptsB, s.ptsA];
        s.stage = "from"; s.stageStart = now;
      }
    }

    // update SVG circles
    const svg = svgRef.current;
    if (svg && rendPts.length) {
      const circles = svg.querySelectorAll("circle");
      const grainAmp = grain * 3;
      const brokenChance = brokenness * 0.04;
      for (let i = 0; i < circles.length && i < rendPts.length; i++) {
        let x = rendPts[i].x;
        let y = rendPts[i].y;

        if (grainAmp > 0) {
          x += (Math.random() - 0.5) * grainAmp;
          y += (Math.random() - 0.5) * grainAmp;
        }

        if (brokenChance > 0 && Math.random() < brokenChance) {
          x = Math.random() * W;
          y = Math.random() * H;
        }

        circles[i].setAttribute("cx", x.toFixed(1));
        circles[i].setAttribute("cy", y.toFixed(1));
        circles[i].setAttribute("r", dr);
      }
    }

    rafRef.current = requestAnimationFrame(renderFrame);
  }

  // init
  useEffect(() => {
    rebuildPoints();
    rafRef.current = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── audio controls ──
  const handleUpload = () => fileRef.current?.click();

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    stateRef.current.liveMic = false;
    setLiveMic(false);
    const buf = await file.arrayBuffer();
    stateRef.current.audioSamples = await decodeAudioFile(buf);
    setAudioLabel(file.name.slice(0, 24));
    e.target.value = "";
  };

  const handleRecord = async () => {
    if (!isRecording) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = e => recordedChunksRef.current.push(e.data);
      mr.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, { type: "audio/webm" });
        const buf = await blob.arrayBuffer();
        stateRef.current.audioSamples = await decodeAudioFile(buf);
        stateRef.current.liveMic = false;
        setLiveMic(false);
        setAudioLabel("recorded clip");
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      mediaRecRef.current = mr;
      setIsRecording(true);
      setAudioLabel("recording…");
    } else {
      mediaRecRef.current?.stop();
      setIsRecording(false);
    }
  };

  const handleMicLive = async () => {
    const s = stateRef.current;
    if (s.liveMic) {
      s.liveMic = false;
      s.micAnalyser = null;
      setLiveMic(false);
      setAudioLabel("no audio");
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ac = new AudioContext();
    const src = ac.createMediaStreamSource(stream);
    const analyser = ac.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);
    s.micAnalyser = analyser;
    s.micBuf = new Float32Array(analyser.fftSize);
    s.liveMic = true;
    setLiveMic(true);
    setAudioLabel("live mic");
  };

  // pre-create circle elements
  const circles = Array.from({ length: PT }, (_, i) => (
    <circle key={i} cx={W / 2} cy={H / 2} r={dotRadius} className="dot" style={{ fill: dotColor }} />
  ));

  return (
    <div className="App" style={{ background: bgColor === "black" ? "#000" : "#fff" }}>
      <div className="frame">
        <svg
          ref={svgRef}
          className="scene"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {circles}
        </svg>
      </div>

      {/* ── Controls overlay ── */}
      <div className="controls-panel">
        <div className="ctrl-row">
          <div className="ctrl-group">
            <label>Phrase A</label>
            <input
              type="text"
              value={wordA}
              maxLength={30}
              onChange={e => setWordA(e.target.value.toUpperCase())}
            />
          </div>
          <div className="ctrl-group">
            <label>Phrase B</label>
            <input
              type="text"
              value={wordB}
              maxLength={30}
              onChange={e => setWordB(e.target.value.toUpperCase())}
            />
          </div>
        </div>

        <div className="ctrl-row">
          <div className="ctrl-group">
            <label>Amplitude — {amplitude}</label>
            <input type="range" min={1} max={2000} step={1} value={amplitude} onChange={e => setAmplitude(+e.target.value)} />
          </div>
          <div className="ctrl-group">
            <label>Distortion - {noiseLevel}</label>
            <input type="range" min={1} max={1200} step={1} value={noiseLevel} onChange={e => setNoiseLevel(+e.target.value)} />
          </div>
        </div>

        <div className="ctrl-row">
          <div className="ctrl-group">
            <label>Morph speed — {(morphDuration / 1000).toFixed(1)}s</label>
            <input type="range" min={400} max={8000} step={100} value={morphDuration} onChange={e => setMorphDuration(+e.target.value)} />
          </div>
          <div className="ctrl-group">
            <label>Size - {dotRadius}</label>
            <input type="range" min={1} max={12} step={0.5} value={dotRadius} onChange={e => setDotRadius(+e.target.value)} />
          </div>
        </div>

        <div className="ctrl-row effect-row">
          <div className="ctrl-group">
            <label>Grain - {grainLevel}</label>
            <input type="range" min={0} max={20} step={1} value={grainLevel} onChange={e => setGrainLevel(+e.target.value)} />
          </div>
          <div className="ctrl-group">
            <label>Bitcrush - {bitcrushLevel}</label>
            <input type="range" min={0} max={30} step={1} value={bitcrushLevel} onChange={e => setBitcrushLevel(+e.target.value)} />
          </div>
          <div className="ctrl-group">
            <label>Brokenness - {brokennessLevel}</label>
            <input type="range" min={0} max={24} step={1} value={brokennessLevel} onChange={e => setBrokennessLevel(+e.target.value)} />
          </div>
        </div>

        <div className="ctrl-row color-row">
          <div className="ctrl-group color-control">
            <label>Dot color</label>
            <label className="color-swatch dot-color-swatch" style={{ background: dotColor }}>
              <input type="color" value={dotColor} onChange={e => setDotColor(e.target.value)} aria-label="Dot color" />
            </label>
          </div>
          <div className="ctrl-group color-control">
            <label>Background</label>
            <div className="bg-toggle">
              <button
                type="button"
                className={bgColor === "white" ? "active-white" : ""}
                onClick={() => setBgColor("white")}
              >
                White
              </button>
              <button
                type="button"
                className={bgColor === "black" ? "active-black" : ""}
                onClick={() => setBgColor("black")}
              >
                Black
              </button>
            </div>
          </div>
        </div>

        <div className="ctrl-row audio-row">
          <span className="audio-label">{audioLabel}</span>
          <button className={`btn ${isRecording ? "btn-stop" : "btn-rec"}`} onClick={handleRecord}>
            {isRecording ? "⏹ stop" : "⏺ record"}
          </button>
          <button className="btn" onClick={handleUpload}>upload</button>
          <button className={`btn ${liveMic ? "btn-live" : ""}`} onClick={handleMicLive}>
            {liveMic ? "■ mic off" : "mic live"}
          </button>
          <input ref={fileRef} type="file" accept="audio/*" style={{ display: "none" }} onChange={handleFile} />
        </div>
      </div>
    </div>
  );
}
