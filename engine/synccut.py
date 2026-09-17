#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from synccut_engine.errors import SyncCutError
from synccut_engine.exporter import export_fcp7_xml
from synccut_engine.media import probe
from synccut_engine.planner import TimelinePlan, VisualSegment, fallback_plan


def emit(payload: dict, log_path: str | None = None) -> None:
    # Windows consoles may still expose a legacy code page. JSON escapes keep
    # the worker protocol valid even there; the desktop JSON parser restores
    # Vietnamese text before it reaches the UI.
    print(json.dumps(payload, ensure_ascii=True), flush=True)
    if log_path:
        record = {"timestamp": datetime.now(timezone.utc).isoformat(), **payload}
        path = Path(log_path).expanduser().resolve()
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def save_plan(plan: TimelinePlan, path: str) -> str:
    destination = Path(path).expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(plan.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
    return str(destination)


def load_plan(path: str) -> TimelinePlan:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return TimelinePlan(
        schema_version=data["schema_version"], fps=data["fps"], duration_frames=data["duration_frames"],
        voiceover=data["voiceover"], visuals=[VisualSegment(**item) for item in data["visuals"]], warnings=data.get("warnings", []),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="SyncCut deterministic media core")
    sub = parser.add_subparsers(dest="command", required=True)
    probe_cmd = sub.add_parser("probe")
    probe_cmd.add_argument("paths", nargs="+")
    process_cmd = sub.add_parser("process")
    process_cmd.add_argument("--voiceover", required=True)
    process_cmd.add_argument("--visual", action="append", required=True)
    process_cmd.add_argument("--plan", required=True)
    process_cmd.add_argument("--log")
    process_cmd.add_argument("--fps", type=int, default=30)
    export_cmd = sub.add_parser("export")
    export_cmd.add_argument("--plan", required=True)
    export_cmd.add_argument("--output", required=True)
    export_cmd.add_argument("--source", action="append", required=True)
    export_cmd.add_argument("--log")
    args = parser.parse_args()
    log_path = getattr(args, "log", None)
    try:
        if args.command == "probe":
            emit({"ok": True, "sources": [probe(path).to_dict() for path in args.paths]}, log_path)
        elif args.command == "process":
            emit({"ok": True, "event": "progress", "stage": "media", "message": "Đang kiểm tra voiceover và footage"}, log_path)
            voiceover = probe(args.voiceover)
            visuals = [probe(path) for path in args.visual]
            emit({"ok": True, "event": "progress", "stage": "planner", "message": "Đang tạo timeline an toàn phủ toàn bộ voiceover", "sourceIds": [voiceover.id, *[source.id for source in visuals]]}, log_path)
            plan = fallback_plan(voiceover, visuals, args.fps)
            plan_path = save_plan(plan, args.plan)
            emit({"ok": True, "event": "complete", "stage": "planner", "plan": plan.to_dict(), "planPath": plan_path, "logPath": log_path}, log_path)
        else:
            plan = load_plan(args.plan)
            sources = [probe(path) for path in args.source]
            output = export_fcp7_xml(plan, sources, args.output)
            emit({"ok": True, "event": "complete", "stage": "export", "output": output, "logPath": log_path}, log_path)
    except SyncCutError as exc:
        emit({"ok": False, "event": "error", "error": str(exc)}, log_path)
        return 2
    except Exception as exc:
        emit({"ok": False, "event": "error", "error": "Lỗi nội bộ engine", "detail": repr(exc)}, log_path)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
