# SyncCut 0.2 — customer setup and acceptance

Target: Windows x64, NVIDIA RTX 3060 12 GB, 32 GB RAM, English recordings. These are **implementation instructions and acceptance checks**, not a claim that this machine/model combination has already passed.

## Install on the customer computer

1. Install the editor, a supported NVIDIA driver, and **CPython 3.11 or 3.12 x64**. Keep that Python installation; the runtime is a local venv that depends on it.
2. Obtain a Windows FFmpeg build containing `ffmpeg.exe` and `ffprobe.exe`. Prefer a static build; keep companion DLLs if using a shared build. The installer does not download FFmpeg or AI models automatically.
3. Open PowerShell in the editor's installed `engine` directory, or this repository's `engine` directory. Run with your actual paths:

```powershell
.\setup-runtime.ps1 -RuntimeRoot 'D:\SyncCutRuntime' -PythonExe 'C:\Python312\python.exe' -MediaBin 'D:\Tools\ffmpeg\bin' -Profile fast
```

This command explicitly downloads Python packages and the Fast models. It does not run inference. Use `-Profile both` to also install Quality; add `-WithTextIndex` for the optional BGE caption index. Downloads resume when setup is rerun. Allow substantial disk space for full precision source weights even though Qwen is loaded in 4-bit. Plan approximately 30–40 GB for Fast and 50–65 GB for both profiles, plus projects and exports; verify actual usage after installation. Do not copy the venv to a different machine or move its folder.

4. Run the prepared checks **on the customer computer**:

```powershell
.\customer-check.ps1 -RuntimeRoot 'D:\SyncCutRuntime' -Profile fast
```

Use the same profile and optional text flag as setup. This checks imports, CUDA visibility, media tools, model SHA-256 integrity and Python logic contracts. It does **not** prove Qwen quantization, ASR accuracy or Premiere compatibility; the following end-to-end checks are required. If building from source on that machine, also run `cargo test --manifest-path ..\src-tauri\Cargo.toml studio::tests`.

5. In SyncCut, open **Runtime → Choose runtime folder**, select `D:\SyncCutRuntime`, then create a project folder. Select **Processing → Fast → Shared** for the initial Fast installation. Only needed model stages are loaded; worker inference is offline. The dependency pins are a candidate combination until this validation is complete. Keep `installed-requirements.txt` and `preflight.json` with results.

## Workflow

- **Sources:** import audio, script, videos and images. Assign voiceover/script, tick footage. Single-click selects; double-click previews. Dragging from the pool to the monitor also requests preview. Downloads remain a separate, explicitly initiated action.
- **Recording:** run Check recording. Review missing/extra speech, replacements, repeated takes and uncertain acoustic boundaries. Correct passage text/timing or exclude the mapping. Excluding a passage leaves the original voiceover intact; it does not delete audio. Only accepted passages proceed to matching.
- **Scenes:** inspect the interpreted visual brief, observed frames, caption and explanation. `match` is a model judgment supported by cited sampled frames, **not a guarantee of factual correctness**. No percentage confidence is presented. A partial/unreviewed candidate requires editor choice.
- **Timeline:** select a slot; double-click to seek. Inspect alternatives, keep/lock a clip, split at the playhead, adjust source start within the verified scene, or clear a slot. Rebuild preserves locked slots. Unmatched material and recording pauses are explicit gaps. The planner is currently greedy with duration/repetition constraints, not a global beam-search optimizer.
- **Export:** creates same-FPS H.264 editing clips, stereo 48 kHz/24-bit voiceover, source manifest and FCP7 XML for Premiere. The source recordings/footage remain unchanged. Exported clips have **no extra handles**, so extending a cut requires the original source or a revised export. Fractional final audio-frame padding is silence, never stretched voice. Gaps require an explicit checkbox.

Profiles and sequence frame-rate changes invalidate affected results. Fast/Quality changes require speech recheck; changing footage requires scene matching again. Pacing affects new scene indexing and unlocked replanning. **Find scenes creates a fresh index/timeline and replaces existing cuts, including locks**; use Rebuild unlocked to retain locked edits on the current index. There is no automatic cut removal, color grading, transition design, music mix or caption burn-in.

## Required acceptance cases

Use a small representative project first: a 1–3 minute English voiceover, its script, 3–5 varied footage files and two images. Then use a real long project. Record the editor version, model revisions, CPU, SSD, driver, Premiere version, FPS/resolution, input durations, settings and which other applications are active.

