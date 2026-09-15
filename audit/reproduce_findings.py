"""Read-only engine probes. No model downloads; mock dependencies are explicit.

Run: python audit/reproduce_findings.py
The checks confirm defects in the audited build, NOT application correctness.
"""
import importlib.util
import json
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace, ModuleType
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("matcher", ROOT / "engine/voice_visual_matcher.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
results = []

def record(name, reproduced, detail):
    results.append(dict(name=name, defect_reproduced=bool(reproduced), detail=detail))

def sentence(start=0, end=12, text="A completely unrelated topic"):
    return dict(id=1, text=text, start=start, end=end, duration=end-start)

def shot(start=0, end=4.5, maximum=5):
    return dict(path="footage.mp4", name="footage.mp4", **{"in": start, "out": end},
                duration=end-start, max_duration=maximum, keyframe=None, has_face=False)

s = m.schedule_dynamic_timeline([sentence()], [shot()], [[0]], "voice.wav", 12)[0]
record("source_out_exceeds_media", s["sourceOut"] > 5, s)
record("zero_score_becomes_75_percent", s["matchConfidence"] == 75, s["matchConfidence"])
s = m.schedule_dynamic_timeline([sentence(0, 8)], [shot(maximum=30)], [[90]], "voice.wav", 8)[0]
record("clip_crosses_indexed_shot_boundary", s["sourceOut"] > 4.5, s)
s = m.schedule_dynamic_timeline([sentence(2, 5), dict(sentence(7, 10), id=2)], [shot(maximum=30)], [[90], [90]], "voice.wav", 10)
record("voice_coverage_has_gaps", s[0]["startTime"] == 2 and s[1]["startTime"] > s[0]["endTime"], s)
s = m.schedule_dynamic_timeline([sentence()], [], [], "voice.wav", 12)[0]
record("missing_footage_becomes_audio_as_video", s["assetType"] == "video" and s["sourceMediaPath"] == "voice.wav", s)

# An empty torch module suffices for Deep: no VLM or image inference is called.
with patch.dict(sys.modules, {"torch": ModuleType("torch")}):
    scores = m.calculate_semantic_scores([sentence(text="red car"), sentence(text="blue ocean")], [shot(), shot()], "deep")
record("deep_constant_scores_without_model", scores == [[75, 75], [75, 75]], scores)

with patch.dict(sys.modules, {"torch": None}):
    aligned = m.align_speech("unused.wav", ["One.", "Two.", "Three.", "Four."], 2)
record("fallback_duration_disagrees_with_endpoints", any(abs(x["duration"]-(x["end"]-x["start"])) > .01 for x in aligned), aligned)

# Mock ASR produces fixed word timestamps; change every script word but preserve count.
words = [SimpleNamespace(word=w, start=i, end=i+0.5) for i, w in enumerate(["red", "car", "blue", "ocean"])]
class FakeWhisper:
    def __init__(self, *args, **kwargs): pass
    def transcribe(self, *args, **kwargs):
        return [SimpleNamespace(words=words)], None
fake_torch = SimpleNamespace(cuda=SimpleNamespace(is_available=lambda: False))
with patch.dict(sys.modules, {"torch": fake_torch, "faster_whisper": SimpleNamespace(WhisperModel=FakeWhisper)}):
    a = m.align_speech("unused.wav", ["red car", "blue ocean"], 4)
    b = m.align_speech("unused.wav", ["wrong words", "unrelated topic"], 4)
record("alignment_ignores_word_identity", [(s["start"],s["end"]) for s in a] == [(s["start"],s["end"]) for s in b], {"matching_script": a, "different_script": b})

with tempfile.TemporaryDirectory(prefix="synccut_audit_") as td:
    video = Path(td) / "dummy.mp4"
    video.touch()
    with patch.object(m, "get_media_duration", return_value=10), patch.object(m.subprocess, "run"):
        shots = m.extract_keyframes_and_shots([str(video)], td)
    record("last_second_of_10s_footage_not_indexed", max(s["out"] for s in shots) == 9, shots)

report = {"checks": len(results), "reproduced": sum(x["defect_reproduced"] for x in results), "results": results}
out = ROOT / "audit/probe_results.json"
out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"checks": report["checks"], "reproduced": report["reproduced"], "output": str(out)}))
sys.exit(0 if report["checks"] == report["reproduced"] else 1)
