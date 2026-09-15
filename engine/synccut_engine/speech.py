"""English ASR, acoustic CTC alignment and explicit script reconciliation."""
from __future__ import annotations

import difflib
import gc
import re
import wave

from .core import Context, EngineError, asset_by_id, atomic_json, extract_wave, probe, read_json, stable_id, fingerprint


def tokens(text):
    # Retain words as observed. Do not silently replace names or invent spoken numbers.
    return re.findall(r"[a-z0-9]+(?:'[a-z]+)?", text.lower().replace("’", "'"))


def read_script(path):
    from pathlib import Path
    text = Path(path).read_text(encoding="utf-8-sig")
    if Path(path).suffix.lower() in (".srt", ".vtt"):
        text = re.sub(r"(?m)^\s*(?:WEBVTT|\d+|.*-->.*)\s*$", "", text)
    lines = [p.strip() for p in re.split(r"\n+|(?<=[.!?])\s+(?=[A-Z\"'])", text) if tokens(p)]
    if not lines:
        raise EngineError("The script has no spoken text.")
    return lines


def reconcile(lines, words):
    """Monotonic content alignment, with explicit missing/extra/changed passages."""
    flat, spans = [], []
    for line in lines:
        start = len(flat)
        flat.extend(tokens(line))
        spans.append((start, len(flat)))
    observed = []
    observed_to_word = []
    for i, word in enumerate(words):
        for token in tokens(word["text"]):
            observed.append(token)
            observed_to_word.append(i)
    matcher = difflib.SequenceMatcher(None, flat, observed, autojunk=False)
    mapping, changed, extras = {}, set(), []
    for tag, a, b, c, d in matcher.get_opcodes():
        if tag == "equal":
            mapping.update({a + k: [c + k] for k in range(b-a)})
        elif tag == "replace":
            # Associate the replacement range with all affected sentences; mark for review.
            for k in range(a, b):
                mapping[k] = list(range(c, d))
                changed.add(k)
        elif tag == "delete":
            changed.update(range(a, b))
        elif tag == "insert":
            extras.append((c, d))
    beats = []
    for n, (text, (a, b)) in enumerate(zip(lines, spans)):
        indices = sorted({observed_to_word[i] for k in range(a, b) for i in mapping.get(k, [])})
        selected = [words[i] for i in indices]
        exact = all(k in mapping and k not in changed for k in range(a, b))
        continuous = not indices or indices == list(range(indices[0], indices[-1]+1))
        reliable = all(w.get("aligned", False) for w in selected)
        issue = "" if exact and continuous and reliable and selected else (
            "Not found in the recording" if not selected else
            "Recording differs, repeats a passage, or has uncertain word boundaries")
        # Include the entire observed span so repeated words are visible to the reviewer.
        spoken = " ".join(w["text"] for w in words[indices[0]:indices[-1]+1]) if indices else ""
        beats.append({"id": stable_id("beat", n, text), "script": text, "spoken": spoken, "text": text,
                      "start": selected[0]["start"] if selected else None,
                      "end": selected[-1]["end"] if selected else None,
                      "status": "verified" if not issue else "review", "issue": issue})
    for n, (a, b) in enumerate(extras):
        indices = sorted(set(observed_to_word[a:b]))
        if not indices:
            continue
        selected = [words[i] for i in indices]
        text = " ".join(w["text"] for w in selected)
        beats.append({"id": stable_id("extra", n, a, text), "script": "", "spoken": text, "text": text,
                      "start": selected[0]["start"], "end": selected[-1]["end"], "status": "review",
                      "issue": "Additional speech or another take; not present in the script"})
    # Replacements can span sentence boundaries. Never auto-accept overlapping intervals.
    chronological = sorted([b for b in beats if b["start"] is not None], key=lambda x: x["start"])
    for left, right in zip(chronological, chronological[1:]):
        if left["end"] > right["start"]:
            for item in (left, right):
                item["status"] = "review"
                item["issue"] = "Overlapping speech mapping; adjust boundaries or exclude a duplicate take"
    return beats


def ctc_word_times(emissions, token_ids, word_indices, blank, start, duration):
    """CTC Viterbi with blank states and repeated-label constraint.

    Returns word boundaries only where a complete path exists. Emissions are log probabilities.
    Acoustic window is fixed; leading/trailing blank frames remain blank.
    """
    import numpy as np
    length, count = emissions.shape[0], len(token_ids)
    if not count or length < count:
        return {}
    labels = np.full(2*count+1, blank, dtype=np.int64)
    labels[1::2] = token_ids
    states = len(labels)
    previous = np.full(states, -np.inf, dtype=np.float32)
    previous[0] = 0
    back = np.zeros((length, states), dtype=np.uint8)
    for t in range(length):
        stay = previous
        step = np.r_[-np.inf, previous[:-1]]
        skip = np.r_[[-np.inf, -np.inf], previous[:-2]]
        allowed = np.arange(states) >= 2
        allowed &= labels != blank
        allowed[2:] &= labels[2:] != labels[:-2]
        skip[~allowed] = -np.inf
        choices = np.stack((stay, step, skip))
        back[t] = choices.argmax(axis=0)
        previous = choices.max(axis=0) + emissions[t, labels]
    state = states-1 if previous[-1] >= previous[-2] else states-2
    if not np.isfinite(previous[state]):
        return {}
    frames = {}
    for t in range(length-1, -1, -1):
        if state % 2:
            token = (state-1)//2
            wi = word_indices[token]
            if wi >= 0:
                frames.setdefault(wi, []).append((t, float(emissions[t, labels[state]])))
        state -= int(back[t, state])
    result = {}
    for wi, aligned in frames.items():
        ts = [f[0] for f in aligned]
        result[wi] = {"start": start + min(ts)*duration/length,
                      "end": start + (max(ts)+1)*duration/length,
                      "alignmentScore": float(np.exp(np.mean([f[1] for f in aligned])))}
    return result


