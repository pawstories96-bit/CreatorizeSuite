# Local studio setup

Installed on 28 October 2026 in this folder. The plugin's bundled kit passed its 36-file verification.

## Runtime

Use the studio's Python environment for its tools:

```powershell
& '.\.venv\Scripts\python.exe' tools/doctor.py
```

Node.js and FFmpeg use the existing system installations. Python packages are isolated in `.venv`.

## Rendering on this computer

Automatic Chromium mode selected SwiftShader software rendering during setup. Explicit GPU mode successfully selected AMD Radeon graphics through Direct3D11. The machine also has an NVIDIA GTX 1650, but the tested Chromium GPU context used AMD.

The included `render-local.ps1` launcher selects the verified GPU mode and defaults to two workers:

```powershell
.\render-local.ps1 --project projects/my-video
```

Or call the renderer directly:

```powershell
node render.mjs --project projects/my-video --gl gpu --workers 2
```

Override the worker count if needed. This computer has 16 GB of RAM; avoid running several full-resolution workers alongside memory-heavy applications.

## Setup validation

- All sixteen demo scenes rendered with no missing-shot or renderer errors and were visually inspected.
- GPU contact-sheet rendering took about fifteen seconds at thirty percent scale.
- A two-second, 1920 by 1080, thirty-fps H.264 motion test passed. Frame rendering averaged 5.39 fps with one worker on the demo coaster scene. Actual film speed varies by scene, resolution, worker count and system load.
- Setup logs are retained in `setup-install.log`, `setup-render.log`, `setup-render-gpu.log` and `setup-motion.log`.
- The eight-second music self-test passed using FluidSynth. The final environment check passed, including optional PyMuPDF support.
- Generated files in `examples/demo/build/` remain because automatic approval review blocked the cleanup command by policy.

Film-score tools and instrument samples are installed locally under the studio environment, `soundfonts/`, and `bin/fluidsynth/`. VoiceStudio and ElevenLabs account configuration are optional and have not been configured by this setup.
