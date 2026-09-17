import sys
import unittest
from pathlib import Path
from xml.etree.ElementTree import parse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from synccut_engine.exporter import export_fcp7_xml
from synccut_engine.media import MediaInfo
from synccut_engine.planner import fallback_plan


def media(identifier, kind, duration, path):
    return MediaInfo(identifier, path, kind, duration, 1920, 1080, 30.0, kind == "video", kind == "audio")


class ExporterTests(unittest.TestCase):
    def test_export_has_picture_and_voiceover_tracks(self):
        voice = media("voice", "audio", 5, "C:/demo/voice.mp3")
        visual = media("visual", "video", 2, "C:/demo/footage.mp4")
        plan = fallback_plan(voice, [visual])
        output = Path(self.temp_dir.name) / "assembly.xml"
        export_fcp7_xml(plan, [voice, visual], str(output))
        root = parse(output).getroot()
        self.assertEqual(root.tag, "xmeml")
        self.assertIsNotNone(root.find("./sequence/media/video/track/clipitem"))
        self.assertEqual(root.find("./sequence/media/audio/track/clipitem/name").text, "voice.mp3")
        self.assertGreaterEqual(len(root.findall(".//pathurl")), 2)

    def setUp(self):
        import tempfile
        self.temp_dir = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.temp_dir.cleanup()
