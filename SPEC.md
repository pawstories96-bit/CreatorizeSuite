# MASTER BUILD PROMPT: "{{APP_NAME}}" — Local-first AI Video Studio for Faceless YouTube Channels

> **How to use this file**
> 1. Create an empty repo. Save this file as `SPEC.md` in the root.
> 2. Open Claude Code in that folder and paste the section **"0. First message to Claude Code"** below.
> 3. Build **one phase at a time** (Section 17). Do not ask Claude Code to build everything in one go.
> 4. Replace every `{{PLACEHOLDER}}` with your own choice. Use your own app name, logo and style names. Do not copy another product's branding or assets.

---

> **v2 update.** This version merges a second, ~3-hour walkthrough that covers all five styles, the quality slider, UltraEdit, model/effort trade-offs, routines, analytics and measured performance. Main changes: quality tiers replace the build checkboxes (§7.5, §8.2) · UltraEdit (§8.3) · model/effort policy (§8.1) · vision-only QA agent (§8.4) · review notes + quick-fix agent (§7.4) · per-style specifics (§10.1) · hardware profiler and local models (§9) · analytics/comment learning loop (§15) · performance targets (§18).

> **v3 update.** The agent runtime is now **provider-agnostic**: it works with a Claude subscription, a **ChatGPT subscription** (through the official Codex CLI sign-in), API keys, and a **free/local path**. New: §8.6 (adapters, capability tiers, Lite mode, role router, quota-aware execution, zero-cost mode), Connections page (§7.12), phase 3b (§17). Wherever this spec says "Claude", read "the active agent".

---

## 0. First message to Claude Code

```
You are a senior staff engineer building a desktop application from the attached SPEC.md.

Before writing any code:
1. Read SPEC.md fully.
2. Reply with (a) your proposed repo layout, (b) the 8 most important open questions
   or ambiguities, (c) the 5 biggest technical risks and how you'll de-risk each,
   (d) a confirmation of the stack in Section 3 or your proposed changes with reasons.
3. Wait for my answers. Then start Phase 0 only.

Working rules:
- Build phase by phase (Section 17). Each phase ends with its acceptance checks passing
  and a short demo script I can follow.
- Keep a PROGRESS.md (done / next / known issues) and update it every session.
- Put every external provider (LLM runner, TTS, image gen, asset search, YouTube) behind an
  interface with a mock implementation, so everything is testable offline.
- Make the agent runtime provider-agnostic from day one (Section 8.6): Claude Code, ChatGPT/Codex
  sign-in, and local/free models must all plug in through the same AgentRunner interface.
- Never hard-code secrets. Use the OS keychain (Electron safeStorage) for API keys.
- Write automated tests for all non-UI logic (pipeline state machine, timing alignment,
  routine executor, asset-license tracking, git edit/revert).
- Commit often with clear messages. Do not silently stub features: if something is faked,
  mark it TODO(stub) and list it in PROGRESS.md.
```

---

## 1. Product in one paragraph

{{APP_NAME}} is a **local desktop app** that turns **one topic (or a script + voiceover)** into a **finished, upload-ready explainer or documentary video** for faceless YouTube channels. An AI agent (Claude, running locally through Claude Code) researches and writes the script, builds every shot as **code** (Three.js / HTML scenes) synced word-by-word to the narration, **visually verifies its own work by rendering frames and looking at them**, designs ambience and sound, and exports the video. The user reviews in a **real-time editor** where they can click anything in the preview, describe a fix in plain English, and have the agent fix just that element, shot, or the whole video. A **Routines** feature chains the whole pipeline (topic finding → project → script → voiceover → build → QA → render → thumbnail → title/description → approval → upload) into a node graph that runs on a schedule on autopilot.

**Target user:** a faceless-channel creator running 1–15 channels who wants broadcast-quality, high-retention videos at near-zero marginal cost.

**Signature claims the product must deliver on:**
- Runs locally. No video rendering in the cloud. Cost is the user's existing Claude subscription plus optional pay-per-use APIs (TTS, image generation).
- A usable video with **zero configuration** (sensible defaults); optional "extras" for higher quality.
- The preview is **real-time** (scrub the timeline with sound), not a pre-rendered file.
- Every edit is **reversible** (git history) and **attributed** (what changed, how long, API-equivalent cost).
- Builds are **resumable** after app restarts or crashes.

**Two workspace modes:** *Faceless Brand* (everything in this spec) and *Personal Brand* (editing talking-head videos, intros and similar inside the same app — a later phase, see §17 Phase 10). A mode switcher sits at the top of the sidebar.

**Languages:** 24+ languages for script, voiceover and word timing.

**Concurrency:** several projects can build at the same time (user-set limit, default 1–3 depending on hardware), and the preview must stay smooth while builds run.

**Agent providers (v3):** the product runs on the user's **existing AI subscription**, whichever they have: a Claude plan (via Claude Code), a ChatGPT plan (via the Codex CLI's "Sign in with ChatGPT"), an API key for any supported provider, or a **free path** using local models and/or free-tier keys. Output quality depends on the model; the app must detect capability and adapt (Section 8.6) rather than promise identical results everywhere.

---

## 2. Non-negotiable design principles

1. **Local-first.** Projects are plain folders on disk. SQLite for app state. No required backend.
2. **The agent edits code, not pixels.** Every shot is a source file the agent can rewrite. This makes edits precise, diffable and revertible.
3. **Scenes are pure functions of time.** `render(t)` must be deterministic and seekable, so scrubbing, verification screenshots and final export all produce identical frames.
4. **Verify, don't trust.** The agent must render frames, inspect them, and fix problems (floating objects, z-fighting, collisions, unreadable text, blank frames) before declaring a shot done.
5. **Everything resumable.** Long jobs persist state to disk after every step. On relaunch, running jobs continue where they stopped.
6. **Honest content.** Reconstructions are labeled as reconstructions. Speculative "what-if" shots are labeled. Quotes are paraphrased unless sourced. All facts carry sources in `research.md`. All third-party assets carry license + attribution records.
7. **Cost transparency.** Show time and API-equivalent dollar cost for every agent run, per project and in total.
8. **Defaults over settings.** Each style ships "ready to post" with no direction given.

9. **Frontier model first, cheaper tiers as options.** The strongest configured model gives the best spatial and visual results with the fewest fix loops. Cheaper models are selectable but come with guardrails (§8.1).
10. **Explicit verification beats "more effort".** Every build and edit prompt the app writes contains explicit instructions to render, inspect and fix, whatever the effort setting is.
11. **Review while it builds.** Finished shots must be scrubbable in real time while the rest of the video is still being built.

12. **Provider-agnostic by construction.** No feature may depend on one vendor's CLI. All agent work goes through the `AgentRunner` interface and app-provided MCP tools, and every pipeline stage has a defined degraded mode for weaker models (Section 8.6).
13. **Official clients only.** Subscriptions are used only by launching the provider's official CLI. Never extract, copy or proxy subscription tokens, and never call undocumented subscription backends.

---

## 3. Recommended stack (confirm or improve)

| Layer | Choice | Notes |
|---|---|---|
| Shell | **Electron** (alt: Tauri) | Electron chosen for easy Chromium/WebGL, headless render windows, Node child processes |
| UI | React + TypeScript + Vite + Tailwind + Zustand | Dark theme, design tokens, Inter + mono for logs |
| Canvas editors | React Flow (routines + thumbnail board) | Infinite canvas, nodes, edges, minimap |
| Timeline | Custom canvas/DOM component | Virtualized, zoom 1x–200x, multi-track |
| Preview runtime | Three.js (+ postprocessing) inside a sandboxed `<webview>`/iframe | Hot reload on file change |
| App DB | SQLite (better-sqlite3) | Projects index, runs, costs, settings, jobs |
| Project history | git (simple-git or isomorphic-git) | One commit per applied edit |
| Agent runtime | **Adapters behind one `AgentRunner` interface:** Claude Code (headless/streaming, or the Claude Agent SDK) · **Codex CLI** (non-interactive mode with JSON events; ChatGPT sign-in or API key) · **Open runner** (an embedded open-source agent such as OpenCode, or a minimal built-in tool-calling loop) for BYO keys and local models | See Sections 8 and 8.6 |
| Local LLM (free path) | Ollama / LM Studio / llama.cpp via an OpenAI-compatible endpoint | Optional; capability-tested (Section 8.6) |
| Local image gen (free path) | ComfyUI / Stable Diffusion behind the image-provider interface | Optional; for sprites, Vox cut-outs, thumbnails |
| Custom agent tools | Local **MCP server** bundled with the app | `render_frames`, `check_preview`, `search_assets`, etc. |
| Audio | ffmpeg (bundled), RNNoise/afftdn, loudnorm | Cleaning + mixing |
| Word timing | Local Whisper (whisper.cpp or faster-whisper) with word timestamps; optional forced alignment against the script | Fully offline |
| TTS providers | ElevenLabs, Fish Audio, local TTS (Piper/Kokoro), "My recording" import | Provider interface |
| Image gen | Provider interface (aggregator APIs such as Higgsfield, fal, Replicate, OpenAI, Google) | User supplies key |
| Export | Headless Chromium frame stepping → ffmpeg pipe (GPU encoders when available) | Full HD and 4K |
| YouTube | Google OAuth, Data API v3 (upload, thumbnails.set, schedule), Analytics API | Section 14 |
| Packaging | electron-builder, auto-update | Windows + macOS first |

