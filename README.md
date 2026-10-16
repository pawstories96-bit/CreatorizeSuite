# Creatorize Suite · Personal Edition

One local Windows desktop application for AI video production. First launch is empty; no demo projects are installed. The revised requirements, verification and remaining gaps are tracked in [UPGRADE_PLAN.md](UPGRADE_PLAN.md) and [PROGRESS.md](PROGRESS.md).

## Run

Double-click `Launch Creatorize.cmd` or `release/v0.3.0/win-unpacked/Creatorize Suite.exe`. The portable output is `release/v0.3.0/Creatorize Suite 0.3.0.exe`. Check PROGRESS.md for packaged verification status. The old launcher forwards to the new one.

For development:

```powershell
npm ci
npm run build
npm start
```

New desktop workspaces live in `Documents/Creatorize Workspace`. Existing `Documents/Framecraft Workspace` data is reused automatically. `CREATORIZE_WORKSPACE` or the legacy `FRAMECRAFT_WORKSPACE` can select another directory. The Node development server uses `.workspace`. Tests use separate ignored directories.

## First video

1. In Connections, choose an installed, signed-in official Codex/Claude CLI, native Anthropic API, compatible API or local server and test the connection. Store API keys in the encrypted credential dialog.
   Model dropdowns fetch directly from your connected runtime. In an open project, click the model chip above the chat composer to choose a provider, model and thinking effort for that project. New jobs use your selection; already queued/running jobs keep their captured settings. Choose workspace defaults to return to normal role routing.
2. Create a project with a topic or paste your script. Review research and narration before generating speech.
3. Generate a Windows voiceover, import audio, or import a camera recording. Local Whisper generates actual word/phrase timestamps and timed text/SRT. Visually trim pauses or review repeated starts. Accepted cuts remap audio, scenes and camera timing; original media is retained.
4. Build the video. Review shots while the build continues; use the chat panel for a shot/object/video edit. Shift-drag the timeline to edit all shots overlapping a range. Completed edits include actual Before / After frames and short silent motion clips in the result card and History. Play both starts the paired clips together. Higher review tiers run additional checks.
5. Import images, MP4s, GLBs or audio in Assets. Live asset tools retrieve CC0 Poly Haven models and small OSM building/road maps with public DEM terrain and attribution. Pick parts saves reference-video In/Out ranges and frame analysis. Build reusable articulated 2D characters and adjust actual renderer effects through Style controls. Use audio as a ducked bed beneath narration.
   Open **Edit tracks** in the editor to set element cues, timed cards and music/ambience/SFX clips. Run Sound design after changing audio tracks to rebuild the mix.
6. Export the MP4 and SRT. Optional YouTube publishing requires your own Google OAuth setup and explicit upload review.

## New production controls

- Seven real Canvas/Three.js visual styles and hover previews; reflective water, articulated figures, connected geometry, particles, SSAO, bloom, film grain, outlines, PS1 snapping, fixed-640 pixel rendering and paper halftone effects.
- Six build tiers. Independent QA inspects full frames and detail crops. Specialist upgrades save real before/after clips. Ultra Edit+ needs an image provider for the target and an AI route for bounded matching; unsuccessful upgrades preserve the original scene.
- Reference-trained custom style specifications and reusable modules travel with project ZIPs. Scripting skills and phrase/sentence rules are editable per project.
- Brand workspaces, eight-stage drag/drop channel boards, public channel catalogs, duplicate-aware topic discovery and the connected 14-node autopilot template. No template runs or example projects start automatically.
- Daily/cron schedules use the selected time zone while the app is running. Optional automatic audience learning requires corroborated evidence and is disabled by default.

## Image connections

Choose the image provider in Settings and save settings. Thumbnail Canvas/Prompt views and Ultra Edit+ use the selected provider.

- **Configured image API:** compatible generation/edit endpoints and model. Store its key in Connections.
- **ComfyUI:** running server and installed checkpoint, fetched directly. Custom API workflows support prompt/model/reference placeholders.
- **fal:** fetch/search actual text and reference model catalogs, with separate selections. Model parameters are validated against live schemas. Interrupted requests retain their IDs for retrieval. Requires a fal API key and API billing.
- **Higgsfield:** dedicated queue/upload adapter using a key in `ID:secret` format. Its public supplementary schema is labeled as a partial catalog. Reference generation requires an advertised image input. Website subscriptions and API access can differ.
- **Google Flow:** open the dedicated browser, sign in manually, open a project and select Image mode. Select model and ratio in Flow, then check the connection. Public browser controls send prompts/references and import completed images. Flow account access and credits apply. Browser layout changes can require selector updates; authenticated generation remains unverified.

No paid Anthropic, fal/Higgsfield or signed-in Flow account was available for live generation validation. Their protocol/browser fixtures are distinct from live service checks. No dedicated Poly Pizza/Sketchfab OAuth harvester or Mapbox adapter is implemented yet; CC0 Poly Haven, local GLB/rig import and OSM/DEM work. Some building heights are estimated and labeled; complex multipolygon holes are not reconstructed.

## Runtime dependencies

