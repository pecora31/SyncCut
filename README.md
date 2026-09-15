# SyncCut Studio 0.2

Local voiceover-to-footage rough-cut editor for Windows. React 19 / TypeScript, Tauri 2 / Rust, Python inference, SQLite project storage and FFmpeg media processing.

## Workflow

1. **Sources** — import and assign a recording, an English script and multiple footage/image sources.
2. **Recording** — transcribe the actual audio, acoustically align observed words, and review differences against the script.
3. **Scenes** — interpret script context, retrieve source windows with SigLIP 2 and inspect Qwen visual judgments with cited sampled frames.
4. **Timeline** — refine suggestions, resolve explicit gaps, lock choices, split slots, adjust source start and export editing media plus Premiere XML.

The planner never fills an unmatched slot with arbitrary media. Model judgments remain suggestions for editorial review. Preview uses Tauri's native asset protocol; voiceover audio is the program clock. Unsupported source codecs may require external transcoding before preview.

## Processing and persistence

- Fast: distil-large-v3.5 CT2, English wav2vec2 CTC alignment, SigLIP 2 SO400M, Qwen3-VL 4B NF4.
- Quality: faster-whisper large-v3, the same alignment/retrieval stages, Qwen3-VL 8B NF4.
- Optional BGE-base-en-v1.5 searches captions already cached by earlier visual verification.
- One heavy GPU stage at a time. Shared uses Fast with smaller CPU workloads. Pause stops the owned worker tree and retains completed checkpoints; it is not an OS-level GPU resource quota.
- Projects are stored in `<project>/.synccut/project.sqlite`; revision checks prevent silent overwrites. Cache keys include media content hashes, model revisions and processing inputs.
- Source changes are checked before matching/export. Export renders selected source ranges to a consistent frame clock, checks output frame counts and writes a source manifest. Original files are unchanged. Export clips have no extra handles.

This replaces the previous demo/fallback matching path. Old project data is not automatically migrated; import original sources into a new project folder. No automatic audio take deletion or claim of millisecond alignment accuracy is made.

## Customer runtime and acceptance

See [customer setup and validation](docs/customer-validation.md). Intended target: 32 GB RAM, RTX 3060 12 GB, primarily English media. AI model weights and Python packages are installed separately on that computer using `engine/setup-runtime.ps1`. The runtime venv depends on its original Python installation and is not portable between machines.

The implementation has been checked statically on the development machine. Inference, resource benchmarks, UI interaction tests and Premiere round-trip acceptance are reserved for the customer computer. A successful build is not an end-to-end accuracy or performance result.

## Development and packaging

Requires Node 22+, Rust stable, and a Windows x64 build environment. Place `yt-dlp.exe` in `bin/` for installer bundling. Python/model setup is unnecessary for compiling the editor.

```powershell
npm ci
npm run tauri dev
```

Compile without running models or tests:

```powershell
npx tsc --noEmit
cargo check --tests --manifest-path src-tauri/Cargo.toml
npm run build
npm run tauri build -- --bundles nsis
```

`cargo check --tests` compiles the test contracts; it does not execute them. Customer-only execution instructions are in the runbook. CI creates draft prereleases pending target-machine acceptance.

## Code map

| Area | Location |
|---|---|
| Workflow UI, review, native preview | `src/studio/` |
| Job supervision, SQLite revisions, model pack status | `src-tauri/src/studio/mod.rs` |
| Timeline constraints and planning | `src-tauri/src/studio/domain.rs` |
| FCP7 XML serialization | `src-tauri/src/studio/xml.rs` |
| Offline speech, visual retrieval, media export | `engine/synccut_engine/` |
| Exact model repositories / revisions | `engine/models.json` |
| Customer setup, integrity check, resource sampler | `engine/*.ps1`, `engine/manage_models.py`, `engine/monitor_resources.py` |
| Prepared contracts | `engine/tests/`, `src-tauri/src/studio/tests.rs` |
| Earlier findings / proposed architecture | `audit/` |

## License

[GNU GPL v3](LICENSE). Review and retain the licenses of distributed runtime binaries and model repositories separately.
