const TARGET_SAMPLE_COUNT = 3000;
const EMPTY_SAMPLES = new Float32Array(0);

export function phraseToRecordingFilename(phrase) {
  return String(phrase)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, "_");
}

function collectPhraseText(pair) {
  if (Array.isArray(pair)) {
    return pair.filter(value => typeof value === "string");
  }

  if (pair && typeof pair === "object") {
    return [
      pair.phraseA,
      pair.phraseB,
      pair.wordA,
      pair.wordB,
      pair.from,
      pair.to,
      pair.a,
      pair.b,
    ].filter(value => typeof value === "string");
  }

  return typeof pair === "string" ? [pair] : [];
}

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  return new AudioContextClass();
}

function downsampleChannel(channelData, targetCount = TARGET_SAMPLE_COUNT) {
  if (!channelData.length) return EMPTY_SAMPLES;

  const sampleCount = Math.min(targetCount, channelData.length);
  const samples = new Float32Array(sampleCount);

  if (sampleCount === 1) {
    samples[0] = channelData[0];
    return samples;
  }

  const ratio = (channelData.length - 1) / (sampleCount - 1);
  for (let i = 0; i < sampleCount; i++) {
    samples[i] = channelData[Math.round(i * ratio)];
  }

  return samples;
}

function normalizeSamples(samples) {
  if (!samples.length) return EMPTY_SAMPLES;

  let peak = 0;
  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample));
  }

  if (peak <= 0) return samples;

  const normalized = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    normalized[i] = samples[i] / peak;
  }

  return normalized;
}

async function loadRecordingForPhrase(audioContext, phraseText) {
  const filename = phraseToRecordingFilename(phraseText);
  if (!filename) return EMPTY_SAMPLES;

  try {
    const response = await fetch(`/recordings/${filename}.wav`);
    if (!response.ok) return EMPTY_SAMPLES;

    const audioBuffer = await audioContext.decodeAudioData(await response.arrayBuffer());
    const channelData = audioBuffer.getChannelData(0);
    return normalizeSamples(downsampleChannel(channelData));
  } catch {
    return EMPTY_SAMPLES;
  }
}

export async function loadRecordings(PAIRS) {
  const phrases = new Set();
  for (const pair of PAIRS) {
    for (const phraseText of collectPhraseText(pair)) {
      phrases.add(phraseText);
    }
  }

  const audioContext = getAudioContext();
  const entries = await Promise.all(
    [...phrases].map(async phraseText => [
      phraseText,
      await loadRecordingForPhrase(audioContext, phraseText),
    ])
  );

  await audioContext.close?.();

  return new Map(entries);
}