**Background work:** run jobs in a worker/utility process pool. Prevent system sleep during builds (Electron `powerSaveBlocker`). Offer tray mode and start-at-login so scheduled routines keep running. Add a **hardware profiler** (Section 9) that picks local models for the machine.

---

## 4. Workspace and project structure

```
~/{{APP_NAME}}Workspace/
  app.db                      # SQLite: projects, channels, runs, costs, settings
  memory/rules.md             # global rules the agent always follows
  styles/                     # built-in + user-trained style packs
  channels/<channelId>.json   # channel profile, style key, referenced channels
  projects/<projectId>/       # each project is its own git repo
    project.json
    script.txt                # narration with "## Chapter" headings
    research.md               # facts + sources + confidence notes
    audio/
      voiceover.original.wav
      voiceover.clean.wav
      words.json              # [{ "w":"bridge", "start":12.34, "end":12.71 }]
    storyboard.json
    scenes/
      c01_open.js             # one module per chapter/shot group
      c02_bridge.js
    lib/                      # shared project modules (e.g., kb_scene.js diorama kit)
    assets/
      models/ photos/ maps/ footage/
      ATTRIBUTIONS.json       # every third-party asset: source URL, license, author
    sound/                    # ambience.json, music cues, sfx cues, mix report
    exports/
    AGENT_GUIDE.md            # canonical generated guide: style guide + scene API + rules
    CLAUDE.md / AGENTS.md     # generated copies so each CLI auto-loads the same guide
```

### `project.json`
```json
{
  "id": "uuid",
  "title": "What Really Happened to the Baltimore Bridge",
  "channelId": null,
  "style": { "id": "3d-reconstruction", "look": "studio", "params": {
      "realPhotosAndFootage": true, "photosPerMinute": 4,
      "use3DModelsFromWeb": true, "useRealMaps": true } },
  "targetLengthSec": 900,
  "language": "en",
  "story": { "mode": "claude-writes|i-have-a-script", "topic": "...", "direction": "..." },
  "voiceover": { "provider": "my-recording|elevenlabs|fish|local", "durationSec": 1829 },
  "pipeline": {
    "script": "done", "voiceover": "done", "audioCleaned": "done", "wordsTimed": "done",
    "storyboard": "pending", "scenes": "pending", "soundDesign": "pending", "exported": "pending"
  },
  "status": "draft|editing|ready"
}
```

### `storyboard.json`
```json
{
  "shots": [{
    "id": "s001", "chapter": "c01_open", "title": "the Dali drifts into Pier 17",
    "start": 0.0, "end": 8.0,
    "narration": "At twenty-nine minutes past one in the morning...",
    "wordRange": [0, 24],
    "sceneModule": "scenes/c01_open.js", "sceneExport": "shot1",
    "assets": ["models/container_ship.glb", "maps/baltimore.png"],
    "cues": [{ "t": 3.2, "wordIndex": 11, "action": "collision" }],
    "cards": [{ "t": 0.5, "dur": 4, "text": "01:29 · 26 MARCH 2024", "sub": "PATAPSCO RIVER, BALTIMORE" }],
    "flags": { "speculative": false }
  }]
}
```

---

## 5. The pipeline (the "checklist" shown in the editor sidebar)

Each stage has a status (`pending / running / done / error`), an action button, and is **re-runnable**.

| # | Stage | Button states | What it does |
|---|---|---|---|
| 1 | **Script written** | Open | Research + write + fact-check + humanize (Section 6) |
| 2 | **Voiceover added** | Add / Replace | Choose provider or import recording (Section 9) |
| 3 | **Audio cleaned** | Run / Redo | ffmpeg denoise, EQ, loudness normalize |
| 4 | **Words timed** | Run / Redo | Local Whisper → `words.json` |
| 5 | **Storyboard written** | — | Agent splits narration into shots, plans visuals/assets |
| 6 | **Scenes built** | Build | Agent writes scene code per chapter, verifies frames |
| 7 | **Sound design mixed** | Mix | Ambience, music, SFX, ducking under voice, loudness report |
| 8 | **Video exported** | Export | Deterministic render to MP4 |

**Important rule:** scenes are built only after stage 4, because shots are timed to the voiceover.

**Quality tier:** stage 6 runs at the tier the user picked on the Build modal (Section 8.2). **UltraEdit** (Section 8.3) is available per shot as soon as a shot's scene exists.

---

## 6. Script engine (stage 1)

Triggered by "Claude writes it" (topic → script) or "I have a script" (paste/upload).

**Multi-agent sequence (each its own Claude run, logged):**
1. **Researcher** — web search + fetch, cross-reference multiple sources, prefer primary sources (official reports, court/NTSB-type documents, agency pages). Writes `research.md`: claim, source URLs, which key numbers were confirmed by ≥2 sources, what's unverified.
2. **Writer** — writes `script.txt` in markdown: `## Chapter title` headings, plain narration paragraphs, numbers/dates **written out as spoken words** (TTS-safe), strong cold open with the hook, clear arc, target word count = `minutes × ~150` (e.g., ~2,250 words for 15:00; tolerance ±10%).
3. **Fact-checker / proofreader** — verifies each claim against `research.md`, removes or softens unsupported claims, ensures sensitive topics are handled respectfully (victims named only if sourced).
4. **Humanizer** — removes AI-isms, repetitive structure, filler; keeps it conversational.

**Writing modes (selectable per project and per routine):** Balanced · Deep research · Fact-checked · Fast draft · Human & conversational. Also **Custom writing rules** (user text saved as a reusable rule set).

**Script modal UI:** tabs *Narration* / *Research & sources*; live spoken-word count and estimated duration at 150 wpm; buttons *Open file*, *Rewrite with Claude*, *Copy for TTS* (cleaned text without markdown), *Make the voiceover*, *Save*.

### 6.1 Script additions (v2)
- **Direction for the script:** optional free text, e.g. "dig deep, clear structure with several hooks to keep average view duration high, never re-explain the same point; every explanation must be relevant". Pass it to both researcher and writer.
- **Script rules (hard rules):** required keywords/phrases and banned keywords/phrases per channel or niche (e.g., brand-safety words to avoid). The fact-checker step enforces them; violations are rewritten.
- **Length control:** target words = minutes × measured words-per-minute for the chosen voice (default ~150), tolerance ±10%.
- **Language:** write the script natively in the target language, not by translating afterwards.
- **Topic framing check:** the researcher must state its understanding of the topic angle in the first lines of `research.md` (e.g., "this is an unofficial fan port, not an official release"). Offer an optional **"Review framing" pause** after research, in the editor and in routines, because the agent can misframe a topic and the user may need to steer it once.
- **Typical timings to design around:** research + script 1–7 minutes depending on length and model (about 2 min for ~8–10 min videos, ~6 min for ~25 min videos).

---

## 7. Screens and UI specification

Dark, minimal, high-contrast; rounded cards; thin borders; monospace for agent logs. Left collapsible sidebar. Top-left **brand/workspace switcher** (e.g., "Personal Brand" / "Faceless Brand") that filters channels and projects. Global search / command palette (`Ctrl/Cmd+K`).

**Sidebar:** Home · Projects (count) · Channels · Editor (dot when a build is running) · *Workspace:* Styles · Memory (badge "N new") · Thumbnails · Routines · Renders · *Analytics:* YouTube · New project.

### 7.1 Home
- "Welcome back" + Import / New project buttons.
- 4 quick cards: Continue editing (last project), New project, Styles, Memory.
- **Recent projects** list with relative times.
- **Recent edits** feed: each agent edit (prompt excerpt, project, status chip `Applied / Stopped / Failed`, relative time) plus header "N edits · $X of Claude usage".

- **Usage panel:** total tokens used across all videos, the **API-equivalent cost**, and an estimated "saved versus API" figure, with a this-week / last-week view. Clicking any run's cost opens a **token breakdown** (input / output / cached, per stage and per tool).

### 7.2 Projects
- Header: Import folder · Import .zip · New project.
- Search, channel filter, status tabs (All / Draft / Editing / Ready).
- Card grid: thumbnail (or "No scenes yet"), duration badge, title, "N shots · Style look", channel chip, status chip, last-edited time, actions (open folder, duplicate, export zip, delete).

