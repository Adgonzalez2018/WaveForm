# AGENTS.md

## Project
Wavemorph is a Vite/React real-time dot-particle word morpher with audio waveform distortion.

## Branches
- `main`: live interactive tool with user-controlled words, sliders, uploads, recording, and mic input.
- `video`: automated poem sequence using fixed PAIRS and matching `.wav` files from `public/recordings/`.

## Setup
- Install with `npm install`
- Run with `npm run dev`
- Build with `npm run build`

## Important files
- `src/App.jsx` contains the main animation and poem logic.
- `public/Futura-Light-Oblique.otf` is the required font.
- `public/recordings/` contains the `.wav` files for the video branch.

## Rules for changes
- Keep the visual style minimal: white background, Futura-style typography, dot-particle morphing.
- Do not remove the phrase A to phrase B morphing behavior.
- On the `video` branch, preserve the fixed poem sequence unless asked to change it.
- Keep changes small and focused.
- Run `npm run build` before finishing.