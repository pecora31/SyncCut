# SyncCut

High-performance desktop utility for automated speech-to-video alignment and NLE timeline sequence generation (Final Cut Pro 7 / Premiere Pro XML). Built on Tauri v2, Rust, and React.

## Overview

SyncCut automates the pre-editing pipeline by synchronizing voiceover tracks with script segments down to millisecond accuracy, matching visual footage, and exporting production-ready timeline sequences directly into NLE software (Adobe Premiere Pro, DaVinci Resolve, Final Cut Pro) without manual timeline slicing or transcodes.

## Architecture

1. **Asset Management & Media Pool**: Local file indexing and native asset protocol streaming via Tauri v2 (`assetProtocol: scope: ["**"]`) with zero background HTTP server overhead.
2. **Integrated Media Retrieval**: Embedded `yt-dlp` wrapper supporting video format queries, real-time download streaming metrics, and direct output folder routing.
3. **Alignment Engine**: Speech segmentation and millisecond-accurate timestamp extraction using local Whisper models and Python alignment scripts against ground-truth text.
4. **Timeline Serializer**: Standard-compliant Final Cut Pro 7 XML (`<xmeml version="4">`) export with frame-accurate In/Out/Start/End points and absolute media path resolution.

## Technology Stack

- **Runtime**: Tauri v2 (Rust)
- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS (strict monochrome neutral design system)
- **Media Dependencies**: FFmpeg, FFprobe, yt-dlp

## Prerequisites

- Node.js >= 18.x
- Rust toolchain (Cargo stable >= 1.80)
- `ffmpeg` and `yt-dlp` available in PATH or project `bin/` directory
- Windows 10/11 (x64)

## Installation & Development

```bash
# Install frontend dependencies
npm install

# Launch development build with hot reload
npm run tauri dev
```

## Production Build

```bash
# Compile optimized native binary and installer bundles
npm run tauri build
```

Compiled artifacts will be located under `src-tauri/target/release/bundle/`:
- Standalone Binary: `src-tauri/target/release/tauri-app.exe`
- NSIS Installer: `src-tauri/target/release/bundle/nsis/SyncCut_0.1.0_x64-setup.exe`
- MSI Package: `src-tauri/target/release/bundle/msi/SyncCut_0.1.0_x64_en-US.msi`

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE) (GPL-3.0).
