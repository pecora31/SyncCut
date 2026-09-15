"""Protocol, immutable artifacts, cancellation boundaries and media utilities."""
from __future__ import annotations

import hashlib
import json
import math
import os
import subprocess
import time
from fractions import Fraction
from pathlib import Path

from . import ENGINE_VERSION


class EngineError(RuntimeError):
    pass


def stable_id(*values) -> str:
    return hashlib.sha256(json.dumps(values, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:24]


def atomic_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".partial")
    with tmp.open("w", encoding="utf-8") as stream:
        json.dump(data, stream, ensure_ascii=False, allow_nan=False)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(tmp, path)


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def fingerprint(path: str) -> str:
    """Full content hash, streamed; no filename-only or sampled cache collisions."""
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class Context:
    def __init__(self, request):
        self.request = request
        self.project = request["project"]
        self.root = Path(request["projectRoot"])
        self.cache = self.root / ".synccut" / "cache"
        self.cache.mkdir(parents=True, exist_ok=True)
        self.models = Path(request["modelDir"])
        self.manifest = read_json(Path(__file__).parent.parent / "models.json")
        self.settings = self.project["settings"]
        self.shared = self.settings["resource"] == "shared"
        self.started = time.monotonic()
        self.metrics = []
        self.bin_dir = Path(request["binDir"])
        self.process_env = os.environ.copy()
        self.process_env["PATH"] = str(self.bin_dir) + os.pathsep + self.process_env.get("PATH", "")

    def emit(self, stage, message, done=0, total=0):
        event = {"type": "progress", "jobId": self.request["jobId"], "stage": stage,
                 "message": message, "done": done, "total": total,
                 "elapsedSeconds": round(time.monotonic()-self.started, 2)}
        print(json.dumps(event, ensure_ascii=False), flush=True)

    def model(self, key):
        entry = self.manifest["models"][key]
        path = self.models / key
        marker = path / "synccut-model.json"
        if not marker.exists():
            raise EngineError(f"Model '{key}' is not installed. Open Runtime and install the model pack.")
        installed = read_json(marker)
        if installed.get("revision") != entry["revision"] or installed.get("repo") != entry["repo"]:
            raise EngineError(f"Model '{key}' does not match this engine's manifest. Install the matching model pack.")
        for filename, size in installed.get("files", {}).items():
            source = (path / filename).resolve()
            if not source.is_relative_to(path.resolve()) or not source.is_file() or source.stat().st_size != size:
                raise EngineError(f"Model '{key}' is incomplete: {filename}. Reinstall or verify the pack.")
        if not installed.get("files"):
            raise EngineError(f"Model '{key}' has no verified files.")
        return str(path)

    def gpu(self, minimum_gib):
        import torch
        if not torch.cuda.is_available():
            raise EngineError("CUDA is unavailable. This profile requires the customer's NVIDIA GPU and packaged CUDA runtime.")
        free, total = torch.cuda.mem_get_info()
        reserve = 2 * 1024**3
        if free < minimum_gib * 1024**3 + reserve:
            raise EngineError(f"Not enough free VRAM: {free/1024**3:.1f} GiB free. Pause other GPU work or use Fast.")
        torch.set_num_threads(max(1, min(4 if self.shared else 8, os.cpu_count() or 4)))
        self.metrics.append({"event": "gpu_admission", "freeBytes": free, "totalBytes": total})
        return torch

    def command(self, name, args, timeout=3600):
        binary = self.bin_dir / (name + (".exe" if os.name == "nt" else ""))
        if not binary.is_file():
            raise EngineError(f"Bundled {name} is missing: {binary}")
        if name == "ffmpeg":
            threads = "2" if self.shared else "4"
            args = ["-threads", threads, "-filter_threads", threads, "-filter_complex_threads", threads, *args]
        flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        result = subprocess.run([str(binary), *map(str, args)], capture_output=True, encoding="utf-8",
                                errors="replace", env=self.process_env, timeout=timeout, creationflags=flags)
        if result.returncode:
            raise EngineError(f"{name} failed ({result.returncode}): {result.stderr[-6000:]}")
        return result.stdout

    def throttle(self):
        if self.shared:
            time.sleep(0.15)

    def cache_key(self, *parts):
        return stable_id(ENGINE_VERSION, self.manifest, *parts)


def probe(ctx: Context, asset):
    path = Path(asset["path"])
    if not path.is_file():
        raise EngineError(f"Source is missing: {path}")
    ctx.emit("inspect", f"Inspecting {path.name}")
    signature = fingerprint(str(path))
    cache_file = ctx.cache / "probe" / (signature + ".json")
    if cache_file.exists():
        meta = read_json(cache_file)
    else:
        data = json.loads(ctx.command("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", path]))
        video = next((s for s in data["streams"] if s["codec_type"] == "video" and not s.get("disposition", {}).get("attached_pic")), None)
        audio = next((s for s in data["streams"] if s["codec_type"] == "audio"), None)
        is_image = asset["kind"] == "image"
        raw_duration = data.get("format", {}).get("duration") or (video or audio or {}).get("duration")
        duration = float(raw_duration) if raw_duration is not None else None
        if not is_image and (duration is None or not math.isfinite(duration) or duration <= 0):
            raise EngineError(f"Cannot determine duration of {path.name}; no estimated duration will be used.")
        if asset["kind"] == "video" and video is None:
            raise EngineError(f"No video stream in {path.name}")
        if asset["kind"] == "voice" and audio is None:
            raise EngineError(f"No audio stream in {path.name}")
        try:
            rate = Fraction((video or {}).get("avg_frame_rate", "0/1"))
        except (ValueError, ZeroDivisionError):
            rate = Fraction(0)
        meta = {"fingerprint": signature, "duration": duration, "width": (video or {}).get("width", 0),
                "height": (video or {}).get("height", 0), "fpsNum": rate.numerator, "fpsDen": rate.denominator,
                "hasAudio": audio is not None, "hasVideo": video is not None,
                "channels": (audio or {}).get("channels", 0), "sampleRate": int((audio or {}).get("sample_rate", 0)),
                "codec": (video or {}).get("codec_name", ""), "sizeBytes": path.stat().st_size}
        atomic_json(cache_file, meta)
    return {**asset, **meta}


def extract_wave(ctx, asset):
    output = ctx.cache / "audio" / (asset["fingerprint"] + ".wav")
    if not output.exists():
        output.parent.mkdir(parents=True, exist_ok=True)
        tmp = output.with_suffix(".partial.wav")
        ctx.command("ffmpeg", ["-v", "error", "-y", "-i", asset["path"], "-map", "0:a:0", "-vn",
                               "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", tmp])
        os.replace(tmp, output)
    return output


def asset_by_id(project, asset_id):
    return next(a for a in project["assets"] if a["id"] == asset_id)
