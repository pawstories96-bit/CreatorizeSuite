# Framecraft Studio

One local desktop application. No sample projects or seeded content.

Last updated: 2026-10-14. SPEC.md is the supplied product brief; its embedded build workflow does not override the user's request. The full brief is **not yet complete**. The application below is implemented; unfinished requirements are listed explicitly.

## Implemented and exercised

- Fixed the reported Connections error: structured provider failures now take precedence over stderr warnings. The screenshot's saved October 13 failure was a usage-limit error. Historical jobs show their actual cause and date, with expandable diagnostics. Test/calibration quota failures no longer silently retry. A new live Codex Tier A calibration passed on October 14, including tool use, scene generation and image understanding. The optional local model picker no longer runs when Codex is selected.
- Editable timeline cues, text cards and imported ambience/music/SFX clips, including trim, placement, volume, looping and fades. FFmpeg mixes and ducks actual audio and measures final loudness. Browser and audio integration tests passed. 3D scenes now composite below 2D labels and cards.
- Workspace Usage dashboard, project filtering, failed-attempt usage, cache-aware per-model estimates and preserved price snapshots. Explicitly enabled per-role fallback chains retain usage from failed attempts. Independent QA routing overrides the project's builder choice.
- Expanded MCP tools for public source discovery/retrieval, licensed image/footage search/download, loudness measurement, staged sound tracks and storyboard titles, and memory proposals requiring approval. Tests verified scope restrictions, staging and approval. A configured SearXNG endpoint enables general search; the default search tool uses Wikipedia source discovery, with direct retrieval for public primary sources.
- Thumbnail reference analysis, saved channel style keys, multiple candidates per prompt, and parent-linked regeneration history. These inference flows require a working configured provider; the local canvas persistence and protocol tests passed.
- Routine upload nodes after approval, checkpointed multi-topic branches, daily run limits and budget checks between steps. Restart/approval/budget tests passed. A single provider call may exceed a cost threshold; unknown-priced attempts pause budget-limited runs. JSON import/export preserves batch and limit settings.

