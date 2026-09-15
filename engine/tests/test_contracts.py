"""Prepared for the customer machine. No model downloads or real inference."""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from synccut_engine.speech import reconcile, ctc_word_times
from synccut_engine.core import atomic_json, read_json, fingerprint


def observed(text):
    return [{"text": word, "start": i*0.5, "end": (i+1)*0.5, "aligned": True} for i, word in enumerate(text.split())]


class SpeechContracts(unittest.TestCase):
    def test_exact_recording_is_acoustically_verified(self):
        beats = reconcile(["The red car turns."], observed("The red car turns"))
        self.assertEqual(beats[0]["status"], "verified")
        self.assertEqual((beats[0]["start"], beats[0]["end"]), (0, 2))

    def test_script_cannot_replace_spoken_content(self):
        beats = reconcile(["The red car turns."], observed("The blue car stops"))
        self.assertTrue(all(b["status"] == "review" for b in beats))
        self.assertIn("blue", beats[0]["spoken"])
        self.assertNotIn("red", beats[0]["spoken"])

    def test_missing_sentence_has_no_invented_timing(self):
        beats = reconcile(["The car turns.", "Penguins fly."], observed("The car turns"))
        self.assertIsNone(beats[1]["start"])
        self.assertIsNone(beats[1]["end"])
        self.assertEqual(beats[1]["status"], "review")

    def test_extra_take_requires_review(self):
        beats = reconcile(["The car turns."], observed("The car turns The car turns"))
        self.assertTrue(any(b["status"] == "review" and not b["script"] for b in beats))

    def test_uncertain_acoustic_boundaries_are_not_verified(self):
        words = observed("The car turns")
        words[1]["aligned"] = False
        self.assertEqual(reconcile(["The car turns."], words)[0]["status"], "review")

    def test_ctc_repeated_labels_require_separating_blank(self):
        import numpy as np
        logits = np.log(np.array([[.01,.99],[.99,.01],[.01,.99]], dtype=np.float32))
        result = ctc_word_times(logits, [1,1], [0,1], 0, 2, .3)
        self.assertLessEqual(result[0]["end"], result[1]["start"])
        self.assertAlmostEqual(result[1]["end"], 2.3)
        impossible = ctc_word_times(logits[:2], [1,1], [0,1], 0, 0, .2)
        self.assertEqual(impossible, {})

    def test_content_hash_invalidates_same_name_and_length(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "source.txt"
            path.write_text("cat")
            before = fingerprint(str(path))
            path.write_text("dog")
            self.assertNotEqual(before, fingerprint(str(path)))
            checkpoint = Path(folder) / "nested" / "result.json"
            atomic_json(checkpoint, {"result": 2})
            self.assertEqual(read_json(checkpoint), {"result": 2})
            self.assertFalse(checkpoint.with_suffix(".json.partial").exists())


if __name__ == "__main__":
    unittest.main()