| Case | Expected result |
|---|---|
| Exact script/recording | Actual words and plausible acoustic word boundaries; no proportional timing fallback. Manually check at least 20 boundary samples. |
| Missing sentence, extra take, changed name/number | Explicit review; matching blocked until the reviewer resolves it. Numbers/acronyms may need manual review because normalization is conservative. |
| Unrelated footage | Gaps instead of automatic unrelated clips. Track false matches separately from empty slots. |
| Multiple videos, duplicate filenames in different folders | Separate assets, correct source provenance, no filename collision. |
| Quotes, accents, spaces and UNC paths | Import, preview, save/reopen and export resolve the same media. |
| Portrait images, rotated phone footage, 23.976/29.97/VFR sources | Correct orientation, no end-of-file overrun, exported clips have exact requested frame counts. |
| Short source near EOF | Valid shorter cut or gap; never stretch/loop video to pretend coverage. |
| Long script / pronouns / named people / action sequence | Inspect context interpretation and sampled-frame evidence; no invented identity accepted by reviewer. Sparse sampling can miss fast actions. |
| Pause during each stage | Owned worker and descendants stop; GPU usage returns near pre-job baseline. Resume reuses completed checkpoints. In-progress ASR may restart from the start of that ASR stage. |
| Close/reopen during work | Job becomes interrupted; no partial project result applied. Resume safely. Export cache reuse across a full app restart is not yet guaranteed. |
| Modify a file after analysis | Match/export refuses changed analyzed inputs and requests reanalysis. |
| Save/reopen, rapid changes, second window | Persisted revision remains consistent; conflicts show an error and require reload. No silent overwrite. |
| Locked clip, split, source trim, clear, replan | Frame-contiguous timeline, locked source bounds preserved, source duration constraints enforced. |
| Premiere XML import | Every media file online, exact frame-based sequence duration, correct aspect/FPS, stereo channels, gaps and markers. Compare the start, middle and final spoken phrase to within one sequence frame. |
| Disconnect network after setup | Speech/matching/export still work offline; an explicitly requested online media download naturally needs network. |

A suggested acceptance target is at least 90% of a manually labeled relevant-scene benchmark appearing within the top 20 and no knowingly unrelated automatically selected cuts in the review set. Set the final threshold with the customer. Do not treat this target as a measured result. Measure useful accepted cuts per minute of review and cold/warm processing time as well as raw retrieval accuracy.

## Measure resource sharing

In a second PowerShell window, run the sampler, then work normally:

```powershell
& 'D:\SyncCutRuntime\python\Scripts\python.exe' .\monitor_resources.py --output 'D:\SyncCutMeasurements\fast-premiere' --seconds 900
```

This writes `resources.csv` and `summary.json`. GPU usage is for the whole device; process RSS can double-count shared pages. **Available system RAM** and whole-device VRAM are the useful planning figures. The sampler does not measure UI latency or League of Legends frame times; record those separately in the game/monitoring tool.

Run separate sessions: baseline desktop; Fast alone; Quality alone; Fast + Chrome; Fast + Premiere with the customer's timeline; Fast + League of Legends; paused SyncCut + those same apps. Also measure cold model loading and exporting, not just steady inference. Avoid treating minimized games or Premiere as zero GPU use.

Planning envelopes, **not measurements**:

| SyncCut state | App + worker RAM budget | App/worker VRAM budget | Expected sharing |
|---|---:|---:|---|
| Idle / paused | 1–3 GB plus preview buffers | Usually under 1 GB; resolution/decoder dependent | Most resources available to other apps |
| Fast / Shared processing | 6–12 GB, higher during loads | About 4–7 GB | Chrome plausible; Premiere/LoL responsiveness must be measured |
| Quality / Focused processing | 10–18 GB, higher during loads | About 7–10 GB | Prefer a dedicated GPU work session |

The admission guard currently requires minimum free VRAM of 6 GiB for Fast Qwen and 9 GiB for Quality Qwen before model loading, including a 2 GiB safety margin. That margin is **not a hard reservation** and Shared is **not a GPU quota**. Premiere and games can allocate VRAM afterwards. Pause processing before latency-sensitive editing or gaming if necessary. CPU, codec, source resolution and SSD speed are not known, so no reliable FPS or runtime promise is possible yet.

## Artifacts to return

Keep the project `.synccut/project.sqlite`, the relevant `.synccut/jobs/<id>/worker.log`, `preflight.json`, installed package list, resource CSV/summary and a short acceptance sheet. Project/cache files contain source paths and script text; share only what the customer approves. Preserve the complete export folder when opening or transferring its XML. Clear `.synccut/cache` only with the editor closed and a project backup; it will be recomputed.

## Implementation references

The runtime uses the documented [Qwen3-VL Transformers API](https://huggingface.co/docs/transformers/v4.57.1/model_doc/qwen3_vl), [faster-whisper GPU requirements](https://github.com/SYSTRAN/faster-whisper#gpu), and [bitsandbytes installation support](https://huggingface.co/docs/bitsandbytes/v0.48.1/installation). Exact model repository commits are in `engine/models.json`; quantization is applied at load time. BGE is optional and searches **previously cached captions**; cold retrieval uses SigLIP 2.
