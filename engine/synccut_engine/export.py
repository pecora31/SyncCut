"""Produce verified, frame-conformed editing media; Rust writes the NLE XML.

Only selected ranges are conformed, without extra handles. Original source files are never modified.
This gives a consistent frame clock for mixed FPS/VFR sources and still images.
"""
from __future__ import annotations

import json
import math
import os
from pathlib import Path

from .core import EngineError, asset_by_id, atomic_json, read_json, fingerprint


def run(ctx):
    settings = ctx.settings
    fps = settings["fpsNum"] / settings["fpsDen"]
    rate = f"{settings['fpsNum']}/{settings['fpsDen']}"
    folder = Path(ctx.request["exportDir"])
    folder.mkdir(parents=True, exist_ok=True)
    clips = ctx.project["clips"]
    if not clips:
        raise EngineError("There is no timeline to export.")
    sequence_frames = max(int(c["end"]) for c in clips)
    if any(c["assetId"] is None for c in clips) and not ctx.request.get("allowGaps", False):
        raise EngineError("The timeline has gaps. Fill them or explicitly allow gaps in Export.")
    prepared = []
    for asset_id in {c["assetId"] for c in clips if c["assetId"]} | {ctx.project["voiceId"]}:
        asset = asset_by_id(ctx.project, asset_id)
        ctx.emit("export", f"Verifying source content: {asset['name']}")
        if not asset.get("fingerprint") or fingerprint(asset["path"]) != asset["fingerprint"]:
            raise EngineError(f"Source changed since analysis: {asset['name']}. Recheck recording or rematch footage.")
    for i, clip in enumerate(clips):
        if clip["assetId"] is None:
            continue
        asset = asset_by_id(ctx.project, clip["assetId"])
        frames = int(clip["end"])-int(clip["start"])
        if frames <= 0:
            raise EngineError("Timeline contains a non-positive clip.")
        duration = frames/fps
        if asset["kind"] == "video" and (clip["sourceIn"] < 0 or clip["sourceIn"]+duration > asset["duration"]+1e-6):
            raise EngineError(f"Clip exceeds source duration: {asset['name']}")
        # Exact selected range: retain provenance in manifest. No extrapolation past media EOF.
        cache_key = ctx.cache_key("export", asset.get("fingerprint"), clip["sourceIn"], frames, settings["fpsNum"], settings["fpsDen"], settings["width"], settings["height"])
        output = folder / f"clip_{i+1:04d}_{cache_key[:8]}.mp4"
        verified = output.with_suffix(".verified.json")
        ctx.emit("export", f"Preparing clip {i+1}/{len(clips)}", i, len(clips))
        if output.exists() and verified.exists():
            item = read_json(verified)
            if item["bytes"] != output.stat().st_size:
                raise EngineError(f"Export media changed: {output}")
        else:
            temporary = output.with_suffix(".partial.mp4")
            args = ["-v", "error", "-y"]
            if asset["kind"] == "image":
                args.extend(["-loop", "1", "-framerate", rate])
            else:
                args.extend(["-ss", f"{clip['sourceIn']:.9f}"])
            args.extend(["-i", asset["path"], "-map", "0:v:0", "-an", "-vf",
                         f"fps={rate},scale={settings['width']}:{settings['height']}:force_original_aspect_ratio=decrease,pad={settings['width']}:{settings['height']}:(ow-iw)/2:(oh-ih)/2,setsar=1",
                         "-frames:v", str(frames), "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                         "-threads", "2" if ctx.shared else "4", "-pix_fmt", "yuv420p", "-movflags", "+faststart", temporary])
            ctx.command("ffmpeg", args)
            data = json.loads(ctx.command("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_frames",
                                                        "-show_entries", "stream=nb_read_frames,width,height,r_frame_rate", "-of", "json", temporary]))
            stream = data["streams"][0]
            if int(stream.get("nb_read_frames", 0)) != frames:
                raise EngineError(f"Rendered clip {i+1} has fewer frames than requested. Adjust its source range.")
            os.replace(temporary, output)
            item = {"path": str(output), "bytes": output.stat().st_size, "frames": frames,
                    "width": stream["width"], "height": stream["height"]}
            atomic_json(verified, item)
        prepared.append({**item, "clipId": clip["id"], "start": clip["start"], "end": clip["end"],
                         "name": asset["name"], "originalPath": asset["path"], "originalIn": clip["sourceIn"]})
    voice = asset_by_id(ctx.project, ctx.project["voiceId"])
    voice_output = folder / "voiceover.wav"
    temp_voice = folder / "voiceover.partial.wav"
    ctx.command("ffmpeg", ["-v", "error", "-y", "-i", voice["path"], "-map", "0:a:0", "-vn",
                           "-af", f"aresample=48000,apad,atrim=end_sample={math.ceil(sequence_frames/fps*48000)}",
                           "-ac", "2", "-ar", "48000", "-c:a", "pcm_s24le", temp_voice])
    os.replace(temp_voice, voice_output)
    manifest = {"items": prepared, "voicePath": str(voice_output), "folder": str(folder),
                "sequenceFrames": sequence_frames, "settings": settings,
                "originalVoicePath": voice["path"], "projectRevision": ctx.project["revision"]}
    atomic_json(folder / "source_manifest.json", manifest)
    ctx.emit("export", "Editing media verified; preparing XML", len(clips), len(clips))
    return {"exportMedia": manifest}