### 7.3 New project modal (3 numbered sections)
1. **The video** — big title input, Channel dropdown (or "No channel"), Voiceover drop zone ("you can add it later" — WAV/MP3/M4A/FLAC/OGG).
2. **Look** — *Style* dropdown (built-ins + custom) with **hover preview card** (image/video + description); *Look* dropdown (style-specific, e.g., "Crisp 640", "Studio"); *Length* dropdown (default 15:00).
3. **Story (optional)** — segmented: *Claude writes it* (topic input; hint text "about 2,250 words for 15:00") / *I have a script*; *Direction for Claude* (optional textarea).
- Footer: `Ctrl+Enter to create`, Cancel, **Create project**. On create with a topic, the script stage starts automatically.

**Additional fields (v2):** *Format* (16:9 or 9:16, where the style supports both) · *Language* · style-specific options (e.g., **character picker** for Flat explainer, photos-per-minute and 3D-model/map toggles for 3D reconstruction) · the Look dropdown shows a **hover preview** (image or short loop) of every style.

### 7.4 Editor (the core screen)
**Top bar:** project title · "Saved locally · git history" · channel chip · style chip (e.g., "3D reconstruction · Studio") · icons (open script, shortcuts, open folder) · **Export**.

**Left panel**
- *Shots (N)*: list with thumbnail, title, start time · duration, scene file name. Click selects and seeks.
- *Pipeline* checklist (Section 5) when no scenes exist; collapses once built.

**Center**
- Real-time **preview canvas** (16:9, or 9:16 for vertical styles) with an on-screen "RECONSTRUCTION"-style tag as defined by the style.
- Transport: prev/play/next, `current / total`, current shot label, screenshot, mute, loop, speed 0.5×/1×/1.5×/2×.
- **Timeline** with tracks: **Shots · Narration (waveform) · Cues (markers) · Audio (full mix waveform) · Cards (on-screen info cards) · Ambience (labeled blocks with dB, e.g., "water −30 dB")**. Click to select, drag to scrub with sound, Shift-drag for range selection, Ctrl+wheel zoom, horizontal scrollbar, zoom in/out/fit buttons.

**Right panel — Claude** (tabs *Chat* / *History*, "+" new chat)
- Streaming log of agent steps as compact rows: `✓ Reading <file>`, `✓ Writing <file>`, `✓ Running <cmd>`, `✓ Searching the web <query>`, `✓ Rendering frames at 107.0s, 115.0s…` followed by **thumbnail strip of the rendered frames** (click to open large).
- Collapsible "N earlier steps".
- Status bar: "Claude is working · 32m 52s · model chip · **Stop**".
- **Queue**: input stays enabled while working ("Queue the next change while Claude works…").
- Context chip above the input showing the **current target** (e.g., `Shot 1: the Dali drifts into Pier 17` with a `</>` button that opens the source file and an `×` to clear).
- **Scope toggle:** *Selection* · *Shot* · *Whole video*. **Apply** button.
- Suggestion chips: "Review the whole video and fix what looks wrong" · "Make all on-screen text easy to read on a phone" · "Check every visual lands on its spoken word".
- **Result card** after each run: `Applied` chip · duration · `$cost` · files changed (`research.md +79 −0`) · **View changes** (diff viewer) · **Revert** (git revert). Where a visual edit was made, show **Before/After** frame comparison.
- At the end of each run the agent posts a short report: *Fixed at the cause* (bullets) and *Worth a look in the preview* (honest caveats, e.g., "the collapse is choreographed from photos, not a physics simulation").

**Click-to-select in preview:** raycast onto the 3D scene; every object created by scene code is tagged with `userData.src = { file, line, shotId, name }`. Clicking sets the context chip to that object so the agent edits the right thing.

**v2 additions to the editor**
- **Review while building.** Completed shots are fully scrubbable with sound while the agent keeps building. The unbuilt region is shown as "not built yet" (never a broken player).
- **Multi-select shots** in the shot list (Ctrl/Shift). Each shot shows an **UltraEdit** button as soon as its scene exists.
- **Review notes.** While a build is running, the user can pin notes to a timecode, shot or clicked element ("text overflows card", "console glitches into ground"). Notes collect in a list. When the build finishes, **Send all notes to Claude** submits them as one batched edit, or the user dispatches them one by one.
- **Quick-fix agent (optional, Phase 3+).** A second Claude session for small fixes on shots already marked `built` while the main build continues. Use per-shot file locks so the two sessions never edit the same file at once; conflicting requests queue.
- **Contextual suggestion chips** that depend on what is selected, e.g. "Improve the lighting and depth on this shot", "Make this visualization more interesting", "Move this card where it doesn't cover anything".
- **Fix every instance.** When the user reports a recurring problem (text overflowing a card, a card covering key content), the agent must search the whole video for the same pattern, fix all instances, verify frames, and then offer to save a memory rule. The Whole-video scope is also the right scope for global polish prompts such as "too much going on, reduce clutter".
- **Before / After clips** are captured automatically around every visual edit (side-by-side or A/B toggle). Typical single-element or single-shot fixes should complete in roughly 20–60 seconds on a frontier model.
- **Context meter** for the active Claude session (Section 8.5).

- The right panel is titled with the **active agent** (Claude / ChatGPT-Codex / Local) and shows a provider + model chip, a **capability tier** badge (A/B/C, Section 8.6) and, in Lite mode, a short banner explaining the limits.

### 7.5 Build modal ("Build the video with Claude")
- Short explanation: writes the storyboard, builds every shot synced to narration, checks each one against rendered frames, designs the ambience, runs unattended; the user can watch or keep working.
- *Direction for this build (optional)* textarea with a **Direction helper** (clickable presets that append text), e.g. "Expand the color palette and raise contrast for readability", "Real footage or images in every other scene", "Remove on-screen text during full-screen B-roll", "Don't reuse the same character or scene twice in a row", "Visually verify your work and fix inconsistencies". State clearly: every style produces a postable video with **no direction**; directions are layered on top of the style's base.
- **Quality slider**, five stops, each with an estimated time and relative cost:
  1. **Standard** — fastest; already usable out of the box.
  2. **More depth** — more props, assets and detail in every scene.
  3. **Polished** — smoother animation, secondary motion, more of everything.
  4. **Verified** — extra verification layer: full-resolution frame checks, zoom-ins on small details, fix and re-check.
  5. **Ultra** — runs UltraEdit (Section 8.3) over every shot with the strongest model.
- **Use real photos and footage from the web** toggle (default on where the style supports it; disabled with an explanation where it does not), plus *frequency* (0–4 per minute) where relevant. For 3D reconstruction also: *use 3D models from the web*, *use real maps*.
- Footer: Cancel / **Start build**. Recommend (in a hint) that new users first run a 1-minute test build and try a few directions before long builds.

### 7.6 Voiceover modal
- Tabs: **My recording** · **ElevenLabs** · **Fish Audio** · **Local voice (free)**.
- My recording: file picker + drop zone (audio or video files).
- Checkbox (default on): "Then clean the audio and time the words (needed before Claude builds the scenes)".
- Progress list: file name ✓ → Clean the audio ✓ → Time the words (elapsed) with *Show details*. Footer: "Keeps going if you close this window (not if you quit the app)." Stop / Close.
- Provider tabs: voice picker, model, speed, preview button, cost estimate, chunking for long scripts, retries.

### 7.7 Styles page
List of built-in styles + user styles; each shows preview media, params, and "Duplicate to customize". Premium: **Train your own style** (Section 11).

- Hover over any style for a live preview. **Duplicate** a built-in style to fine-tune its parameters. Styles that need a character (Flat explainer) include a **character studio**: random character, pick from a set, or **Design with Claude** with a live "watch Claude design it" preview, including idle animation. Saved characters belong to a channel for brand consistency.

### 7.8 Memory page
Global and per-project **rules** the agent always follows (markdown list). "N new" badge = rules suggested after the user's fixes ("Save this as a rule for: this project / all videos"). Rules are injected into the generated `CLAUDE.md` at every build and edit.

- **"Keep this rule?" prompt.** After a build or edit that revealed a reusable lesson (e.g., "use real screenshots, photos and GIFs", "card captions must fit inside the card", "remove on-screen text during full-screen B-roll"), the app asks whether to keep it as a rule for **this project** or **all videos**. Rules can also be hard constraints such as "about 50/50 split of real footage and explanation". Rules are always read at the start of every build and edit.

### 7.9 Renders page
Queue + history of exports with progress, ETA, resolution, file size, open folder.

### 7.10 Channels page
Store YouTube channels (OAuth connect). Per channel: default style, default voice, global thumbnail style key, referenced channels to study, and a **workflow board** with columns for production stages → Scheduled → Published, showing each video's position.

### 7.11 YouTube analytics page
Per-channel views, subs, CTR, AVD, top videos (Analytics API). Lightweight; not a priority.

