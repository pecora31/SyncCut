"""Install and verify pinned local model weights with resumable progress reporting."""
import argparse
import fnmatch
import hashlib
import json
import os
import threading
import time
from pathlib import Path


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def write_progress(root, **values):
    path = root / ".synccut-runtime-progress.json"
    temporary = path.with_suffix(".json.partial")
    temporary.write_text(json.dumps(values), encoding="utf-8")
    os.replace(temporary, path)


def matching_files(info, patterns):
    return [
        sibling
        for sibling in info.siblings
        if any(fnmatch.fnmatch(sibling.rfilename, pattern) for pattern in patterns)
    ]


def sibling_size(sibling):
    lfs = getattr(sibling, "lfs", None)
    if isinstance(lfs, dict):
        return int(lfs.get("size") or 0)
    return int(getattr(sibling, "size", 0) or 0)


def selected_size(info, patterns):
    return sum(sibling_size(item) for item in matching_files(info, patterns))


def folder_size(folder):
    if not folder.exists():
        return 0
    return sum(
        path.stat().st_size
        for path in folder.rglob("*")
        if path.is_file() and ".cache" not in path.parts and path.name != "synccut-model.json"
    )


def model_patterns(key, info):
    names = [file.rfilename for file in info.siblings]
    safetensors = any(name.endswith(".safetensors") and "/" not in name for name in names)
    patterns = ["*.json", "*.txt", "*.model", "*.jinja", "README.md", "LICENSE*", "*.safetensors"]
    if key.startswith("asr_") or not safetensors:
        patterns.append("*.bin")
    return patterns


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("install", "verify"))
    parser.add_argument("--root", type=Path, required=True, help="Runtime folder for progress/log files")
    parser.add_argument("--model-root", type=Path, help="Folder that stores model weights")
    parser.add_argument("--profile", choices=("fast", "quality", "both"), default="fast")
    parser.add_argument("--with-text", action="store_true")
    args = parser.parse_args()
    runtime_root = args.root.resolve()
    model_root = (args.model_root or runtime_root / "models").resolve()
    manifest = json.loads((Path(__file__).parent / "models.json").read_text(encoding="utf-8-sig"))
    keys = ["align_en", "visual"]
    for profile in ("fast", "quality") if args.profile == "both" else (args.profile,):
        keys += ["asr_" + profile, "vlm_" + profile]
    if args.with_text:
        keys.append("text")

    from huggingface_hub import HfApi, snapshot_download

    api = HfApi()
    plans = {}
    for key in keys:
        entry = manifest["models"][key]
        info = api.model_info(entry["repo"], revision=entry["revision"], files_metadata=True)
        patterns = model_patterns(key, info)
        plans[key] = (entry, info, patterns, selected_size(info, patterns))
    total_bytes = sum(plan[3] for plan in plans.values())

    def written_bytes():
        return sum(folder_size(model_root / key) for key in keys)

    for index, key in enumerate(keys, start=1):
        entry, info, patterns, _ = plans[key]
        destination = model_root / key
        marker = destination / "synccut-model.json"
        if args.command == "install":
            stop = threading.Event()

            def report():
                while not stop.wait(0.75):
                    write_progress(
                        runtime_root,
                        stage="models",
                        message=f"Downloading model {index} of {len(keys)}",
                        currentItem=entry["repo"],
                        modelKey=key,
                        downloadedBytes=min(written_bytes(), total_bytes),
                        totalBytes=total_bytes,
                    )

            write_progress(
                runtime_root,
                stage="models",
                message=f"Downloading model {index} of {len(keys)}",
                currentItem=entry["repo"],
                modelKey=key,
                downloadedBytes=min(written_bytes(), total_bytes),
                totalBytes=total_bytes,
            )
            watcher = threading.Thread(target=report, daemon=True)
            watcher.start()
            try:
                print(f"Installing {entry['repo']} @ {entry['revision']}", flush=True)
                snapshot_download(
                    entry["repo"],
                    revision=entry["revision"],
                    local_dir=destination,
                    allow_patterns=patterns,
                    ignore_patterns=["onnx/*", "openvino/*", "coreml/*", "*.h5", "*.msgpack"],
                    max_workers=2,
                )
            finally:
                stop.set()
                watcher.join(timeout=2)
            files, hashes = {}, {}
            for file in sorted(destination.rglob("*")):
                relative = file.relative_to(destination).as_posix()
                if not file.is_file() or relative.startswith(".cache/") or relative == "synccut-model.json":
                    continue
                files[relative] = file.stat().st_size
                hashes[relative] = digest(file)
            if not files or not any(name.endswith((".safetensors", ".bin")) for name in files):
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

    if args.command == "install":
        write_progress(
            runtime_root,
            stage="models",
            message="All selected models are ready. Verifying installation…",
            currentItem="",
            modelKey="",
            downloadedBytes=total_bytes,
            totalBytes=total_bytes,
        )


if __name__ == "__main__":
    main()
