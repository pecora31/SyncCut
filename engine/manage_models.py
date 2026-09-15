"""Explicit model installation / full integrity verification, never called by jobs."""
import argparse
import hashlib
import json
import os
from pathlib import Path


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(4*1024*1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("install", "verify"))
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--profile", choices=("fast", "quality", "both"), default="fast")
    parser.add_argument("--with-text", action="store_true")
    args = parser.parse_args()
    manifest = json.loads((Path(__file__).parent / "models.json").read_text(encoding="utf-8-sig"))
    keys = ["align_en", "visual"]
    for profile in ("fast", "quality") if args.profile == "both" else (args.profile,):
        keys += ["asr_" + profile, "vlm_" + profile]
    if args.with_text:
        keys.append("text")
    for key in keys:
        entry = manifest["models"][key]
        destination = args.root.resolve() / "models" / key
        marker = destination / "synccut-model.json"
        if args.command == "install":
            # Downloads require this explicit command and exact repository revision.
            from huggingface_hub import HfApi, snapshot_download
            info = HfApi().model_info(entry["repo"], revision=entry["revision"])
            names = [f.rfilename for f in info.siblings]
            safetensors = any(n.endswith(".safetensors") and "/" not in n for n in names)
            patterns = ["*.json", "*.txt", "*.model", "*.jinja", "README.md", "LICENSE*", "*.safetensors"]
            if key.startswith("asr_") or not safetensors:
                patterns.append("*.bin")
            print(f"Installing {entry['repo']} @ {entry['revision']}", flush=True)
            snapshot_download(entry["repo"], revision=entry["revision"], local_dir=destination,
                              allow_patterns=patterns, ignore_patterns=["onnx/*", "openvino/*", "coreml/*", "*.h5", "*.msgpack"], max_workers=2)
            files, hashes = {}, {}
            for file in sorted(destination.rglob("*")):
                relative = file.relative_to(destination).as_posix()
                if not file.is_file() or relative.startswith(".cache/") or relative.startswith("synccut-model.json"):
                    continue
                files[relative] = file.stat().st_size
                hashes[relative] = digest(file)
            if not files or not any(n.endswith((".safetensors", ".bin")) for n in files):
                raise RuntimeError(f"No model weights were installed for {key}")
            result = {"repo": entry["repo"], "revision": entry["revision"], "files": files, "sha256": hashes}
            temporary = marker.with_suffix(".json.partial")
            temporary.write_text(json.dumps(result, indent=2), encoding="utf-8")
            os.replace(temporary, marker)
        else:
            installed = json.loads(marker.read_text(encoding="utf-8"))
            if any(installed.get(field) != entry[field] for field in ("repo", "revision")):
                raise RuntimeError(f"Wrong model revision for {key}")
            if not installed.get("files"):
                raise RuntimeError(f"Empty model manifest for {key}")
            for name, size in installed["files"].items():
                file = (destination / name).resolve()
                if not file.is_relative_to(destination.resolve()) or not file.is_file() or file.stat().st_size != size or digest(file) != installed.get("sha256", {}).get(name):
                    raise RuntimeError(f"Integrity check failed: {key}/{name}")
        print(f"{key}: {args.command} complete", flush=True)


if __name__ == "__main__":
    main()