- Git is required for project history. It is installed on the build machine but not bundled.
- FFmpeg/FFprobe and Chromium are bundled in the Windows output. The renderer does not depend on an open browser.
- Python 3.13 is used for faster-whisper. On first transcription the app can create a private virtual environment and install faster-whisper; the selected speech model is downloaded once. This needs internet access on first setup.
- Windows TTS uses installed system voices. ElevenLabs, compatible API/image providers and YouTube are optional and require configuration; unavailable providers produce real errors.
- Subscription access uses official CLIs only. The app never extracts subscription tokens. API credentials are encrypted for the current OS user.
- Connections includes opt-in per-role fallback chains and per-model pricing. Usage shows successful and failed attempts, including cache tokens. Subscription cost estimates are API equivalents, not additional charges. Historical connection results display their date; retry to check the current provider status.
- Routing presets are available in Connections. The project editor shows the selected model's measured capability tier, or Not calibrated. Tier C and uncalibrated local models use Lite mode: simpler per-shot work and up to 40 expanded elements in new scenes. Independent QA can use another provider.
- Settings supports Piper (executable plus ONNX voice and matching JSON), Kokoro (running compatible speech endpoint), Fish Audio (key and reference voice), and ComfyUI (running server plus installed checkpoint). These adapters do not install model weights or start third-party servers.
- ComfyUI custom workflows use API-format JSON with `{{prompt}}`, `{{model}}` and `{{reference:0}}` placeholders. Without a custom workflow the standard checkpoint graph accepts one reference image. Thumbnails supports reference analysis, channel style keys, variants and regeneration history.
- Multi-topic routines create separate projects sequentially and preserve each branch's approval/checkpoint. Upload steps require a prior approved Approval step and configured YouTube authorization. Cost limits apply between steps; an in-flight request can exceed the threshold. Unknown prices pause a budget-limited routine. Set the missing prices or adjust the limit before retrying.

## Build and test

```powershell
npm test
npm run test:e2e
npm run test:media
npm run test:desktop
node tests/agent-tools.mjs
node tests/editing.mjs
node tests/models.mjs
node tests/connection-ui.mjs
node tests/timeline.mjs
node tests/scenes.mjs
node tests/render-4k.mjs
node tests/adapters.mjs
npm run package
$env:PACKAGED_EXE='release/v0.3.0/win-unpacked/Creatorize Suite.exe'
node tests/desktop.mjs
node tests/portable.mjs
```

Packaging requires `resources/ffmpeg` and `resources/browser`. They are intentionally excluded from source control. `npm run build` copies the small Three.js runtime loader modules explicitly because the packager otherwise excludes dependency examples.

Live provider tests consume the selected provider's usage allowance. Core tests do not call paid services. Test fixtures are never shown as user projects.

## Architecture

- `app/`, `src/`: static Next.js App Router, React/Tailwind, Zustand, editor and XYFlow canvases.
- `public/player.js`: deterministic scene runtime shared by preview, QA and rendering.
- `server/core.mjs`: schema, persistence, project files and Git.
- `server/agents.mjs`: official CLI / compatible API adapters and credential vault.
- `server/model-catalog.mjs`: live model discovery without an inference turn; `server/agent-routing.mjs`: provider-safe model resolution and per-job routing snapshots.
- `server/agent-tools.mjs` and `server/mcp-bridge.mjs`: job-scoped MCP tools for project/word/storyboard/asset reads, candidate PNG rendering, preview checks and layout measurement. Compatible API/local providers use the same tools through a bounded function-calling loop. CLI configuration is per invocation; global provider settings are not modified.
- `server/scene-watch.mjs`: validates changes to `scenes/<shotId>.json`, reloads the preview and commits accepted changes. Invalid edits keep the last valid preview and show a failed reload job. Generated `.js` mirrors are not the editable source.
- `server/pipeline.mjs`: durable jobs, audio, generation, QA, rendering and routines.
- `server/cloud-images.mjs`, `flow-bridge.mjs`, `comfy.mjs`: schema-driven image APIs, public browser controls and local generation.
- `server/models.mjs`, `maps.mjs`, `references.mjs`, `style-training.mjs`: real assets/geographic data, reference ranges and reusable custom styles.
- `server/audio-edits.mjs`, `takes.mjs`, `transcribe.py`: real cuts, alignment and source-camera remapping.
- `server/integrations.mjs`: Google APIs and image routes.
- `server/youtube-upload.mjs`: persisted upload sessions and interrupted-transfer recovery.
- `server/audience.mjs`: video/retention/comment retrieval and explicit approval of learned rules.
- `server/assets.mjs`: Commons search and attribution ledger.
- `electron/main.cjs`: hardened desktop shell, tray and bundled runtime paths.

This is local software with optional external AI services. The full attached brief is not yet complete; PROGRESS.md separates implemented, externally unverified and unfinished work.

API behavior references: [YouTube resumable uploads](https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol), [video publishing fields](https://developers.google.com/youtube/v3/docs/videos), [retention reports](https://developers.google.com/youtube/analytics/channel_reports), and [comment retrieval](https://developers.google.com/youtube/v3/docs/commentThreads/list).

Adapter references: [Claude streaming input](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode), [Fish speech](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech), [Piper CLI](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/CLI.md), [Kokoro FastAPI](https://github.com/remsky/Kokoro-FastAPI), and [ComfyUI server routes](https://docs.comfy.org/development/comfyui-server/comms_routes).
