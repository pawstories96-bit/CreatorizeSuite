# Reconstruction toolkit integration — 0.3.3

The user-supplied `3D reconstruction/reconstruction-studio` is a standalone code-based production kit. Creatorize adapts its reusable rendering code into the existing **3D reconstruction** style, rather than launching another studio or adding its demo projects.

## In the application

Open a project, choose **Style → Reconstruction look**, select a look, and **Apply to project**. White clay is the forensic interior/cutaway look. Daylight, Golden hour, Dusk, Night and Overcast light full locations. Dark map and Mechanism studio isolate geography or mechanical details. Studio and Investigation remain available for existing projects. A shot's explicit `reconstructionLook` overrides the project look; rendering controls can override preset lighting/effects. A lighting change does not redesign existing geometry. Use the project's build/edit action to replace old basic geometry with a detailed set, specifying the shots and required assemblies.

The AI's build, edit, review and repair instructions now describe the real toolkit API, dimensions, camera framing, geographic conventions, word-timed reveals and evidence requirements. Builds still use the selected provider/model and the existing asset sourcing/quality controls. Missing imported Mixamo bodies still produce an actionable error; the kit does not secretly substitute its own passengers.

## Integrated runtime

- 27 validated `reconstruction3d` builders: airliner, cabin, cockpit, room, car, coaster, train, forest, tree, canopy, stairs, railing, lamp, bench, table, chair, screen prop, phone, crate, cone, barrier, sign, ring, zone, arrow, world map and US map.
- Actual geometry, instanced seats/foliage/track supports, deterministic train motion along a curved track, hinged cockpit doors, geographic route reveals and animated pins. Elements retain ordinary transforms, keyframes, selection and measured geometry in the existing editor.
- Eight toolkit lighting palettes with sky/fog, tone mapping, ambient light, key light, bloom and ambient occlusion adapted to Creatorize's shared renderer. This uses Creatorize's SSAO pipeline, not a second N8AO renderer.
- Offline Natural Earth country outlines and Census state outlines, with named highlights, routes and pins. These are schematic geographic maps; the existing OSM/terrain importer remains separate.
- Full-frame quote, article, statement, stat and chart cards with mandatory source text, optional speaker attribution and verbatim phrase highlights at supplied shot-relative timestamps. Sources are required fields, not an automatic guarantee of factual verification. Charts require increasing x values. Overlong text fails explicitly rather than silently clipping.
- Source footnotes and exact time chips with landscape/portrait placement. Font files are local. Both previews and exports draw these overlays onto the same composite canvas.
- Scene validation bounds dimensions, density, path length and option names; no uploaded executable scene scripts are evaluated. Material/texture ownership is isolated between shots.

## Scope and provenance

The original supplied folder remains intact. Only the necessary source modules, map data and font files are copied into the app, with source attribution and dependency licenses. Original demo projects, generated media, virtual environments, account configuration and standalone launchers are excluded. No new projects are added to the user's workspace.

The kit's separate Python transcription/music tools and alternate HTML scene-registration runtime are not run by Creatorize. Existing narration, alignment, audio mixing, rendering, project history, Mixamo import and asset sourcing remain the app's production pipeline. The imported assemblies are generic procedural geometry, not downloaded historical CAD. The integration does not automatically rebuild the user's existing documentary or certify a full film's factual/visual quality.

## Verification

`node --test tests/*.test.mjs` validates schema, unsupported input, path budgets, source/highlight requirements and existing application behavior.

`node tests/reconstruction-kit.mjs` renders all builders, compares eight looks, checks pixel-exact backward seeking for trains/routes/cards, exercises landscape and portrait evidence layouts and exports a real MP4, then checks its decoded frame count with FFprobe. It uses an isolated `.test-*` workspace.

`node tests/reconstruction-desktop.mjs` exercises the packaged project look selector, real toolkit preview, offline maps and export in an isolated native app workspace.