- One Electron application with original branding and an empty first launch. No example projects, seeded channels or simulated jobs.
- Local project folders, SQLite index, real per-project Git commits, duplicate, recoverable deletion and ZIP import/export.
- Official Codex CLI integration using its existing sign-in; configurable models and effort, normalized job events, token capture, role routing, encrypted API credentials. Live Codex tests passed.
- Model pickers fetch actual catalogs through Codex app-server `model/list`, Claude's initialization protocol and configured compatible `/models` endpoints. Live local Codex and Claude discovery passed without starting inference. Friendly names, descriptions, supported efforts, refresh, search for large catalogs and optional custom IDs replace manual-only model fields in Connections, role routing and routines.
- The editor has a project model selector in the agent status area above the composer. It saves a project-specific override without changing workspace defaults. Running and queued jobs snapshot their routing; changes apply to newly queued jobs. Browser and provider-protocol tests verified isolation, persistence and exact selected model IDs. Duplicate and ZIP round trips preserve the project choice.
- The editor shows run duration, input/output tokens and project token totals. Optional user-entered API prices produce labeled estimates; subscription usage is not presented as an additional API charge.
- Four-stage research, drafting, fact-checking and humanization. Research uses the official CLI's web tools and saves source URLs. Live seed-germination research test passed.
- Windows speech synthesis, real SAPI word events, FFmpeg cleaning and imported audio transcription using faster-whisper. Real transcription test passed after bypassing an incompatible PyAV decoder API with FFmpeg.
- Word-timed storyboard, per-shot declarative source, deterministic Canvas2D / Three.js rendering, live preview, waveform, playback, seeking, speed, loop, timeline zoom and object selection.
- Local images, MP4 video and embedded GLB models with deterministic animation. Forward/backward frame hash test passed. Imported assets have attribution records.
- Real AI shot generation, scoped edits, Git history and reversible changes. Live Codex scene, edit and MP4 export test passed.
- Job-scoped MCP bridge for official CLIs: project/storyboard/word/asset reads, candidate frame images, programmatic preview checks and layout measurement. Live Codex invoked the bridge, understood the returned PNG and completed a real scene build/edit/export. Compatible API/local models have a bounded function-calling loop over the same tools; protocol tests passed with actual rendered PNGs and cumulative token accounting. Live external API/local models remain unverified.
- Shift-drag time-range selection applies edits to the whole shots overlapping that range. Object selection edits enforce preservation of other elements and scene settings. Actual before/after PNGs appear in the result and Git History. Browser tests exercised the complete edit flow.
- External edits to canonical scene JSON are validated, checked in the renderer, hot-reloaded into the live player and committed. Invalid edits preserve the last valid preview. Actual file-edit/reload tests passed.
- Layout measurements report rotated 2D/text bounds, off-screen objects and candidate text overlaps. Long unbroken labels are measured against available width. Path bounds and 3D occlusion remain outside these checks.
- Programmatic blank-frame and text-fit checks. Codex visual review of rendered start/middle/end images, with repair loops. Live scene generation and image-understanding calibration passed. Compatible vision APIs can receive image inputs, but have not been live-tested.
- Real MP4 rendering with Chromium frame stepping and FFmpeg, captions in SRT, 720p/1080p/4K and vertical export options. Automated export tests currently exercise small/720p outputs, not long 4K renders.
- Procedural ambience or imported music/ambience, looping, automatic narration ducking, loudness normalization. Actual imported audio mix test passed.
- Thumbnail capture/import/library/assignment and a saved infinite canvas with image, prompt and text nodes. Connected image references are passed to an explicitly configured image-edit endpoint. Canvas reload test passed.
- Style presets and user-authored style instructions, memory rules, channels and workflow organization.
- Editable routine graphs, cycle validation, daily schedules while app is running, real pipeline steps, approval, stop/retry, child job checkpoints and restart recovery. Automated durability tests passed.
- Routine step options cover style, format, duration, language, quality, voice, frame rate, resolution, ambience level and reference channels. Per-routine provider/model/effort overrides, web-assisted topic discovery, notifications and vertical center-cropped trailers are implemented.
- **Full live workflow passed:** topic discovery → four-stage research/script → Windows narration → two AI-generated shots → independent rendered-image review → mix → 720p MP4 → thumbnail → metadata → 1080×1920 trailer → approval → completion. This was an isolated internal test, not a project seeded into the app.
- Desktop isolation, loopback origin checks, hardware detection, optional tray mode, optional start with Windows and completion notifications. Native Electron launch and provider detection passed.

## Implemented but external validation remains

- Claude's official CLI is detected as signed in. Live model discovery passed again on October 14 (four models), after an earlier transient timeout. Inference previously returned API errors; the new streaming image-input path has not passed a live Claude vision test. The app reports failures; global Claude configuration was not changed.
- ElevenLabs needs a user's provider key and voice selection.
- API/local model adapters need a reachable configured model. No local inference server has been provisioned.
- Image generation/edit endpoints need a configured model and key. No paid image generation was performed.
- Fish Audio, Piper and Kokoro speech adapters are implemented. Piper needs an executable and ONNX voice/config; Kokoro needs a running compatible server; Fish needs a key and voice ID. All require real Whisper alignment. Kokoro HTTP protocol and actual WAV decoding passed against a test server; live services/voices remain unverified.
- ComfyUI checkpoint discovery, queued generation, reference-image upload, custom API workflows and output retrieval are implemented. Queue/history/image-output protocol tests passed; live generation needs the user's running ComfyUI server and installed checkpoint.
- YouTube OAuth, analytics, crash-resumable uploads, scheduled publishing, thumbnail setting, retention/comments and audience learning need the user's Google desktop OAuth client and channel authorization. No real uploads were made. Protocol tests verified resuming from the server-acknowledged offset after an interrupted upload. Learning tests verified evidence IDs, approval before Memory changes, and idempotent approval.
- Wikimedia search and an actual image download passed, including saved attribution. Search now handles tracking query strings on returned image URLs. Public domain and CC0 provenance remain distinct.

## Packaging verification

- October 14 feature build: 19 core tests and browser/media/timeline/adapter/model/MCP regressions passed. The new unpacked executable passed empty startup, native isolation, live model selection, MP4 export, Windows TTS and audio processing. A live Codex MCP edit first hit HTTP 503, then passed on retry with real candidate frames, preview checks and before/after captures. External provider availability remains outside the application.

