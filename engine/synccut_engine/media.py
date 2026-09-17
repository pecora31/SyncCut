from __future__ import annotations

import hashlib
import json
import os
import subprocess
from dataclasses import dataclass, asdict
from pathlib import Path
from urllib.parse import quote

from .errors import SyncCutError


VIDEO_EXTENSIONS = {".mp4", ".mov", ".mxf", ".mkv", ".m4v", ".avi", ".webm"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".bmp"}
AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".aif", ".aiff"}


@dataclass(frozen=True)
class MediaInfo:
    id: str
    path: str
    kind: str
    duration: float
    width: int | None
    height: int | None
    fps: float | None
    has_video: bool
    has_audio: bool

    def to_dict(self):
        return asdict(self)


def file_uri(path: str) -> str:
    return "file://localhost/" + quote(str(Path(path).resolve()).replace("\\", "/"), safe="/:@")


def _id(path: Path) -> str:
    stat = path.stat()
    fingerprint = f"{path.resolve()}:{stat.st_size}:{stat.st_mtime_ns}".encode()
    return hashlib.sha256(fingerprint).hexdigest()[:16]


def _fraction(value: str | None) -> float | None:
    if not value or value == "0/0":
        return None
    try:
        a, b = value.split("/", 1)
        return float(a) / float(b) if float(b) else None
    except (ValueError, ZeroDivisionError):
        return None


def probe(path: str) -> MediaInfo:
    source = Path(path).expanduser().resolve()
    if not source.is_file():
        raise SyncCutError(f"Không tìm thấy file nguồn: {source}")
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(source)],
            capture_output=True, text=True, check=False, timeout=60,
        )
    except FileNotFoundError as exc:
        raise SyncCutError("Không tìm thấy FFprobe. Hãy cài FFmpeg hoặc chọn đường dẫn FFmpeg trong thiết lập.") from exc
    except subprocess.TimeoutExpired as exc:
        raise SyncCutError(f"FFprobe quá thời gian khi đọc: {source.name}") from exc
    if result.returncode != 0:
        detail = result.stderr.strip().splitlines()[-1] if result.stderr.strip() else "không đọc được metadata"
        raise SyncCutError(f"Không thể đọc {source.name}: {detail}")
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise SyncCutError(f"FFprobe trả về dữ liệu không hợp lệ cho {source.name}") from exc
    streams = payload.get("streams") or []
    video = next((stream for stream in streams if stream.get("codec_type") == "video"), None)
    audio = next((stream for stream in streams if stream.get("codec_type") == "audio"), None)
    extension = source.suffix.lower()
    if extension in IMAGE_EXTENSIONS:
        kind = "image"
    elif video:
        kind = "video"
    elif audio:
        kind = "audio"
    else:
        raise SyncCutError(f"{source.name} không có stream hình hoặc âm thanh có thể dùng.")
    raw_duration = (payload.get("format") or {}).get("duration") or (video or audio or {}).get("duration")
    try:
        duration = max(0.0, float(raw_duration))
    except (TypeError, ValueError):
        duration = 0.0
    if kind != "image" and duration <= 0:
        raise SyncCutError(f"Không xác định được thời lượng hợp lệ của {source.name}.")
    return MediaInfo(
        id=_id(source), path=str(source), kind=kind, duration=duration,
        width=int(video["width"]) if video and video.get("width") else None,
        height=int(video["height"]) if video and video.get("height") else None,
        fps=_fraction(video.get("avg_frame_rate")) if video else None,
        has_video=bool(video), has_audio=bool(audio),
    )