### 7.12 Settings
Claude connection (Section 8), default model + effort, API keys (ElevenLabs, Fish, image provider), local model downloads (Whisper size), GPU/encoder selection, workspace folder, concurrency, notifications.

- **Models and effort per task** (research/script, build, edit, UltraEdit, QA agent) with effort levels low / medium / high / extra high / max (Section 8.1).
- **Hardware profile:** shows detected CPU/GPU/RAM and the local transcription/TTS models chosen; "Re-run profiler".
- **Concurrency:** max simultaneous builds and renders; sleep prevention; tray mode; start at login.
- **Context compaction threshold** and cost display options.

- **Connections page (v3).** One tile per runtime: *Claude Code*, *ChatGPT (Codex)*, *Local models*, *API keys / other providers*. Each tile shows: installed? version · signed in? · auth mode (subscription / API key) · detected plan (if exposed) · available models · limits (if exposed) · **Test connection** and **Run calibration** buttons · a "How to connect" help link. Below the tiles: the **Role router** table (Section 8.6.7) and presets *All Claude · All ChatGPT · Hybrid · Zero-cost*.

---

## 8. Claude integration (the heart of the product)

> **v3 note:** this section describes the Claude Code adapter in detail. The same architecture applies to every provider; Section 8.6 defines the provider-agnostic layer (ChatGPT subscription, free and local options).

**Runner**
- Spawn Claude Code (headless, streaming JSON events) with `cwd = project folder`. Use the user's own installed/authenticated Claude Code so the app rides on their existing plan.
- *Check Anthropic's current terms and docs on third-party apps and subscription use before shipping.* Always offer a **fallback to API key** mode. Keep the runner behind an `AgentRunner` interface so the backend can change.
- Parse events into UI rows (tool use, text, results). Capture token usage → compute **API-equivalent cost** for display.
- Settings: **model** (e.g., Opus-class for visual/spatial work, Sonnet-class to save cost), **effort level**, per-routine overrides.
- **Stop** kills the process; **Queue** stores messages and runs them sequentially.
- **Resumable:** persist `{sessionId, jobId, stage, lastCheckpoint}` in SQLite. After app relaunch (including when Claude Code auto-updates and the app restarts), resume the session and prompt: "Continue from checkpoint; do not redo completed shots."

**Safety**
- Restrict file access to the project folder + app MCP tools. No arbitrary network except through app tools (`web_search`, `fetch_url`, asset fetchers).
- Wrap every applied edit in a **git commit** (`edit: <short prompt>`); store commit hash on the edit record so **Revert** = `git revert`.

**Generated `CLAUDE.md` per project (rebuilt before each run)** contains:
1. Style guide of the selected style (look, camera rules, color rules, text legibility rules).
2. Scene API contract (Section 10).
3. Tool list and when to use each.
4. Global + project memory rules.
5. Verification checklist (Section 10.4).
6. Output conventions (file names, chapter modules, how to log assets).
7. Editorial rules (label reconstructions/speculation, paraphrase quotes, record sources).

