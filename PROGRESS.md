# Creatorize Suite

Updated 2026-11-02. One application, no seeded projects. The revised brief is still in progress. Current implementation and remaining gaps are tracked in [UPGRADE_PLAN.md](UPGRADE_PLAN.md).

## Version 0.3.3 — supplied reconstruction toolkit

Integrated the user's aiTrends reconstruction toolkit into the existing 3D reconstruction style. The runtime now exposes 27 detailed geometry/map builders, deterministic train/door/route animation, eight additional lighting looks, local geographic data, and sourced quote/article/stat/statement/chart cards with word-timed excerpt highlights. Project **Style → Reconstruction look** changes preview/export lighting; existing scene geometry needs a build/edit to gain new detail. AI build/edit/review guidance includes the supported assemblies and documentary shot grammar. Mixamo casting remains explicit. No standalone toolkit app or demo projects are installed. See [integration details and scope](docs/reconstruction-toolkit.md).

Source validation passed: 43 automated tests, Next production build, TypeScript, all 27 actual rendered builders, eight distinct look frames, pixel-exact backward seeking, landscape/portrait evidence cards and a real four-frame MP4 verified with FFprobe. Existing vessel geometry and cast/motion/hand-prop tests passed. The package integrity check matched 94 source/data/font files, the rounded-geometry addon and legacy FBX converter; original demo projects, Python environments and user FBX files are excluded.

The final unpacked 0.3.3 Windows executable passed empty startup, actual cockpit rendering, in-project look selection and reload persistence, all eight toolkit previews, bundled offline maps and a real MP4 export with the expected four decoded frames. Visual review moved an obstructing foreground tree belt behind the location preview and increased the dark map's land contrast before the final package. Tests use only isolated workspaces and do not rebuild the user's documentary.

The final single-file 0.3.3 executable passed extraction/startup with empty project/channel/routine/thumbnail lists, Usage navigation, actual X/Y Bot FBX import and a ZIP restore, then exported a real two-frame video with the imported character inside the toolkit's cutaway room. Launch `Launch Creatorize.cmd` or `release/v0.3.3/Creatorize Suite 0.3.3.exe`. Portable size: 305,343,372 bytes. SHA-256: `765d064816e51e1a2aba8c06fa8a37aafb58c0fa1328c6d6434e2971b0fc1cb9`.

## Version 0.3.2 — reconstruction and Mixamo update

The reconstruction pipeline now plans shared physical sets, retrieves actual credited CC0 models and independently reviews each Verified shot. The editor supports 1–3 concurrent shot builders, saved recovery, project-wide role casting, fifteen actions, eight hand props, ten camera moves and bounded independently reviewed scene repair during export. See [the reference audit](docs/update-video-audit.md) for the walkthrough review and limits.

Actual Mixamo character skins are retained and driven through humanoid bone directions, including fingers and attached props. Cast & motion imports a whole folder, recognizes X Bot / Y Bot, supports per-role model selection and reuses the two body slots for new 3D projects in the workspace. File imports support self-contained FBX / GLB up to 150 MB. A bundled, checksum-verified FBX2glTF converter handles legacy FBX 6 files; original source files are unchanged. Converted characters are cached locally. Missing body setup fails explicitly without AI repair retries. The user's eight supplied files were imported and rendered in isolated workspaces, including the legacy and large textured characters. No character meshes or test projects are shipped.

Source checks passed: 40 unit tests, Next production build and TypeScript, all eight actual character conversions/renders, X/Y Bot actions/props and exact seeking, reusable body assets, cast and camera controls, export recovery into a real MP4, seven style previews and pixel-identical direct frame capture. The actual folder-picker UI also passed with visible male/female meshes, rapid model changes and automatic setup for new 3D projects. These checks do not certify full documentary visual quality.

The final unpacked 0.3.2 Windows app passed empty startup, sandbox/context isolation, OS-encrypted credentials, live Codex catalog/project model selection, a real MP4, official CC0 model acquisition and textured rendering, Three.js effects, actual Mixamo X/Y Bot skins and actions, legacy FBX 6 conversion and Windows speech/audio processing on October 20. Hash checks matched 58 shipped server/player/interface files to source and verified the bundled converter/license. Native screenshots use a bounded hidden capture with a non-focusing fallback for this test's window only.

The single-file portable 0.3.2 passed extraction, empty project/channel/routine/thumbnail lists and the Usage screen. It imported the user's actual X/Y Bot FBX files, restored their assets through a project ZIP and exported a real MP4 whose video stream contains the expected two frames. These short checks do not establish long-documentary speed or quality.

Launch `release/v0.3.2/Creatorize Suite 0.3.2.exe` or `Launch Creatorize.cmd`. Portable size: 274,451,081 bytes. SHA-256: `722F1712C36962DE2B03D6FFCA74FA1CDD17F8BD425E88968B721135FF275F38`. In an existing project, open Cast & motion → Mixamo characters → Import Mixamo folder, select the downloaded folder and apply the cast. Rebuild older flat-character shots to use the new 3D production pipeline.

