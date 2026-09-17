import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from synccut_engine.media import MediaInfo
from synccut_engine.planner import fallback_plan, validate_plan


def source(identifier, kind, duration, path):
    return MediaInfo(identifier, path, kind, duration, 1920, 1080, 30.0, kind == "video", kind == "audio")


class PlannerTests(unittest.TestCase):
    def test_fallback_plan_covers_a_longer_voiceover_without_source_overrun(self):
        voice = source("voice", "audio", 10.1, "C:/media/voice.wav")
        video = source("clip", "video", 2.0, "C:/media/clip.mp4")
        plan = fallback_plan(voice, [video], fps=30)
        validate_plan(plan, [voice, video])
        self.assertEqual(plan.duration_frames, 303)
        self.assertEqual(plan.visuals[-1].timeline_out, 303)
        self.assertTrue(all(item.source_out <= 60 for item in plan.visuals))

    def test_fallback_plan_can_hold_a_still_for_full_voiceover(self):
        voice = source("voice", "audio", 4.0, "C:/media/voice.wav")
        image = source("still", "image", 0.0, "C:/media/cover.png")
        plan = fallback_plan(voice, [image], fps=30)
        validate_plan(plan, [voice, image])
        self.assertEqual(sum(item.timeline_out - item.timeline_in for item in plan.visuals), 120)
        self.assertTrue(all(item.source_kind == "image" for item in plan.visuals))
