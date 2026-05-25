# Wavemorph

Real-time dot-particle word morpher with audio waveform distortion.

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```

2. Run dev server:
   ```bash
   npm run dev
   ```

3. Build for production:
   ```bash
   npm run build
   ```
   Output goes to `dist/`. Deploy that folder, with the font file alongside the other assets.

## Controls (bottom panel)

| Control | Description |
|---|---|
| Phrase A / Phrase B | Words to morph between (auto-cycles A→B→A) |
| Amplitude | How tall the waveform gets |
| Morph speed | How long each transition takes in seconds |
| Distortion | Wave chaos level — stacks harmonic noise, phase warp, and edge sharpening |
| Size | Radius of each particle dot |
| Grain | Random per-frame positional scatter applied to every dot |
| Bitcrush | Quantizes the audio waveform to fewer amplitude steps — crunchy staircase effect |
| Brokenness | Randomly teleports a percentage of dots to new positions each frame |
| Dot color | Color picker for all particle dots |
| Background | Toggle between white and black background |
| ⏺ Record | Record a clip from your mic — plays as the waveform shape |
| Upload | Upload any audio file (wav, mp3, ogg, etc.) |
| Mic live | Stream live mic input directly into the wave in real time |

## How effects interact with audio

The audio source (recorded clip, upload, or live mic) determines the **base shape** of the wave. All effect sliders modify the dots on top of that shape every frame — so a recorded voice with high Bitcrush and Grain will look very different from the raw waveform. With no audio loaded, a synthetic fallback wave is used instead.

## Customising the word pairs

To run an automatic sequence cycling through a fixed list of pairs, replace the word inputs with the `flattenPairsToSequence` logic from the original codebase and define a `PAIRS` array at the top of `App.jsx`. The real-time control panel and the automated sequence mode are easy to swap between.
