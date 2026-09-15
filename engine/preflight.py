"""Customer-only runtime checks. Does not load model weights."""
import argparse
import importlib
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--root", type=Path, required=True)
args = parser.parse_args()
report = {"modules": {}}
for name in ("torch", "torchvision", "torchaudio", "transformers", "bitsandbytes", "faster_whisper", "ctranslate2", "scenedetect", "cv2", "numpy", "psutil"):
    module = importlib.import_module(name)
    report["modules"][name] = getattr(module, "__version__", "imported")
import torch
from transformers import Qwen3VLForConditionalGeneration, Siglip2Model, AutoModelForCTC
if not torch.cuda.is_available():
    raise RuntimeError("CUDA is unavailable. Check the NVIDIA driver and CUDA-enabled PyTorch wheels.")
report["gpu"] = torch.cuda.get_device_name(0)
report["cuda"] = torch.version.cuda
report["vramFreeBytes"], report["vramTotalBytes"] = torch.cuda.mem_get_info()
for name in ("ffmpeg", "ffprobe"):
    result = subprocess.run([str(args.root / "bin" / f"{name}.exe"), "-version"], check=True, capture_output=True, text=True)
    report[name] = result.stdout.splitlines()[0]
output = args.root / "preflight.json"
output.write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