def run(ctx: Context):
    voice = probe(ctx, asset_by_id(ctx.project, ctx.project["voiceId"]))
    if not voice["hasAudio"]:
        raise EngineError("The selected voiceover has no audio track.")
    script = asset_by_id(ctx.project, ctx.project["scriptId"])
    script = {**script, "fingerprint": fingerprint(script["path"])}
    lines = read_script(script["path"])
    asr_key = "asr_fast" if ctx.settings["profile"] == "fast" else "asr_quality"
    checkpoint = ctx.cache / "speech" / (ctx.cache_key(voice["fingerprint"], asr_key) + ".json")
    wav_path = extract_wave(ctx, voice)
    if checkpoint.exists():
        ctx.emit("speech", "Using verified speech checkpoint")
        words = read_json(checkpoint)
    else:
        import numpy as np
        torch = ctx.gpu(3 if asr_key == "asr_fast" else 5)
        from faster_whisper import WhisperModel
        ctx.emit("transcribe", f"Loading {ctx.manifest['models'][asr_key]['repo']}")
        model = WhisperModel(ctx.model(asr_key), device="cuda", compute_type="int8_float16",
                             cpu_threads=4 if ctx.shared else 8, local_files_only=True)
        segments, _ = model.transcribe(str(wav_path), language="en", beam_size=5, word_timestamps=True,
                                       vad_filter=True, condition_on_previous_text=False)
        raw = []
        for segment in segments:
            if segment.words:
                raw.append({"start": segment.start, "end": segment.end, "text": segment.text,
                            "words": [{"text": w.word.strip(), "start": w.start, "end": w.end,
                                       "asrScore": w.probability, "aligned": False} for w in segment.words if w.word.strip()]})
            ctx.emit("transcribe", segment.text.strip(), min(segment.end, voice["duration"]), voice["duration"])
            ctx.throttle()
        del model
        gc.collect()
        torch.cuda.empty_cache()
        if not raw:
            raise EngineError("No speech detected. Check the voiceover; no proportional alignment was generated.")
        # CTranslate2 allocations are released with the model; admission is checked again.
        torch = ctx.gpu(1)
        from transformers import AutoModelForCTC, AutoProcessor
        ctx.emit("align", "Aligning English word boundaries with acoustic evidence")
        processor = AutoProcessor.from_pretrained(ctx.model("align_en"), local_files_only=True)
        acoustic = AutoModelForCTC.from_pretrained(ctx.model("align_en"), local_files_only=True).to("cuda").eval()
        vocabulary = processor.tokenizer.get_vocab()
        blank = processor.tokenizer.pad_token_id
        with wave.open(str(wav_path), "rb") as wave_file:
            samples = np.frombuffer(wave_file.readframes(wave_file.getnframes()), dtype=np.int16).astype(np.float32)/32768
        words = []
        for number, segment in enumerate(raw):
            start = max(0.0, segment["start"]-0.15)
            end = min(len(samples)/16000, segment["end"]+0.15)
            # Whisper segments normally fit 30s; bounded input avoids pathological allocations.
            if end-start > 45:
                words.extend(segment["words"])
                continue
            ids, owners = [], []
            unknown = set()
            for wi, word in enumerate(segment["words"]):
                clean = re.sub(r"[^A-Z'0-9]", "", word["text"].upper())
                if not clean or any(c not in vocabulary for c in clean):
                    unknown.add(wi)
                for char in clean:
                    if char in vocabulary:
                        ids.append(vocabulary[char]); owners.append(wi)
                if wi < len(segment["words"])-1:
                    ids.append(vocabulary["|"]); owners.append(-1)
            audio = samples[int(start*16000):int(end*16000)]
            if len(audio) < 400:
                words.extend(segment["words"])
                continue
            inputs = processor(audio, sampling_rate=16000, return_tensors="pt", padding=True)
            with torch.inference_mode():
                emissions = acoustic(**{k: v.to("cuda") for k, v in inputs.items()}).logits[0].log_softmax(-1).cpu().numpy()
            aligned = ctc_word_times(emissions, ids, owners, blank, start, len(audio)/16000)
            for wi, word in enumerate(segment["words"]):
                timing = aligned.get(wi)
                if timing and wi not in unknown and timing["alignmentScore"] >= 0.2:
                    words.append({**word, **timing, "aligned": True})
                else:
                    # Preserve observed ASR times and mark unresolved; never invent replacements.
                    words.append(word)
            ctx.emit("align", f"Aligned passage {number+1} of {len(raw)}", number+1, len(raw))
            ctx.throttle()
        del acoustic
        gc.collect()
        torch.cuda.empty_cache()
        atomic_json(checkpoint, words)
    beats = reconcile(lines, words)
    return {"assets": [voice if a["id"] == voice["id"] else script if a["id"] == script["id"] else a for a in ctx.project["assets"]],
            "duration": voice["duration"], "words": words, "beats": beats,
            "shots": [], "matches": [], "clips": [], "speechModel": ctx.manifest["models"][asr_key]}