The reference's 131-motion library, separate model-scout/prop-designer AI sessions, universal custom-rig retargeting and facial animation are not implemented. Live paid providers and signed-in browser generation remain subject to the account-specific limits below. The full revised brief is not complete. Existing user projects were not rebuilt or overwritten by these checks.

## Previous 0.3.0 verification record

Version 0.3 builds successfully. The actual Windows unpacked app passed empty startup, sandbox/context isolation, encrypted credentials, live model discovery/project selection, real MP4 export, Windows speech/audio processing and a dedicated Three.js effects capture. A signed-in Codex edit used the packaged scoped MCP bridge, candidate-frame/preview tools and actual before/after PNG and MP4 captures. The single-file portable build passed extraction, startup, empty project/channel/routine/thumbnail lists, the Usage screen and bundled interface/font notice checks.

Launch `release/v0.3.0/Creatorize Suite 0.3.0.exe` or `Launch Creatorize.cmd`. The portable file is 302,800,017 bytes; SHA-256 `6B47302AB03C909A874B536DEF45E7AC6A439DA3E8023D2201DBEC5CACC69D08`. The user's running application and workspace were not restarted or replaced by these tests.

New checks also passed for live CC0 textured-model retrieval, OSM/DEM geometry, camera/audio synchronization, repeated-take review, reference ranges, custom styles, characters, fourteen-node real-media autopilot, image-provider catalogs/protocols and desktop-session restoration. The 30-second 1080p/60-fps render produced all 1,800 frames and synchronized audio. Direct canvas capture reduced the local run from 665.7 to 316.7 seconds, with identical MP4 SHA-256 hashes. This does not establish long-documentary performance or live validation of unconfigured paid services.

Native Anthropic/fal/Higgsfield generation and authenticated Google Flow still need validation with configured accounts. The Flow browser bridge passed an isolated browser-control fixture; its live signed-in layout is not certified. Dedicated Poly Pizza/Sketchfab OAuth and Mapbox adapters remain unimplemented. Actual working sources include Poly Haven CC0, local GLB/rig import and OSM/DEM.

The earlier record below is historical and does not certify every revised requirement.

## Earlier implementation record


One local desktop application. No sample projects or seeded content.

Last updated: 2026-10-14. SPEC.md is the supplied product brief; its embedded build workflow does not override the user's request. The full brief is **not yet complete**. The application below is implemented; unfinished requirements are listed explicitly.

## Implemented and exercised

- Fixed the reported Connections error: structured provider failures now take precedence over stderr warnings. The screenshot's saved October 13 failure was a usage-limit error. Historical jobs show their actual cause and date, with expandable diagnostics. Test/calibration quota failures no longer silently retry. A new live Codex Tier A calibration passed on October 14, including tool use, scene generation and image understanding. The optional local model picker no longer runs when Codex is selected.
- Editable timeline cues, text cards and imported ambience/music/SFX clips, including trim, placement, volume, looping and fades. FFmpeg mixes and ducks actual audio and measures final loudness. Browser and audio integration tests passed. 3D scenes now composite below 2D labels and cards.
- Workspace Usage dashboard, project filtering, failed-attempt usage, cache-aware per-model estimates and preserved price snapshots. Explicitly enabled per-role fallback chains retain usage from failed attempts. Independent QA routing overrides the project's builder choice.
- Expanded MCP tools for public source discovery/retrieval, licensed image/footage search/download, loudness measurement, staged sound tracks and storyboard titles, and memory proposals requiring approval. Tests verified scope restrictions, staging and approval. A configured SearXNG endpoint enables general search; the default search tool uses Wikipedia source discovery, with direct retrieval for public primary sources.
- Thumbnail reference analysis, saved channel style keys, multiple candidates per prompt, and parent-linked regeneration history. These inference flows require a working configured provider; the local canvas persistence and protocol tests passed.
- Routine upload nodes after approval, checkpointed multi-topic branches, daily run limits and budget checks between steps. Restart/approval/budget tests passed. A single provider call may exceed a cost threshold; unknown-priced attempts pause budget-limited runs. JSON import/export preserves batch and limit settings.
- Reusable declarative characters, trees, buildings, arrows, ships and bridges compile to editable elements. Added animated limbs, sparse keyframes, orbit/dolly cameras, configurable 3D lighting and shadows. Actual-frame tests verify interpolation and deterministic backward seeking. These are basic components, not detailed historical reconstructions.
- Inspection passes now measure 3D screen bounds and sampled raycast visibility, and flag marked grounded objects and collision-group bounding-volume overlaps. Essential subjects are checked for framing. These conservative checks supplement visual review; they do not prove exact mesh collision or complete visibility.
- Capability badges and Lite-mode guidance appear next to the project model controls. Tier C and uncalibrated local models use simpler per-shot prompts, component support and a 40-element limit for new scenes. Existing edits preserve unrelated objects. Workspace routing presets support Codex, Claude, hybrid and local-only configurations.

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
- Shift-drag time-range selection applies edits to the whole shots overlapping that range. Object selection edits enforce preservation of other elements and scene settings. Actual before/after PNGs and short silent MP4 motion previews appear in the result and Git History; Play both starts the paired clips together. Browser tests verified actual decoded playback and the complete edit flow.
- External edits to canonical scene JSON are validated, checked in the renderer, hot-reloaded into the live player and committed. Invalid edits preserve the last valid preview. Actual file-edit/reload tests passed.
- Layout measurements report rotated 2D/text bounds, off-screen objects and candidate text overlaps. Long unbroken labels are measured against available width. 3D inspection adds projected bounds and sampled raycast visibility; path bounds remain outside these checks.
- Programmatic blank-frame and text-fit checks. Codex visual review of rendered start/middle/end images, with repair loops. Live scene generation and image-understanding calibration passed. Compatible vision APIs can receive image inputs, but have not been live-tested.
- Real MP4 rendering with Chromium frame stepping and FFmpeg, captions in SRT, 720p/1080p/4K and vertical export options. A real 3840×2160 H.264 test passed with 36 frames at 24 fps, camera motion, 3D lighting/shadows and text overlays. It took 41.4 seconds on this machine; this short check does not establish long-video performance.
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
- The intermediate 0.1 feature build's single-file portable executable passed actual extraction/startup, empty workspace and Usage navigation using a browser debugging connection. Direct Playwright Electron launch cannot use its inherited debug pipe through the NSIS wrapper; `tests/portable.mjs` covers that wrapper separately. The user's running app was not automatically restarted because automatic approval review rejected that action.