**App MCP server — tools exposed to the agent**
| Tool | Purpose |
|---|---|
| `get_words(start,end)` | Word timings for a time/word range |
| `get_storyboard()` / `update_storyboard(patch)` | Read/modify shots |
| `render_frames(times[], size)` | Headless-render frames → PNG paths (returned as images to the agent) |
| `check_preview()` | Load scene in headless runtime; return JS errors, warnings, perf, asset load failures |
| `list_assets()` / `search_assets(query,type)` | Local + online assets (Section 12) |
| `fetch_model(url|id)` / `fetch_photo(url|id)` / `fetch_map(bbox|place, zoom)` | Download, normalize, license-record, cache |
| `measure_layout(shotId,t)` | Text overflow / off-screen / overlap detection |
| `audio_loudness()` | LUFS, peak, voice-to-bed ratio |
| `set_ambience(blocks)` / `set_music(cues)` / `set_sfx(cues)` | Sound design |
| `web_search(q)` / `fetch_url(u)` | Research (or use Claude Code's built-ins) |
| `save_memory_rule(text, scope)` | Add rule (only on user confirmation) |

**Edit scopes → prompt framing**
- *Selection*: "Edit only object `{name}` at `{file}:{line}` in shot `{id}` at t=`{t}`."
- *Shot*: "Edit only shot `{id}`; keep timings and neighbors unchanged."
- *Whole video*: "Apply across all shots; verify visually on a sample of affected shots; report what changed."
After every edit the agent must run `check_preview()` and `render_frames()` on affected shots before finishing.

### 8.1 Model and effort policy
- **Per-task model and effort** settings (research/script · build · edit · UltraEdit · QA agent), with an app-level default and a per-routine override. Never hard-code model names.
- **Defaults:** frontier model for research, script, build and edit. UltraEdit always uses the strongest configured model and shows "switched to <model>" in the log.
- **What testing showed (build these into UI guidance):**
  - The frontier model has the best spatial and visual understanding, needs the fewest fix loops, and is often cheaper overall because it fixes issues in one shot.
  - A mid-tier model is faster and good at gathering real assets but needs more manual iteration (character animation, layout).
  - The smallest model is cheapest but may ignore instructions, leave problems (invisible characters, wrong shot lengths, skipped passes) and needs UltraEdit to reach good quality. Orchestrating a small model with a large one used far more tokens in one test, so do not default to it.
  - When a user picks a smaller model, show a banner: "Expect to use UltraEdit on weaker shots."
- **Effort is not quality.** Higher effort mostly spends more time on the same issues; explicit instructions to render, inspect and fix are what improve results. So the base prompts the app writes always include verification instructions at every effort level.

### 8.2 Quality tiers (mapping the Build slider to behavior)
| Tier | Behavior |
|---|---|
| Standard | One build pass, per-shot visual verification at a light sample. Must be postable with no direction. |
| More depth | More assets, props, scenes, and web assets per scene. |
| Polished | Secondary motion, easing polish, richer lighting and layering. |
| Verified | Adds the verification layer: full-resolution frames, zoomed crops of small regions, fix, re-check, until the checklist passes. |
| Ultra | Verified plus UltraEdit across every shot. |
Routine nodes expose the same tiers. Internally, when a tier asks for extra detail, each prop or asset is built, rendered, inspected and refined for several rounds (often 10–20 for complex assets) before it is placed in a scene.

### 8.3 UltraEdit
- **Trigger:** one shot, many selected shots, or the whole video (Ultra tier). Optional instruction text; with none, the prompt is simply "make this shot look excellent and fix whatever is off".
- **Per-shot procedure:** (1) render full-resolution stills at start, middle, end and each cue point; (2) inspect each still and list defects and missed opportunities (placeholder characters, flat lighting, missing detail, floating or clipping objects, unreadable text); (3) rewrite the shot code to fix and enrich it (animated characters, accurate models, particles, depth layers, lighting, camera work); (4) re-render and compare to the before frames; (5) loop until the checklist passes or a round limit is reached; (6) save Before/After clips and commit.
- Shots can run in parallel up to the concurrency limit. Each run reports time and cost per shot.
- Performance reference: ten complex shots in about 10 minutes with the frontier model; a small model at extra-high effort needed about 50 minutes for six shots.

### 8.4 Vision-only QA agent
A separate agent that **cannot see the source code**. It receives only rendered frames (plus the narration text for each frame's time and the checklist) and returns a list of issues. The builder agent fixes them; loop for N rounds. This agent powers the **Quality check** routine node and the Verified tier, and it prevents the builder from "explaining away" problems it caused.

### 8.5 Cost and context tracking
- Show per-run duration, tokens and **API-equivalent cost**, plus totals on Home (Section 7.1) and a per-stage breakdown on click.
- Show a **context meter** for the active session and compact automatically at a configurable threshold (default around 400k tokens).
- If the runner exposes plan or usage-limit information, show it as a best-effort indicator; never block on it.

### 8.6 Provider-agnostic agent runtime (Claude, ChatGPT subscription, free and local)

**Goals:** (1) work with whatever AI subscription the user already has; (2) never be locked to one vendor; (3) degrade gracefully with weaker or free models and be honest about the quality difference.

#### 8.6.1 Adapters
| Adapter | Auth / billing | How it runs | Notes |
|---|---|---|---|
| **Claude Code** | Claude subscription or API key | Spawn the official CLI headless with streaming events | Reference implementation (Section 8). |
| **Codex CLI** | **"Sign in with ChatGPT"** (plan allowance) or an OpenAI API key | Spawn the official Codex CLI in non-interactive mode with machine-readable (JSON) events; register the app's MCP tool server in its config; run with the working directory and sandbox limited to the project folder | **Which ChatGPT plans (including Free) include Codex changes over time and sources disagree. Detect it at runtime (8.6.2); never hard-code it.** |
| **Open runner** | API key for any OpenAI-compatible provider (including free-tier keys where a provider offers them) or a **local model** (Ollama / LM Studio / llama.cpp) | Embed an existing open-source agent runner (e.g., OpenCode) **or** implement a minimal built-in tool-calling loop: read/write/edit files inside the project, restricted shell, plus the app's MCP tools | The path for free tiers and local models. |

**Hard rules**
- Use subscriptions **only by launching the official CLI**. Do not read the CLIs' stored auth/token files, do not proxy their sign-in, and do not call undocumented subscription backends. Those routes are unsupported, can break without notice, and may violate the provider's terms.
- Always offer an **API-key fallback** for every provider.
- Provider terms, plan inclusions and free tiers change frequently. Keep a **remotely updatable `providers.json`** (known facts, links, default models) with a local override, and keep all such facts out of the code.

#### 8.6.2 Runtime availability detection
On launch and on **Test connection**, each adapter's `detect()` reports: CLI installed and version · signed in · auth mode (subscription or key) · plan name if exposed · model list · limit information if exposed. Then run a one-prompt **smoke test**. The Connections page shows the result in plain language ("Signed in with ChatGPT Plus; Codex available", "Signed in, but Codex isn't included on this plan — add an API key or use another provider"). If a provider is unavailable, the app proposes the next-best option instead of failing.

#### 8.6.3 Interface and normalized events
```ts
interface AgentRunner {
  id: 'claude-code' | 'codex' | 'open-runner';
  detect(): Promise<Availability>;          // installed, signedIn, authMode, plan?, models[], limits?
  capabilities(model: string): Capability;
  start(job: AgentJob): AgentSession;       // cwd, prompt, guide, mcpTools, model, effort, abortSignal
}
interface AgentSession {
  events: AsyncIterable<AgentEvent>;        // text | tool_use | tool_result | image | usage | limit_hit | error | done
  resume(checkpoint: Checkpoint): void;
  stop(): void;
}
type Capability = {
  vision: boolean; toolUse: boolean; contextTokens: number;
  speed: 'slow' | 'mid' | 'fast';
  billing: 'subscription' | 'metered' | 'free-limited' | 'local';
  tier: 'A' | 'B' | 'C';
};
```
The Chat panel, cost tracker, resume logic, edit/revert and routines consume only these normalized events, so every provider gets identical UX.

#### 8.6.4 Provider-neutral project guide and tools
- Generate one canonical `AGENT_GUIDE.md` per project (style guide, scene API, rules, checklist). Also write `CLAUDE.md` and `AGENTS.md` so each CLI auto-loads the same content. The open runner injects it as the system prompt.
- Expose **all app tools through MCP** (`render_frames`, `check_preview`, `get_words`, `measure_layout`, asset tools, `web_search`, `fetch_url`, …) so every adapter sees the same toolset. For runners without MCP, wrap the same tools as function-calling in the built-in loop.
- Provide the app's own **`web_search` / `fetch_url` tools** (backed by a configurable search provider) so research works on any model, even when the provider has no built-in search.
- Keep a provider-neutral **prompt core** plus small versioned **dialect overlays** per provider (tool naming, formatting, instruction style).

#### 8.6.5 Capability calibration and tiers
When a model is first connected (or on demand), run a 1–2 minute **calibration**: (1) a tool-call test; (2) an image-understanding test on a rendered frame with known defects (overlapping text, a floating object, a blank corner) where the model must list the defects; (3) write a tiny scene module that passes `check_preview`; (4) an instruction-following / structured-output test. Assign a tier:
- **Tier A** — vision + reliable tools + strong code. Everything is available: all quality tiers and UltraEdit.
- **Tier B** — capable but weaker. Standard / More depth / Verified, per-shot task sizes; suggest UltraEdit on weak shots using a Tier A model if one is configured.
- **Tier C** — weak, no vision, small context, or slow (typical for small local models). Runs in **Lite mode**.
Store results with the model name and date, and re-test when the model changes.

#### 8.6.6 Graceful degradation ("Lite mode")
- **No vision →** replace visual inspection with programmatic verifiers: scene-graph introspection (bounding boxes, off-screen and overlap tests), raycast occlusion tests for cards and overlays, penetration/collision tests, text-fit measurement, contrast calculations, a blank / low-variance frame detector, shot-length rules, and pixel-diff against the previous build. Optionally route frame inspection to a vision-capable model through the **role router** (e.g., a different provider's model or a local vision model).
- **Weaker coding ability →** smaller work units (one shot per call); a **declarative scene schema** (JSON describing objects, animations, cards and cues, compiled by the style runtime) instead of free-form scene code; rely on the style kit's prebuilt components; strict validators with automatic retry and error feedback; Standard tier by default; fewer simultaneous elements.
- **Small context →** per-shot prompts containing only the narration slice, a storyboard excerpt and the relevant part of the style guide; never whole-video context.
- **Research and script →** the fact-check step cannot be skipped. If the model is weak, mark the script **"needs human review"** with a list of unverified claims.
- **Honest UX:** show a banner in Lite mode ("Expect simpler visuals and more manual fixes") and suggest upgrades (stronger model for script or UltraEdit).

#### 8.6.7 Role router (mix and match)
Roles: *Research/Script · Storyboard · Build · Edit · UltraEdit · QA vision · Thumbnail helper · Title & description*. Each role maps to a provider + model + effort. Presets: **All Claude · All ChatGPT · Hybrid** (e.g., research on one provider, build on another) **· Zero-cost**. Optional per-role **fallback chain**; the app switches providers mid-build only with user opt-in and only at checkpoint boundaries (shot or chapter), and records which provider built which shot.

#### 8.6.8 Quota-aware execution (subscriptions and free tiers have rolling limits)
- Treat `limit_hit` / rate-limit errors as a normal state: persist the checkpoint, pause the job, show "Limit reached — resuming at HH:MM" when the reset time is known, otherwise retry with capped exponential backoff.
- Other providers' jobs keep running meanwhile.
- **Slow / overnight mode:** throttle work to stay under limits. Estimate how many shots or videos an allowance supports from measured tokens per shot.
- **Shared allowances:** warn that a plan's allowance may be shared with the user's regular chats and other tools, and recommend a lower concurrency.
- Routines respect per-provider hard limits and pause cleanly when the allowance is exhausted.

#### 8.6.9 Cost display by billing mode
Subscription → tokens + an API-equivalent estimate (when a price table exists) + window usage if exposed. Metered → real currency. Free-limited → tokens and remaining quota. Local → tokens and time only.

#### 8.6.10 Zero-cost mode (the free path)
A preset that wires: local transcription (Whisper) · local TTS · a local LLM (Ollama / LM Studio) and/or a free-tier API key if the user has one (availability varies; check at runtime) · the app's search tool · local diffusion or agent-drawn graphics for image needs · **Standard** tier · Lite mode defaults · shorter videos recommended (about 1–5 minutes). The hardware profiler shows which local models fit the machine. Be honest in the UI: results will be simpler than with a frontier model, and offer a one-click way to bring a stronger model into specific roles (e.g., script or UltraEdit).

#### 8.6.11 Regression suite per provider
Keep golden test projects (a 1-minute script + audio). Run them against every adapter and model in CI and before prompt changes. Track: scene errors, checklist pass rate, time, tokens, and tier. Surface results in a small "provider quality" table in the docs and in Connections.

---

## 9. Voiceover and audio pipeline

- **Providers:** ElevenLabs, Fish Audio, local TTS (free), and "My recording". Chunk long scripts, stitch with consistent loudness, retry failures. Surface known limitations clearly (e.g., "cloned voices unsupported by this provider route").
- **Tip to surface in UI:** TTS speed varies; if estimated duration is short, recommend a longer target length. Show actual audio duration vs. target.
- **Clean audio (ffmpeg):** high-pass, denoise (afftdn/RNNoise), de-ess (light), compressor, `loudnorm` to ~−16 LUFS (YouTube-friendly), true-peak limit.
- **Time the words:** local Whisper with word timestamps → `words.json`. Optional forced alignment to `script.txt` to correct mis-hearings. Validate monotonic timestamps, gaps, coverage.
- **Sound design:** ambience beds per scene type (labeled blocks with level in dB), optional royalty-free music with sidechain ducking under voice, SFX on cues (impact, whoosh, UI ticks). Produce a **mix report** (e.g., "voice is X dB above bed"). Master to the same loudness target.

### 9.1 v2 additions
- **Hardware profiler (first launch):** detect OS, CPU/GPU and VRAM, RAM. Pick and download the best local transcription model and local TTS model for that machine (balance accuracy and speed). Benchmark and store the profile. Reference speed: a 20-minute narration timed in roughly 15 seconds on a high-end consumer GPU, and typically 10–30 seconds for shorter files.
- **TTS pacing calibration:** store measured words-per-minute for every provider + voice. Use it when sizing the script. Show *target length vs actual audio length* and warn when the audio is much shorter than the target (text-to-speech often finishes faster than the script's estimate). Recommend setting a longer target, and show a hint when the result is near an important threshold (e.g., 8 minutes for mid-roll ads).
- **Provider notes:** keep ElevenLabs, Fish Audio (a cheaper API option), Local voice (free), and My recording. Add an optional **Gemini-style TTS provider via API key** because many people produce free or cheap voiceovers with large voice libraries; check the provider's current limits and terms before relying on it. Handle provider limitations explicitly (e.g., "cloned voices unsupported by this route").
- **Multilingual:** voice list, transcription model and script style per language (24+).
- **Sound design is procedural where possible:** synthesize ambience beds, SFX and light musical beds offline with Web Audio / DSP, per scene type. This avoids third-party music licensing. Styles can ship their own SFX sets (e.g., Flat explainer). Add a **mix report** with voice-to-bed ratio and loudness.

---

## 10. Scene engine and style packs

### 10.1 Style pack format and built-in styles
```
styles/<styleId>/
  manifest.json      # name, description, looks[], param schema, formats (16:9, 9:16)
  STYLE_GUIDE.md     # injected into CLAUDE.md (the "hand-built quality" lives here)
  runtime/           # JS kit: helpers, materials, camera rigs, text cards, transitions, SFX
  previews/          # hover-preview media
  examples/          # reference scene modules the agent can imitate
```
**Principle:** every built-in style is a hand-tuned *blank canvas*. With zero direction it must already produce a postable video. The per-build *Direction* layers on top (expand palette, add real footage, etc.). Users can duplicate a built-in style and fine-tune parameters.

Build in this order (simplest first):
1. **MS Paint stick figures** — big-head stick figures, funny history/science, a new picture every ~2–3 seconds, real web images mixed in.
   - Backgrounds, props and effects are drawn **procedurally by the agent** (SVG/canvas) so nothing needs per-frame image generation.
   - Only the **stick-figure character sprites** use a cheap image-generation API. Generate each once, reuse throughout the video, optionally with a few variants. Cache them in a workspace asset library (Section 12) so later videos get cheaper.
   - Never put the same character twice on screen unless intended; an element-level "make a completely different variation of this character" regenerates one sprite in under a minute.
   - Target cost: a 10–15 minute video well under 1% of a weekly plan allowance, plus a small image-API cost for sprites.
2. **Flat explainer** — bright flat-vector science/finance explainers, 9:16 or 16:9, optimized for Shorts but fine for long-form. Runs entirely on Claude (no external API).
   - **Properly rigged characters** with idle animations (rigging needs dedicated guidance and examples in the style guide).
   - Character studio (Section 7.7), built-in SFX, lighting/shading that can be improved per shot.
3. **Pixel art** — Three.js scenes rendered at **640×360** internally and upscaled ("Crisp 640" look; a heavier look may exist). Default **limited 16-color palette**; directions can expand the palette, contrast, outlines and internal resolution for readability. Supports real screenshots, GIFs, video cards and "footage inside the TV" camera push-in transitions.
4. **Vox** — newspaper cut-out collage on one broadsheet page. Needs a **diffusion image model** for authentic cut-out images (fallback to JS-drawn images is weaker). Budget roughly US$0.50 of image generation for a 2-minute video. Scripts should end with a loop back to the hook.
5. **3D reconstruction** — matte clay 3D, documentary reconstructions of real events with real maps, real photos/footage, real 3D models from the web, timestamp/location cards, a "RECONSTRUCTION" tag, and shared diorama modules per chapter (ship module, bridge module, engine-room cutaway, electrical one-line diagram, people). Runs on Claude only; web 3D models, maps and photos are fetched.

**Custom styles** (premium) are trained from reference videos/images (Section 11).

### 10.2 Scene module contract (JavaScript ES modules, deterministic)
```js
// scenes/c03_ship.js
export const shots = {
  s014: {
    duration: 6.4,                       // seconds (from storyboard)
    assets: ['models/container_ship.glb', 'maps/baltimore.png'],
    setup(ctx) {                         // build objects once; tag every object with userData.src
      const ship = ctx.models.get('container_ship'); ship.userData.src = { name:'ship' };
      ctx.scene.add(ship);
      return { ship };                   // state handle
    },
    update(t, ctx, state) {              // PURE function of t (0..duration). No Date.now/Math.random.
      state.ship.position.x = ctx.ease.inOutCubic(t / 6.4) * 40;
      ctx.camera.rig.orbit({ target: state.ship, t, radius: 30 });
    },
    cards: [{ t: 0.4, dur: 3, text: '01:29 · 26 MARCH 2024' }]
  }
};
```
`ctx` provides: `THREE`, `scene`, `camera` (+ rigs), `models`, `photos`, `maps`, `ease`, `rng(seed)`, `text` (cards, labels, lower thirds), `fx` (particles, debris, water, smoke), `words` (timings), `markers`.

### 10.3 Player runtime
- A page that loads the style runtime + scene modules, owns the **master clock** = narration audio element time; supports play/pause/seek/speed; handles **hot reload** on file changes; shows an error overlay and reports errors to the host.
- Cross-shot transitions, per-shot cameras, global look (color grade, vignette, grain) by style.
- Mouse picking for click-to-select.

### 10.4 Verification checklist (agent must apply and report)
- No scene/JS errors; all assets load.
- Frames render non-blank; subject visible and framed.
- No z-fighting (coplanar faces), no floating/disconnected parts, no interpenetrating geometry (collisions between actors), correct scale and relative size.
- Text is legible at phone size (min size/contrast), nothing cut off.
- **Visual lands on its spoken word** (cue timing within ±0.3s).
- Continuity across shots (same objects look the same; consistent colors).
- Layout metrics via `measure_layout`.
- Speculative/"what-if" shots are visibly labeled.

**v2 additions to the checklist**
- Cards, labels and overlays must not cover key content (occlusion check on frames); card text must fit inside its box (auto-shrink or widen the card).
- During **full-screen B-roll**, suppress competing on-screen text.
- Visual density: flag frames with "too much going on" and simplify.
- Props must not clip into floors or each other (e.g., a console glitched into the ground); characters that matter to the story must be visible (if six climbers are narrated, all six are visible).
- No ghost or outline artifacts floating off platforms; correct models instead of placeholders (e.g., a helicopter must look like a helicopter, not a stand-in).
- Shot length sanity: flag shots that run far longer than the style norm (e.g., 28 s average where 4–8 s is expected for 3D reconstruction).
- Confirm that the second consecutive-frame verification pass actually ran.
- In Paint style: do not repeat the same character in adjacent shots unless intended.

### 10.5 Build orchestration (stage 6)
1. Storyboard: split narration into shots by meaning + word timing; assign chapter modules; plan assets and shared modules per chapter.
2. Build shared modules (kit pieces) first, verify them in isolation.
3. Build chapters sequentially; after each chapter, render sample frames, fix, commit, checkpoint.
4. If *Extra depth* → more props/assets/camera moves. If *Higher attention to detail/animation* → secondary motion, particles, easing polish. If *Extra verification* → additional full-video QA pass(es) using the checklist and sampled frames.
5. Quality check pass (also available as a routine node): layout < 0 overflow, length within ±25% of target, no blank shots, no scene errors; the agent fixes what it finds.

---

## 11. Custom style training (premium)
Let the user create a style by: uploading reference videos/images + a short description → agent proposes a `STYLE_GUIDE.md`, a minimal runtime kit, and 3 sample scenes → user iterates in the editor → save as a style pack. Start with "Duplicate built-in and edit" before building full training.

Inputs: reference **videos and images** plus a description. The agent extracts keyframes, derives palette/typography/motion rules, writes `STYLE_GUIDE.md`, builds a minimal runtime kit and 3 sample scenes, then iterates with the user in the editor. Ship "duplicate and edit a built-in" first, full training later.

---

## 12. Real assets: photos, footage, 3D models, maps

**Providers behind interfaces:** Wikimedia Commons, NASA, Library of Congress, Smithsonian Open Access, Internet Archive, 3D model libraries with open licenses (e.g., Sketchfab downloadable CC models, Poly Pizza, Smithsonian 3D, NASA 3D resources), OpenStreetMap-derived data and map tiles from providers whose terms allow this use.

**Rules**
- Record for each asset: source URL, author, license, attribution text, retrieval date → `ATTRIBUTIONS.json`.
- Only auto-use assets with licenses that allow the intended use (CC0, CC-BY, public domain, etc.). Block or flag NC/ND/unknown.
- Auto-generate an **attribution block** for the video description from `ATTRIBUTIONS.json`.
- Respect each provider's API terms and rate limits; cache locally.
- Convert models to optimized `.glb`, normalize scale/orientation, generate low-poly fallbacks.
- "Photos per minute" (0–4) controls how often real photos/footage cards appear.
- Never present reconstructed visuals as real footage.

### 12.1 v2 additions
- **Media types:** images, screenshots, covers, GIFs, video clips and gameplay/B-roll footage, 3D models, maps. Process: *find → download → visually verify it is what you think → trim → place* as a card or inside the scene (e.g., footage playing on a TV, camera pushes in to full screen).
- **Workspace asset library:** sprites, characters and 3D models are stored once and **reused across projects** (hash-deduplicated). Reuse is what makes later videos cheaper.
- **Editorial / third-party media setting.** Using copyrighted screenshots, footage or images can result in claims or takedowns. Fair use is a case-by-case legal defense, not a guarantee. Provide a per-channel setting: *Safe sources only* (open licenses, public domain, user-owned) or *Editorial media allowed* (requires an explicit acknowledgement). In both modes record the source of every asset in `ATTRIBUTIONS.json` and let the user review assets before export.

---

## 13. Thumbnails module

- **Boards:** one *Master* board + one board per video (board switcher dropdown showing items and last edited).
- **Canvas mode:** infinite canvas with **Image nodes** (drag/drop, paste URLs), **Prompt nodes**, **Text nodes**. Connect image → prompt to use as `@img1`, `@img2` references. Shortcuts: drag to pan, Alt+scroll/pinch zoom, Shift-drag select, Alt-drag copy, drag from dot to connect.
- **Prompt mode:** simple list layout alternative.
- Prompt node controls: model dropdown, aspect ratio (default 16:9), resolution (e.g., 2K), **Generate**. Results appear next to the node; **Use as thumbnail** assigns it to the project.
- **Style key helper:** a built-in Claude action that analyzes reference thumbnails and outputs (a) an aesthetic breakdown (environment, figures, color code, camera, light, background, story) and (b) a reusable **global style key** paragraph appended to prompts; plus "give me 3 prompts for topic X". Store the key per channel.
- Provider API key stored in settings; show cost per generation.

### 13.1 v2 additions
- **Prompt craft built into helpers:** describe composition and render style instead of writing the literal word "thumbnail" (it tends to produce cheesy glows). Useful building blocks: "high-end 3D render, tasteful color grade, high contrast, no glow, strong soft drop shadow, separation between layers, fully white bold text centered behind the foreground object". Keep compositions simple and readable.
- **Workflow:** collect references (reference thumbnails, real photos of the subject) → prompt node with `@img` references → batch 2–3 generations → send a screenshot to Claude with a critique to fix the prompt → iterate → **Use as thumbnail**. Keep alternates attached to the project so they can be swapped later.
- **Boards:** each project has a board plus a **Master board** for reusing prompt nodes (Alt-drag to duplicate).
- **Real references in routines:** the Thumbnail node can fetch real reference images (e.g., the subject, game footage frames) and compose them into the design.
- **Swap, don't A/B:** if click-through rate is poor after enough impressions, suggest swapping to an alternate thumbnail (if the analytics API exposes the metric) instead of running platform A/B tests, which can throttle small channels.

### 13.2 Image providers (v3)
Image generation sits behind a provider interface with: aggregator APIs (key-based), direct provider APIs, and **local diffusion (ComfyUI / Stable Diffusion)** for the free path. When no image provider is configured, styles must fall back to agent-drawn graphics (Paint sprites, Vox cut-outs, thumbnails) and clearly label the quality limit.

---

## 14. Routines (autopilot) — node graph executor

**UI:** React Flow canvas. Toolbar: Import / Export (JSON) / Demo (simulated run with speed multiplier) / **Run**. Bottom bar: Add node, zoom, fit. Each node shows icon, title, one-line summary, status ring (idle / glowing when running / ✓ / ⚠), duration, and last-run result line. Right panel: **Routine settings**. Bottom: **Runs** history (finished date, status, per-node results, cost).

**Templates:** *Full channel autopilot* (below) + blank.

**Node types (in default order)**
| Node | Config | Behavior |
|---|---|---|
| **Schedule** | on/off; daily at time / selected weekdays / every N hours | Triggers run while app is open (optional tray/login-item mode) |
| **Topic finder** (AI) | channels to study (paste URLs; list their public videos; select all or latest N), "videos go to channel", new topics per run, extra notes | Studies referenced channels' topics/titles/thumbnails/style, researches the web, picks topics they haven't covered, dedupes against existing projects |
| **Create project** | style, look, length, language, real photos & footage (+frequency up to 4/min), use 3D models from web, real maps (style-specific options) | Creates project from topic |
| **Write script** | writing mode (Balanced / Deep research / Fact-checked / Fast draft / Human & conversational), length tolerance | Runs Section 6 |
| **Script rules** | verification step; "Claude fixes problems" | Validates against rules |
| **Voiceover** | Auto / ElevenLabs / Fish / Local, voice | Generates audio, cleans, times words |
| **Build video** | same extras as Section 7.5 | Runs build |
| **Quality check** | "Claude fixes problems" | Section 10.5 step 5 |
| **Sound design** | on/off, music/ambience/effects | Section 9 |
| **Render** | Full HD / 4K, captions file on/off | Export |
| **Thumbnail** | AI picture designed by Claude · AI picture from a prompt template (with channel global style key) · frame from video (not recommended) | Runs in parallel with render; learns from the studied channel's thumbnails |
| **Title & description** | channel's title style, N title options, chapters, tags, attributions block | Reverse-engineered from referenced channel style |
| **Approval** | waits for user | Pauses run; opens project folder/editor; Approve / Reject / Edit |
| **Vertical version** (off by default) | crop to fill, captions, end card | Optional Shorts export |
| **Move to stage** | e.g., To Scheduled | Updates channel workflow board |
| **Upload to YouTube** (off by default) | channel, privacy (private default), schedule time | Section 15 |
| **Notify** | OS notification, open exports folder, optional webhook | Final step |

**Routine settings panel**
- **Before it can run (preflight):** list warnings/errors with *Show* links, e.g., "Build video: *Real footage* is on, but this style doesn't use it, so it is skipped." Block run on errors; allow run with warnings.
- **Hard limits:** videos per run (max), videos per day (max), videos at the same time (1/2/3), *when a video fails* → go on with the next / stop the run.
- **Claude for this routine:** model (default "Same as Settings"), effort (default "Same as Settings").

**Executor requirements**
- DAG engine with per-node inputs/outputs saved under the run folder; skip disabled nodes; parallel branches (thumbnail ‖ render).
- Concurrency limits, per-node timeouts, retries with backoff, manual **Retry** after the user fixes an error (e.g., misconfigured voice) so the run continues from that node.
- **Durable:** survives app restart; re-attaches to running agent sessions.
- Run log with cost and duration per node; Demo mode simulates timing at 32× for UI testing.

### 14.1 v2 additions
- **Topic finder** needs no Google sign-in: paste a channel handle and scrape its public video list. Limit to the latest N videos or use all. "Extra notes" holds the niche prompt (the same prompt the user would have typed into Claude). Include "do online research" and "topics per run".
- **Create project node** also sets *Format* (16:9 / 9:16), *Language*, style options and the quality tier.
- **Write script node:** presets Balanced · Deep research · Fact-checked · Fast draft · Human & conversational, free-form notes for Claude, length tolerance ±10%.
- **Script rules node:** required and banned keywords/phrases per niche (e.g., avoid terms that risk flags).
- **Build video node:** the same quality tiers as the Build modal; real-photo toggle and frequency.
- **Quality check node:** runs the **vision-only QA agent** (Section 8.4) and loops with the builder agent.
- **Render node:** Full HD or 4K; a 10-minute video should render in about a minute on strong hardware (Section 18).
- **Vertical version node (reframe):** rebuilds the composition for 9:16 (not a simple crop), can create a **trailer** from the best parts of videos longer than ~2–3 minutes, and burns in captions.
- **Approval node:** if YouTube is connected, approval triggers upload; if not, it opens the folder with video, thumbnail and metadata ready to drag into YouTube.
- **Operational:** scheduled routines only run while the app is open (or in tray mode). Show OS notifications while routines run. Several routines can run at once subject to the concurrency setting; on weaker machines, stagger schedules. Expect a mini-PC rack scenario: allow headless/tray mode and sleep prevention.

---

## 15. Channels and YouTube integration

- Google OAuth (desktop loopback flow). Store tokens securely.
- **Upload:** resumable upload via Data API, title/description/tags/chapters, thumbnail via `thumbnails.set`, privacy, scheduled `publishAt`. Set the "altered or synthetic content" disclosure field where the API supports it and where content qualifies.
- **Quota & approval:** uploads consume substantial daily quota; implement quota tracking and queueing. Note that API projects that haven't passed Google's audit may have uploads forced private — plan an audit step and document it for users.
- Read-only features: list a channel's public videos (for Topic finder), basic analytics.
- Respect YouTube policies on repetitive/mass-produced content: the **Approval** node should remain the default and users should be encouraged to review each video. Do not build features meant to evade platform detection.

### 15.1 v2 additions
- **Channel workflow board** columns: *Building → Review → Ready → Scheduled → Published*. Projects move automatically as pipeline stages complete and when upload succeeds. Projects list filters by channel and by Draft / Editing / Ready.
- **Analytics view:** connect a channel through the Data/Analytics APIs and show real-time stats, per-video retention graph, average view duration and revenue-related metrics where the API allows.
- **Learning loop:** read retention graphs and **relevant comments** (suggestions for improvement, questions, complaints). Summarize into "what to do differently next time" suggestions, and (with user approval) turn them into script rules, memory rules or topic-finder notes. Always show the evidence behind each suggestion.
- **Upload settings:** title, description, tags, chapters, thumbnail, privacy (default private/unlisted until the user releases), schedule time, language, category, the "made for kids" declaration, and the synthetic/altered-content disclosure where applicable. Monetization toggles may not be available through the public API; deep-link to the Studio page when needed.

---

## 16. Licensing and business layer (optional, do last)
- Local license-key activation (offline-tolerant) with feature flags. Example tiering to support: **Standard** (core styles, limited monthly exports) vs **Premium** (routines, custom styles and characters, 4K export, vertical/9:16 export, multilingual support, YouTube connection and analytics, unlimited exports).
- Auto-update channel, crash reporting (opt-in), telemetry (opt-in, anonymous).

---

## 17. Build phases and acceptance criteria

**Phase 0 — Skeleton**
Electron + React shell, sidebar with Faceless/Personal mode switcher (Personal can be a stub), workspace folder picker, SQLite, Projects grid with filters, New project modal, per-project git init, Settings, API-key vault.
✔ Create/duplicate/delete/import-zip a project; each is a git repo.

**Phase 1 — Script + audio + hardware profile**
`AgentRunner` interface + **Claude Code and Codex CLI adapters** + Connections page with detect/smoke test (streaming normalized events → UI log), script engine (Section 6 incl. direction, rules, framing check), Script modal, Voiceover modal (My recording first), ffmpeg clean, hardware profiler, local Whisper word timing, TTS pacing calibration.
✔ Topic → `script.txt` + `research.md` with sources; drop a WAV → `clean.wav` + `words.json` in under about a minute for a 15-minute file on a decent machine.

**Phase 2 — Player + timeline (manual authoring)**
Player runtime, scene contract, one simple style (**MS Paint stick figures** without the image API: agent-drawn sprites), shots panel, timeline tracks, scrubbing with sound, hot reload.
✔ A hand-written 3-shot project plays in sync; scrubbing is smooth; errors show in an overlay.

**Phase 3 — Agent builds scenes + verification + edit loop**
MCP tools (`render_frames`, `check_preview`, `get_words`, `measure_layout`), generated `CLAUDE.md`, storyboard stage, chapter build orchestration, quality tiers Standard and Verified, vision-only QA agent, **UltraEdit**, Chat panel (log rows, frame thumbnails, queue, stop, scopes, context chip, before/after), review notes, token/cost breakdown, resumable jobs, click-to-select, review-while-building.
✔ From script + voiceover, the agent builds a full 3–5 minute video with zero scene errors; "fix this element/shot/whole video" and UltraEdit work and are revertible; completed shots are scrubbable during the build.

**Phase 3b — Provider portability (before Phase 4)**
Open runner (OpenCode-style or built-in loop), local-model support (Ollama/LM Studio), capability calibration and A/B/C tiers, **Lite mode** (programmatic verifiers, declarative scene schema, per-shot task sizes), role router and presets, quota-aware pause/resume, per-provider cost display, per-provider regression suite, Zero-cost preset.
✔ The same 3-minute project builds on (a) Claude Code, (b) Codex with ChatGPT sign-in (on a plan that includes it), and (c) Zero-cost mode with a local model — the last at visibly lower fidelity but with **zero scene errors** and a working export. Hitting a usage limit pauses and resumes the job without losing work.

**Phase 4 — Real assets + 3D reconstruction style**
Asset providers, license ledger, workspace asset library, model normalization, map fetch, photo/GIF/video cards, 3D reconstruction style kit (diorama modules, cards, camera rigs, watermark tag), the Polished tier.
✔ A 5-minute reconstruction of a well-documented event with at least 5 web 3D models, real map, real photos, and a complete `ATTRIBUTIONS.json`.

**Phase 5 — Sound + export**
Procedural ambience/SFX/music beds, mix report, deterministic headless export, Full HD + 4K, ETA, Renders page, captions, 9:16.
✔ Audio/video in sync; re-export gives identical frames; export speed meets Section 18 targets.

**Phase 6 — Thumbnails**
Boards, canvas nodes, provider interface, prompt-craft helpers, style-key helper, "Use as thumbnail".
✔ Reference image + prompt → 3 candidates → assign to project.

**Phase 7 — Memory + remaining styles**
Rules (global/project), "Keep this rule?" flow, injection into `CLAUDE.md`; Flat explainer (rigged characters + character studio), Pixel art, Vox (image-API integration), Paint style with image-API sprites and the asset library; duplicate-and-edit custom styles.
✔ A rule saved once prevents the same issue in the next build; each style produces a postable video with no direction.

**Phase 8 — Channels, YouTube, analytics, routines**
Channels + workflow board, OAuth + upload, analytics and comment-learning loop, routine editor, executor, scheduler, preflight, limits, runs history, Approval, Notify, Vertical/trailer node.
✔ "Full channel autopilot" runs unattended: topic → approved package in the exports folder; survives an app restart mid-run.

**Phase 9 — Polish & release**
Installer, auto-update, onboarding, error telemetry (opt-in), docs, license activation.

**Phase 10 — Optional**
Personal Brand mode (talking-head editing, intros), full custom-style training, quick-fix agent running in parallel with builds.

---

## 18. Overall quality bar (definition of done for v1)
- Given only a topic, the app produces a finished video with no scene errors, every narrated moment covered by a relevant visual, readable text, consistent style, and a mix at the target loudness.
- A user can fix any visual issue by clicking it (or choosing a shot / whole video) and describing the fix; the fix applies in about a minute and can be reverted.
- All facts trace to `research.md`; all third-party assets trace to `ATTRIBUTIONS.json`.
- Closing the app mid-build and reopening continues the build.

**Measured reference points to aim for (frontier model, strong consumer hardware)**
| Item | Target |
|---|---|
| Research + script | ~2 min (8–10 min video) to ~6 min (25 min video) |
| Clean audio + word timing | ~10–30 s |
| Build, Standard/Verified tier, 10–12 min video (Pixel art, Paint) | ~20–30 min |
| Build, 20–30 min video with real footage and detailed directions | ~40–55 min (up to ~80 min for a 30-min 3D reconstruction at high quality) |
| Short flat-vector video (30–80 s) | ~12–20 min |
| Vox 1.5-min video | ~15 min |
| Single-element or single-shot fix | ~20–60 s |
| Export speed | 150–240 fps, i.e. about 6× real time or better; 12 min video in under 2 min; 20 min video in ~3 min; 10 min video in ~1 min on very strong hardware |
| Preview | Real-time scrubbing with sound while the build continues |
| Concurrency | Up to 3 builds at once without freezing the UI |

**Provider note:** the timings above are for a Tier A model on strong hardware. Other providers will differ; the app should measure its own tokens-per-shot and time-per-shot per provider and show estimates before a build starts. Every supported provider must pass calibration and receive a tier; Tier C builds must still finish with zero scene errors and a working export.

---

## 19. Things to avoid
- Do not clone another product's name, logo, UI assets, or preview media.
- Do not scrape or use assets whose licenses forbid the intended use; do not claim "fair use" on the user's behalf. Provide the safe-sources mode and the source ledger (Section 12).
- Do not copy competitors' thumbnails, titles or branding verbatim. "Study this channel" must produce **original packaging inspired by patterns**, never reproductions or impersonation.
- Do not fabricate quotes or victims' details; do not present speculation as fact.
- Do not build features designed to evade YouTube or other platform enforcement. Keep the Approval step on by default and encourage human review; mass-produced, low-value content can be demonetized or removed.
- Do not hard-code model names or provider limits; load them from settings so they can change.
- Do not rely on "higher effort" to fix quality; use explicit verification and UltraEdit instead.

- Do not extract, copy, share or proxy subscription tokens, and do not call undocumented subscription endpoints. Launch official CLIs only.
- Do not hard-code which plans or free tiers include which features; detect at runtime and read from `providers.json`.
- Do not promise identical quality on every provider or on the free path; show capability tiers and Lite-mode banners instead.
