"""Single task per worker process, bounded GPU residency, JSONL progress."""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import traceback
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    # Model downloads are a separate, explicit setup operation.
    os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1",
                      TOKENIZERS_PARALLELISM="false", PYTHONUTF8="1")
    from .core import Context, EngineError, atomic_json, read_json
    request = read_json(Path(args.request))
    ctx = Context(request)
    try:
        if request.get("schemaVersion") != 2:
            raise EngineError("Unsupported job schema; update the app and runtime together.")
        stage = request["stage"]
        if stage == "speech":
            from .speech import run
        elif stage == "match":
            from .vision import run
        elif stage == "export":
            from .export import run
        else:
            raise EngineError(f"Unknown processing stage: {stage}")
        result = run(ctx)
        result["provenance"] = {"engineVersion": "0.2.0", "settings": ctx.settings, "modelManifest": ctx.manifest,
                                "elapsedSeconds": time.monotonic()-ctx.started, "metrics": ctx.metrics}
        atomic_json(Path(args.output), {"schemaVersion": 2, "jobId": request["jobId"],
                                      "projectRevision": ctx.project["revision"], "result": result})
        ctx.emit("complete", "Stage complete; model memory released when this worker exits")
    except Exception as exc:
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({"type": "error", "jobId": request.get("jobId"), "message": str(exc)}), flush=True)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