- Windows portable build produced an executable, but the first packaged export test failed because electron-builder excluded Three.js modules under its dependency's `examples` directory.
- The build explicitly copies the required GLTF/Skeleton/geometry modules and their license into public runtime files. The latest unpacked Windows executable passed actual MP4 rendering through bundled Chromium/FFmpeg and real Windows TTS/audio processing, as well as empty startup and provider detection.
- The packaged executable also passed a live signed-in Codex edit through the bundled MCP subprocess: candidate PNG rendering, preview checks and saved before/after captures. This verifies the actual Electron-as-Node bridge and packaged paths, not just the development server.
- The packaged editor fetched the live catalog, saved a model selected through the project picker, and used that exact model ID for a real Codex edit. Provider switching drives visual-review routing; independent QA providers can be configured explicitly.
- Repeated Git revert/undo and a real ZIP export/import round trip now pass. A timestamp rewrite after reverting had dirtied project.json; the index now loads the committed snapshot without rewriting it.

## Remaining brief requirements

- Wider live provider calibration and validation with genuinely weak local models. Lite adaptation is implemented, but no local inference server is installed here. Claude image input is implemented but not live-validated. The expanded MCP catalog still lacks model/map retrieval and storyboard timing mutation.
- Detailed style-specific rigs beyond the basic reusable components, real maps, automatic real-footage placement and style training from reference videos. Geometry checks use bounding volumes and sampled rays, not exact mesh intersection. The current renderer uses validated declarative scenes, not unrestricted arbitrary scene code.
- Range editing currently changes whole intersecting shots. Before/after clips are short, silent motion previews rather than full-shot audio comparisons.
- Additional validated speech languages and live validation of the newly added speech/image adapters. Windows voice coverage depends on installed OS voices.
- Per-prompt thumbnail aspect ratio/resolution and image generation cost accounting.
- Channel catalog scraping and concurrent routine branches. Multi-topic routines currently run independent branches sequentially, with durable checkpoints and separate approvals.
- Long-video/4K/hardware performance validation, signed distribution, auto-update and macOS packaging. Personal Brand is a later phase of the brief and is not implemented.

## Verification commands

`npm test` — 19 core, durability, error-reporting, usage/fallback, routine, upload-protocol and audience-approval tests.

`node tests/connection-ui.mjs` — reported screenshot regression: dated quota failure, collapsed diagnostics, no unsolicited local-model fetch and Usage navigation.

`node tests/timeline.mjs` — browser timeline persistence, cue/card rendering and real audio trim/fade/duck/loudness checks.

`node tests/scenes.mjs` — component expansion, deterministic keyframes/cameras, real 3D bounds/raycast/ground/collision detection and editor capability guidance.

`node tests/render-4k.mjs` — actual 4K H.264 render with FFprobe verification of dimensions, frame rate and decoded frame count. This is a short render check, not a long-video benchmark.

`node tests/adapters.mjs` — ComfyUI/Kokoro HTTP protocol, real WAV decoding and private-network research protection. This is protocol validation, not live model inference.

`npm run test:e2e` — real browser interaction, voice generation, audio playback, export, persistence, every screen and origin protection.

`npm run test:media` — actual video/GLB frame rendering, deterministic seeking and canvas persistence.

`npm run test:desktop` — native Electron window and security settings.

`node tests/portable.mjs` — real single-file executable extraction/startup in an isolated workspace, connected through its browser debugging endpoint.

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