- Windows portable build produced an executable, but the first packaged export test failed because electron-builder excluded Three.js modules under its dependency's `examples` directory.
- The build explicitly copies the required GLTF/Skeleton/geometry modules and their license into public runtime files. The latest unpacked Windows executable passed actual MP4 rendering through bundled Chromium/FFmpeg and real Windows TTS/audio processing, as well as empty startup and provider detection.
- The packaged executable also passed a live signed-in Codex edit through the bundled MCP subprocess: candidate PNG rendering, preview checks and saved before/after captures. This verifies the actual Electron-as-Node bridge and packaged paths, not just the development server.
- The packaged editor fetched the live catalog, saved a model selected through the project picker, and used that exact model ID for a real Codex edit. Provider switching drives visual-review routing; independent QA providers can be configured explicitly.
- Repeated Git revert/undo and a real ZIP export/import round trip now pass. A timestamp rewrite after reverting had dirtied project.json; the index now loads the committed snapshot without rewriting it.

## Remaining brief requirements

- Reliable Tier C adaptation and wider live provider calibration. Claude image input is implemented but not live-validated. The expanded MCP catalog still lacks model/map retrieval and storyboard timing mutation.
- Rich style-specific character/rig kits, advanced 3D camera/lighting/collision/occlusion checks, real maps, automatic real-footage sourcing and style training from reference videos. The current renderer uses validated declarative scenes, not unrestricted arbitrary scene code.
- Range editing currently changes whole intersecting shots, and before/after comparisons use still frames rather than clips.
- Additional validated speech languages and live validation of the newly added speech/image adapters. Windows voice coverage depends on installed OS voices.
- Per-prompt thumbnail aspect ratio/resolution and image generation cost accounting.
- Channel catalog scraping and concurrent routine branches. Multi-topic routines currently run independent branches sequentially, with durable checkpoints and separate approvals.
- Long-video/4K/hardware performance validation, signed distribution, auto-update and macOS packaging. Personal Brand is a later phase of the brief and is not implemented.

## Verification commands

`npm test` — 19 core, durability, error-reporting, usage/fallback, routine, upload-protocol and audience-approval tests.

`node tests/connection-ui.mjs` — reported screenshot regression: dated quota failure, collapsed diagnostics, no unsolicited local-model fetch and Usage navigation.

`node tests/timeline.mjs` — browser timeline persistence, cue/card rendering and real audio trim/fade/duck/loudness checks.

`node tests/adapters.mjs` — ComfyUI/Kokoro HTTP protocol, real WAV decoding and private-network research protection. This is protocol validation, not live model inference.

`npm run test:e2e` — real browser interaction, voice generation, audio playback, export, persistence, every screen and origin protection.

`npm run test:media` — actual video/GLB frame rendering, deterministic seeking and canvas persistence.

`npm run test:desktop` — native Electron window and security settings.

`node tests/calibration.mjs` — live provider calibration plus real audio mixing.

`node tests/integrations.mjs` — real CLI connection, local Whisper and research pipeline. `SKIP_CLAUDE=1` skips the externally failing Claude check.

`npm run test:provider` — live AI build/edit/render (uses the configured signed-in provider).

`node tests/full-workflow.mjs` — live topic-to-video routine through independent visual review, metadata, trailer and approval.

`node tests/project-history.mjs` — repeated undo, ZIP round trip and real Commons download.

`node tests/agent-tools.mjs` — actual stdio MCP, candidate images, layout, session isolation and compatible API tool-loop protocol. Set `LIVE_MCP=1` to also exercise signed-in Codex.

`node tests/editing.mjs` — enforced object boundaries, browser range selection, actual before/after captures and source-file hot reload.

`node tests/models.mjs` — live CLI model discovery, editor/Connections pickers, project isolation, ZIP persistence, and in-flight/queued job routing snapshots.

`LIVE_PACKAGED_MCP=1` with `PACKAGED_EXE` set extends the desktop test with a live Codex MCP edit in the packaged application.

Tests create isolated `.test-*` workspaces. They never populate the user's Documents workspace. Machine-specific evidence is in `test-results/` and is excluded from Git.
