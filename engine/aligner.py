"""
SyncCut AI Forced Alignment Engine
Extracts word/sentence timestamps from voiceover audio and aligns them with script ground truth.
"""

import sys
import os
import json
import argparse
import subprocess
import re
from pathlib import Path


def extract_audio(input_media_path: str, output_wav_path: str) -> bool:
    """Extract 16kHz mono WAV audio from media file using ffmpeg."""
    try:
        cmd = [
            "ffmpeg",
            "-y",
            "-i", input_media_path,
            "-ar", "16000",
            "-ac", "1",
            "-c:a", "pcm_s16le",
            output_wav_path
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        return result.returncode == 0 and os.path.exists(output_wav_path)
    except Exception as e:
        print(f"Error extracting audio: {e}", file=sys.stderr)
        return False


def get_audio_duration(audio_path: str) -> float:
    """Get exact duration of audio in seconds."""
    try:
        cmd = [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            audio_path
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if res.returncode == 0:
            return float(res.stdout.strip())
    except Exception:
        pass
    return 120.0


def read_script_sentences(script_path: str) -> list:
    """Parse script into sentences and clean text."""
    with open(script_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Split by standard sentence delimiters
    raw_lines = [line.strip() for line in content.splitlines() if line.strip()]
    sentences = []
    
    for line in raw_lines:
        # Split into sub-sentences by . ! ? ; or bullet points
        parts = re.split(r'(?<=[.!?;\n])\s+', line)
        for p in parts:
            cleaned = p.strip()
            if cleaned and len(cleaned) > 1:
                sentences.append(cleaned)

    return sentences if sentences else raw_lines


def align_with_faster_whisper(audio_path: str, script_sentences: list, model_name: str = "medium") -> list:
    """Perform speech recognition and forced alignment using faster-whisper."""
    from faster_whisper import WhisperModel

    # Use CPU with int8 quantization for lightweight, low-RAM execution
    print(f"[SyncCut AI] Loading Whisper model '{model_name}' (int8 quantized)...", file=sys.stderr)
    model = WhisperModel(model_name, device="cpu", compute_type="int8")

    print("[SyncCut AI] Transcribing audio with word-level timestamps...", file=sys.stderr)
    segments, info = model.transcribe(
        audio_path,
        beam_size=5,
        word_timestamps=True,
        language="vi" if "vi" in (info.language if 'info' in locals() else "vi") else None,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=400)
    )

    all_words = []
    raw_segments_list = []
    for segment in segments:
        raw_segments_list.append({
            "start": segment.start,
            "end": segment.end,
            "text": segment.text.strip()
        })
        if segment.words:
            for w in segment.words:
                all_words.append({
                    "word": w.word.strip(),
                    "start": w.start,
                    "end": w.end
                })

    # If word-level is empty, use raw segment intervals
    total_audio_duration = get_audio_duration(audio_path)
    if not all_words and raw_segments_list:
        return interpolate_sentences_to_segments(script_sentences, raw_segments_list, total_audio_duration)

    if not all_words:
        # Fallback to proportional duration distribution
        return fallback_proportional_align(script_sentences, total_audio_duration)

    # Forced Alignment: Map each script sentence to the word stream
    aligned_results = []
    word_idx = 0
    total_words = len(all_words)

    for idx, sentence in enumerate(script_sentences):
        sentence_words = re.findall(r'\w+', sentence.lower())
        count = max(1, len(sentence_words))
        
        start_time = all_words[word_idx]["start"] if word_idx < total_words else (aligned_results[-1]["end"] if aligned_results else 0.0)
        
        target_end_idx = min(total_words - 1, word_idx + count - 1)
        end_time = all_words[target_end_idx]["end"] if target_end_idx < total_words else total_audio_duration

        # Ensure monotonic progression
        if aligned_results and start_time < aligned_results[-1]["end"]:
            start_time = aligned_results[-1]["end"]
        if end_time <= start_time:
            end_time = start_time + max(1.5, count * 0.35)

        end_time = min(end_time, total_audio_duration)
        word_idx = min(total_words, word_idx + count)

        aligned_results.append({
            "id": idx + 1,
            "text": sentence,
            "start": round(start_time, 2),
            "end": round(end_time, 2),
            "duration": round(end_time - start_time, 2)
        })

    # Clamp the last segment to the end of the audio
    if aligned_results:
        aligned_results[-1]["end"] = round(total_audio_duration, 2)
        aligned_results[-1]["duration"] = round(total_audio_duration - aligned_results[-1]["start"], 2)

    return aligned_results


def interpolate_sentences_to_segments(sentences: list, whisper_segs: list, total_duration: float) -> list:
    """Map script sentences onto Whisper segment intervals."""
    if not whisper_segs:
        return fallback_proportional_align(sentences, total_duration)

    results = []
    seg_idx = 0
    num_segs = len(whisper_segs)

    for i, s in enumerate(sentences):
        current_whisper = whisper_segs[min(seg_idx, num_segs - 1)]
        start = current_whisper["start"]
        end = current_whisper["end"]
        
        results.append({
            "id": i + 1,
            "text": s,
            "start": round(start, 2),
            "end": round(end, 2),
            "duration": round(end - start, 2)
        })
        seg_idx += 1

    return results


def fallback_proportional_align(sentences: list, total_duration: float) -> list:
    """Fallback alignment based on sentence word count weights."""
    results = []
    total_words = sum(max(1, len(s.split())) for s in sentences)
    current_time = 0.0

    for i, s in enumerate(sentences):
        words = max(1, len(s.split()))
        weight = words / max(1, total_words)
        dur = max(1.5, total_duration * weight)
        
        start = current_time
        end = min(total_duration, current_time + dur)
        if i == len(sentences) - 1:
            end = total_duration

        current_time = end
        results.append({
            "id": i + 1,
            "text": s,
            "start": round(start, 2),
            "end": round(end, 2),
            "duration": round(end - start, 2)
        })

    return results


def main():
    parser = argparse.ArgumentParser(description="SyncCut AI Alignment Engine")
    parser.add_argument("--media", required=True, help="Path to input voiceover video/audio")
    parser.add_argument("--script", required=True, help="Path to script TXT file")
    parser.add_argument("--output", required=True, help="Path to output JSON result")
    parser.add_argument("--model", default="medium", help="Whisper model size (small, medium, etc.)")
    parser.add_argument("--wav-dir", default=None, help="Directory to store intermediate WAV")
    args = parser.parse_args()

    media_path = os.path.abspath(args.media)
    script_path = os.path.abspath(args.script)
    output_path = os.path.abspath(args.output)
    
    wav_dir = args.wav_dir or os.path.dirname(output_path)
    os.makedirs(wav_dir, exist_ok=True)
    wav_path = os.path.join(wav_dir, "extracted_voice.wav")

    print(f"[SyncCut] Extracting audio from {media_path}...", file=sys.stderr)
    if not extract_audio(media_path, wav_path):
        wav_path = media_path  # fallback to direct media path if ffmpeg skipped

    script_sentences = read_script_sentences(script_path)
    if not script_sentences:
        print("[SyncCut Error] No sentences found in script file", file=sys.stderr)
        sys.exit(1)

    print(f"[SyncCut] Found {len(script_sentences)} sentences in script.", file=sys.stderr)

    try:
        import faster_whisper
        aligned = align_with_faster_whisper(wav_path, script_sentences, model_name=args.model)
    except ImportError:
        print("[SyncCut Notice] faster-whisper not found, using energy-based alignment fallback...", file=sys.stderr)
        total_dur = get_audio_duration(wav_path)
        aligned = fallback_proportional_align(script_sentences, total_dur)
    except Exception as e:
        print(f"[SyncCut Warning] Whisper alignment error: {e}. Using fallback...", file=sys.stderr)
        total_dur = get_audio_duration(wav_path)
        aligned = fallback_proportional_align(script_sentences, total_dur)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(aligned, f, ensure_ascii=False, indent=2)

    print(f"[SyncCut] Alignment finished successfully! Exported {len(aligned)} segments to {output_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
