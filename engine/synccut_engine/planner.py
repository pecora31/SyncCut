from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Iterable

from .errors import SyncCutError
from .media import MediaInfo


@dataclass(frozen=True)
class VisualSegment:
    source_id: str
    source_path: str
    source_kind: str
    source_in: int
    source_out: int
    timeline_in: int
    timeline_out: int
    confidence: str
    fallback: str | None = None

    def to_dict(self):
        return asdict(self)


@dataclass(frozen=True)
class TimelinePlan:
    schema_version: int
    fps: int
    duration_frames: int
    voiceover: dict
    visuals: list[VisualSegment]
    warnings: list[str]

    def to_dict(self):
        data = asdict(self)
        data["visuals"] = [segment.to_dict() for segment in self.visuals]
        return data


def seconds_to_frames(seconds: float, fps: int) -> int:
    return max(0, round(seconds * fps))


def validate_plan(plan: TimelinePlan, sources: Iterable[MediaInfo]) -> None:
    by_id = {source.id: source for source in sources}
    if plan.duration_frames <= 0 or not plan.visuals:
        raise SyncCutError("Timeline không có đoạn hình hợp lệ.")
    cursor = 0
    for segment in plan.visuals:
        if segment.timeline_in != cursor or segment.timeline_out <= segment.timeline_in:
            raise SyncCutError("Timeline có khoảng hở hoặc đoạn hình không hợp lệ.")
        source = by_id.get(segment.source_id)
        if not source:
            raise SyncCutError(f"Timeline tham chiếu source không tồn tại: {segment.source_id}")
        source_limit = seconds_to_frames(source.duration, plan.fps)
        if source.kind == "image":
            if segment.source_in != 0 or segment.source_out <= 0:
                raise SyncCutError("Khoảng ảnh tĩnh không hợp lệ.")
        elif segment.source_in < 0 or segment.source_out <= segment.source_in or segment.source_out > source_limit:
            raise SyncCutError(f"Đoạn cảnh vượt thời lượng nguồn: {source.path}")
        cursor = segment.timeline_out
    if cursor != plan.duration_frames:
        raise SyncCutError("Timeline không phủ kín toàn bộ voiceover.")


def fallback_plan(voiceover: MediaInfo, visuals: list[MediaInfo], fps: int = 30, target_seconds: float = 3.0) -> TimelinePlan:
    if voiceover.kind != "audio" and not voiceover.has_audio:
        raise SyncCutError("Voiceover phải có stream âm thanh.")
    if voiceover.duration <= 0:
        raise SyncCutError("Voiceover không có thời lượng hợp lệ.")
    usable = [item for item in visuals if item.kind in {"video", "image"} and (item.kind == "image" or item.duration > 0)]
    if not usable:
        raise SyncCutError("Cần ít nhất một video hoặc ảnh đọc được để tạo bản dựng.")
    total = seconds_to_frames(voiceover.duration, fps)
    max_chunk = max(1, seconds_to_frames(target_seconds, fps))
    remaining, timeline_at, index = total, 0, 0
    source_cursors = {item.id: 0 for item in usable}
    segments: list[VisualSegment] = []
    warnings = ["Bản dựng dự phòng: AI chọn cảnh chưa được chạy; các đoạn hình được xếp an toàn để phủ toàn bộ voiceover."]
    while remaining > 0:
        item = usable[index % len(usable)]
        length = min(max_chunk, remaining)
        if item.kind == "image":
            source_in, source_out, fallback = 0, length, "still-image"
        else:
            source_limit = seconds_to_frames(item.duration, fps)
            source_in = source_cursors[item.id]
            if source_in >= source_limit:
                source_in = 0
            available = source_limit - source_in
            if available <= 0:
                index += 1
                continue
            length = min(length, available, remaining)
            source_out = source_in + length
            source_cursors[item.id] = source_out
            fallback = "reused-footage" if index >= len(usable) else "ordered-footage"
        segments.append(VisualSegment(item.id, item.path, item.kind, source_in, source_out, timeline_at, timeline_at + length, "fallback", fallback))
        timeline_at += length
        remaining -= length
        index += 1
    plan = TimelinePlan(1, fps, total, voiceover.to_dict(), segments, warnings)
    validate_plan(plan, [voiceover, *usable])
    return plan
