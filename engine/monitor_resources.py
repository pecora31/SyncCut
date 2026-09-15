"""Customer-only system sampler. Run while editing/processing; Ctrl+C writes report.

GPU statistics are whole-device (WDDM process accounting is not reliably available).
Process RSS sums can double-count shared pages; system available RAM is authoritative.
"""
import argparse
import csv
import json
import shutil
import subprocess
import time
from pathlib import Path

import psutil

parser = argparse.ArgumentParser()
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--seconds", type=int, default=600)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
samples = []
nvidia = shutil.which("nvidia-smi")
psutil.cpu_percent()
try:
    with (args.output / "resources.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = None
        for _ in range(args.seconds):
            time.sleep(1)
            memory = psutil.virtual_memory()
            row = {"unixTime": time.time(), "systemRamAvailableGiB": memory.available/1024**3,
                   "systemRamUsedGiB": (memory.total-memory.available)/1024**3,
                   "systemCpuPercent": psutil.cpu_percent(), "swapUsedGiB": psutil.swap_memory().used/1024**3,
                   "gpuMemoryUsedMiB": None, "gpuMemoryTotalMiB": None, "gpuUtilPercent": None,
                   "synccutProcessRssGiB": 0.0}
            for process in psutil.process_iter(["name", "cmdline", "memory_info"]):
                try:
                    name = (process.info["name"] or "").lower()
                    command = " ".join(process.info["cmdline"] or [])
                    if process.info["memory_info"] is not None and (name in ("synccut.exe", "tauri-app.exe") or "launch_worker.py" in command):
                        row["synccutProcessRssGiB"] += process.info["memory_info"].rss/1024**3
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
            if nvidia:
                try:
                    result = subprocess.run([nvidia, "--id=0", "--query-gpu=memory.used,memory.total,utilization.gpu", "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=5, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
                    if result.returncode == 0:
                        used, total, utilization = map(float, result.stdout.strip().split(","))
                        row.update(gpuMemoryUsedMiB=used, gpuMemoryTotalMiB=total, gpuUtilPercent=utilization)
                except (ValueError, subprocess.TimeoutExpired):
                    pass
            if writer is None:
                writer = csv.DictWriter(stream, fieldnames=row.keys())
                writer.writeheader()
            writer.writerow(row)
            stream.flush()
            samples.append(row)
except KeyboardInterrupt:
    pass
if samples:
    summary = {"samples": len(samples), "durationSeconds": samples[-1]["unixTime"]-samples[0]["unixTime"],
               "minSystemRamAvailableGiB": min(r["systemRamAvailableGiB"] for r in samples),
               "maxSystemRamUsedGiB": max(r["systemRamUsedGiB"] for r in samples),
               "maxGpuMemoryUsedMiB": max((r["gpuMemoryUsedMiB"] for r in samples if r["gpuMemoryUsedMiB"] is not None), default=None),
               "note": "System/device totals include Premiere, Chrome, games and Windows. RSS is not unique RAM."}
    (args.output / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
