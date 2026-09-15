Open SyncCut > Set up AI to install the selected local model pack automatically.

The assistant detects CPython 3.11/3.12 x64, uses bundled FFmpeg/FFprobe, installs packages and models, then checks CUDA/media compatibility.
Models and Python packages are downloaded only after the user presses Install in the setup assistant; processing jobs never download them.
Advanced users can still select a separately prepared runtime folder.
The setup creates a Windows venv tied to the customer's installed CPython. It is not a portable Python distribution.
