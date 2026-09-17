from __future__ import annotations

from pathlib import Path
from xml.etree.ElementTree import Element, SubElement, ElementTree, indent

from .errors import SyncCutError
from .media import MediaInfo, file_uri
from .planner import TimelinePlan, validate_plan


def _text(parent: Element, name: str, value: str | int) -> Element:
    node = SubElement(parent, name)
    node.text = str(value)
    return node


def _rate(parent: Element, fps: int) -> None:
    rate = SubElement(parent, "rate")
    _text(rate, "timebase", fps)
    _text(rate, "ntsc", "FALSE")


def _file(parent: Element, file_id: str, source: MediaInfo, fps: int) -> Element:
    node = SubElement(parent, "file", {"id": file_id})
    _text(node, "name", Path(source.path).name)
    _text(node, "pathurl", file_uri(source.path))
    _text(node, "duration", max(1, round(source.duration * fps)))
    return node


def export_fcp7_xml(plan: TimelinePlan, sources: list[MediaInfo], destination: str) -> str:
    validate_plan(plan, sources)
    by_id = {source.id: source for source in sources}
    voice = by_id.get(plan.voiceover["id"])
    if not voice:
        raise SyncCutError("Không tìm thấy voiceover trong source manifest.")
    root = Element("xmeml", {"version": "5"})
    sequence = SubElement(root, "sequence", {"id": "sequence-1"})
    _text(sequence, "name", "SyncCut Assembly")
    _text(sequence, "duration", plan.duration_frames)
    _rate(sequence, plan.fps)
    media = SubElement(sequence, "media")
    video = SubElement(media, "video")
    _rate(video, plan.fps)
    video_format = SubElement(video, "format")
    video_sample = SubElement(video_format, "samplecharacteristics")
    _rate(video_sample, plan.fps)
    _text(video_sample, "width", 1920)
    _text(video_sample, "height", 1080)
    _text(video_sample, "pixelaspectratio", "square")
    _text(video_sample, "fielddominance", "none")
    video_track = SubElement(video, "track")
    seen_files: set[str] = set()
    for number, segment in enumerate(plan.visuals, 1):
        source = by_id[segment.source_id]
        clip = SubElement(video_track, "clipitem", {"id": f"visual-{number}"})
        _text(clip, "name", Path(source.path).name)
        _text(clip, "enabled", "TRUE")
        _text(clip, "duration", segment.timeline_out - segment.timeline_in)
        _rate(clip, plan.fps)
        _text(clip, "start", segment.timeline_in)
        _text(clip, "end", segment.timeline_out)
        _text(clip, "in", segment.source_in)
        _text(clip, "out", segment.source_out)
        file_id = f"file-{source.id}"
        if file_id not in seen_files:
            _file(clip, file_id, source, plan.fps)
            seen_files.add(file_id)
        else:
            SubElement(clip, "file", {"id": file_id})
        if segment.fallback:
            marker = SubElement(clip, "marker")
            _text(marker, "name", "SyncCut fallback")
            _text(marker, "comment", segment.fallback)
            _text(marker, "in", segment.timeline_in)
            _text(marker, "out", segment.timeline_out)
    audio = SubElement(media, "audio")
    _rate(audio, plan.fps)
    audio_track = SubElement(audio, "track")
    audio_item = SubElement(audio_track, "clipitem", {"id": "voiceover-1"})
    _text(audio_item, "name", Path(voice.path).name)
    _text(audio_item, "enabled", "TRUE")
    _text(audio_item, "duration", plan.duration_frames)
    _rate(audio_item, plan.fps)
    _text(audio_item, "start", 0)
    _text(audio_item, "end", plan.duration_frames)
    _text(audio_item, "in", 0)
    _text(audio_item, "out", plan.duration_frames)
    _file(audio_item, f"file-{voice.id}", voice, plan.fps)
    destination_path = Path(destination).expanduser().resolve()
    destination_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination_path.with_suffix(destination_path.suffix + ".tmp")
    tree = ElementTree(root)
    indent(tree, space="  ")
    tree.write(temporary, encoding="utf-8", xml_declaration=True)
    temporary.replace(destination_path)
    return str(destination_path)

