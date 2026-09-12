# SyncCut - AI Video Aligner & Premiere XML Generator

**SyncCut** is a lightweight, high-performance desktop application built with **Tauri v2 + React 19 + TypeScript + Tailwind CSS** designed for automated video pre-production and editing.

It downloads YouTube B-roll footage, ingests voiceover files (`.mp4`, `.wav`) and script text (`.txt`), performs AI Forced Alignment to map spoken timestamps down to the millisecond, distributes video and image assets according to user-configurable interleaving ratios, and exports an Apple Final Cut Pro 7 / Adobe Premiere Pro XML (`<xmeml version="4">`) sequence ready for instant post-production.

---

## Key Features

- **⚡ 1-Click Load Demo**: Instantly loads sample voiceover, script, and B-roll footage to test the full pipeline in seconds.
- **🎙️ AI Forced Alignment Engine**: Uses Whisper / Faster-Whisper with Ground Truth script matching to prevent spelling mistakes and ensure zero audio drift.
- **🎬 Smart Interleaving Controller**:
  - Configurable Video B-roll vs Static Image ratio (0% to 100%).
  - Pattern modes: *Weighted Ratio*, *Strict Alternate (1-1)*, *Random Mix*.
  - Minimum and Maximum scene duration pacing controls.
- **📁 Adobe Premiere Pro XML (XMEML v4) Export**:
  - Generates synchronized Video Track 1 and Audio Track 1 with frame-accurate In/Out/Start/End points.
  - Native file path resolution for seamless zero-offline-media opening in Adobe Premiere CC.
- **🎨 Modern GitHub Dark Aesthetic**: Clean, solid dark theme with subtle ash-gray borders, Plus Jakarta Sans typography, and zero distracting glow effects.

---

## Development & Build Guide

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/) (Cargo 1.80+)
- [FFmpeg](https://ffmpeg.org/) (installed and in PATH)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) (installed and in PATH)
- Python 3.9+

### Quick Start (Dev Mode)
```bash
# Install frontend dependencies
npm install

# Run Desktop Dev App with Hot Module Reloading
npm run tauri dev
```

### Production Build (Windows Standalone .exe / .msi)
```bash
# Build desktop production executable
npm run tauri build
```
The compiled installer will be generated in `src-tauri/target/release/bundle/`.

---

## License
MIT License
