# Framecraft Studio

One local Windows desktop application for AI-assisted video production. Projects start empty. The supplied product brief and honest implementation status are in [SPEC.md](SPEC.md) and [PROGRESS.md](PROGRESS.md).

## Run

Double-click `Launch Framecraft.cmd` or `release/win-unpacked/Framecraft Studio.exe`. The portable single-file output is `release/Framecraft Studio 0.1.0.exe`. Check PROGRESS.md for the current packaged-test result before distributing.

For development:

```powershell
npm ci
npm run build
npm start
```

The desktop workspace lives in `Documents/Framecraft Workspace`. `FRAMECRAFT_WORKSPACE` can select another directory. The Node development server uses `.workspace` by default. Never copy test workspaces into the user's workspace.

## First video

1. In Connections, choose Codex and test the connection. The official Codex CLI must already be installed and signed in. Model names default to the CLI's own choice.
   Model dropdowns fetch directly from your connected runtime. In an open project, click the model chip above the chat composer to choose a provider, model and thinking effort for that project. New jobs use your selection; already queued/running jobs keep their captured settings. Choose workspace defaults to return to normal role routing.
2. Create a project with a topic or paste your script. Review research and narration before generating speech.
3. Generate a Windows voiceover or import a recording. Windows speech is free and local. Imported recordings use local Whisper timing.
4. Build the video. Review shots while the build continues; use the chat panel for a shot/object/video edit. Shift-drag the timeline to edit all shots overlapping a range. Completed edits include actual Before / After frames in the result card and History. Higher review tiers run additional checks.
5. Import images, MP4s, GLBs or audio in Assets as needed. Use an audio file as a ducked bed beneath narration.
6. Export the MP4 and SRT. Optional YouTube publishing requires your own Google OAuth setup and explicit upload review.

## Runtime dependencies

- Git is required for project history. It is installed on the build machine but not bundled.
- FFmpeg/FFprobe and Chromium are bundled in the Windows output. The renderer does not depend on an open browser.
- Python 3.13 is used for faster-whisper. On first transcription the app can create a private virtual environment and install faster-whisper; the selected speech model is downloaded once. This needs internet access on first setup.
- Windows TTS uses installed system voices. ElevenLabs, compatible API/image providers and YouTube are optional and require configuration; unavailable providers produce real errors.
- Subscription access uses official CLIs only. The app never extracts subscription tokens. API credentials are encrypted for the current OS user.

## Build and test

```powershell
npm test
npm run test:e2e
npm run test:media
npm run test:desktop
node tests/agent-tools.mjs
node tests/editing.mjs
node tests/models.mjs
npm run package
$env:PACKAGED_EXE='release/win-unpacked/Framecraft Studio.exe'
node tests/desktop.mjs
```

Packaging requires `resources/ffmpeg` and `resources/browser`. They are intentionally excluded from source control. `npm run build` copies the small Three.js runtime loader modules explicitly because the packager otherwise excludes dependency examples.

Live provider tests consume the selected provider's usage allowance. Core tests do not call paid services. Test fixtures are never shown as user projects.

## Architecture

- `src/`: React interface, editor, node canvases and styles.
- `public/player.js`: deterministic scene runtime shared by preview, QA and rendering.
- `server/core.mjs`: schema, persistence, project files and Git.
- `server/agents.mjs`: official CLI / compatible API adapters and credential vault.
- `server/model-catalog.mjs`: live model discovery without an inference turn; `server/agent-routing.mjs`: provider-safe model resolution and per-job routing snapshots.
- `server/agent-tools.mjs` and `server/mcp-bridge.mjs`: job-scoped MCP tools for project/word/storyboard/asset reads, candidate PNG rendering, preview checks and layout measurement. Compatible API/local providers use the same tools through a bounded function-calling loop. CLI configuration is per invocation; global provider settings are not modified.
- `server/scene-watch.mjs`: validates changes to `scenes/<shotId>.json`, reloads the preview and commits accepted changes. Invalid edits keep the last valid preview and show a failed reload job. Generated `.js` mirrors are not the editable source.
- `server/pipeline.mjs`: durable jobs, audio, generation, QA, rendering and routines.
- `server/integrations.mjs`: configured image and Google APIs.
- `server/youtube-upload.mjs`: persisted upload sessions and interrupted-transfer recovery.
- `server/audience.mjs`: video/retention/comment retrieval and explicit approval of learned rules.
- `server/assets.mjs`: Commons search and attribution ledger.
- `electron/main.cjs`: hardened desktop shell, tray and bundled runtime paths.

This is local software with optional external AI services. The full attached brief is not yet complete; PROGRESS.md separates implemented, externally unverified and unfinished work.

API behavior references: [YouTube resumable uploads](https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol), [video publishing fields](https://developers.google.com/youtube/v3/docs/videos), [retention reports](https://developers.google.com/youtube/analytics/channel_reports), and [comment retrieval](https://developers.google.com/youtube/v3/docs/commentThreads/list).
