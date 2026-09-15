"""Entrypoint also works when Python ignores PYTHONPATH (isolated runtimes)."""
import os
import runpy
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
# CTranslate2 needs cuBLAS/cuDNN shipped by the pinned PyTorch Windows wheel.
# Retain handles: closing add_dll_directory removes the directory from loader search.
_dll_handles = []
if os.name == "nt":
    import site
    for folder in site.getsitepackages():
        library = Path(folder) / "torch" / "lib"
        if library.is_dir():
            os.environ["PATH"] = str(library) + os.pathsep + os.environ.get("PATH", "")
            _dll_handles.append(os.add_dll_directory(str(library)))

runpy.run_module("synccut_engine.worker", run_name="__main__")
