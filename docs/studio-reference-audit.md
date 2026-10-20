# Studio reconstruction reference and production audit

Reference: https://www.youtube.com/watch?v=CHEDAIg6z28 (Reconstructed, The Six Flags Coaster That Ejected a Rider, 16:58).

Reviewed the complete timed English transcript and the complete visual timeline at five-second intervals on 16 October 2026. This is a style analysis, not verification of the video's factual allegations or a claim of uninterrupted playback. The reference's story, artwork and branding are not application assets.

## Visual direction

- 00:00-00:45: aerial establishing geography, tracking train, rider point of view and station. Ground, trees, buildings and a sky extend beyond the frame. Persistent world layout gives the viewer a sense of place.
- 01:45-02:45: station interior, side view of seated white faceless people, then an isolated dark technical cutaway of the restraint. Human figures have natural proportions and bent knees; they are not flat icons or capsule toys.
- 02:55-03:40: lift, rider perspective, banked turn and train close-up. The event moves through the world; camera motion serves the explanation.
- 04:28-05:34: sponsor section. Excluded from product requirements.
- 05:35-06:45: return to a consistent lift and station environment. Reused geometry is more useful than rebuilding a new scene for every sentence.
- 07:10-08:10: archival footage and documents appear as separate editorial cuts, rather than covering every 3D shot.
- 08:25-10:40: restraint close-ups, a consistent second station and control-panel detail. Tight shots explain a specific mechanism.
- 11:30-12:15: day/night establishing and inspection. Motivated lighting and atmospheric depth create variety.
- 14:00-15:45: wide world, tracking, station and repeated technical restraint shots. The same assemblies remain recognizable across camera changes.
- 16:05-16:58: queue and moving train with white faceless figures. Most reconstruction shots contain little or no text, apart from a quiet factual label.

The reference alone cannot establish whether any particular model was downloaded, built by hand, or purchased. Public CC0 library models can supply environment props; distinctive machinery still requires subject-specific geometry and source checks. A generic cargo ship must not be described as an exact Dali replica.

## Existing project evidence

Read-only snapshot of the user's Baltimore project, ID 4e407aa7-4438-430e-8d15-ba78bd4aa6c0, while its original build was running. At the snapshot it contained 42 planned shots and eight built shots. All eight used procedural primitives and overlays; none referenced an imported 3D model. The attribution ledger was empty. The retained build log contained no search_models or download_model calls.

The first four shots were rendered from an isolated copy. They showed a grey tabletop world, a water slab, heavy diagram/date overlays, repeated reconstruction labels and flat worker icons. The original Studio prompt explicitly requested white-clay dioramas. Model retrieval was optional, the asset manifest was captured only once at job start, and independent visual review ran only after the entire video had built.

## Implemented acceptance requirements

1. Plan shared physical sets, shot-specific camera/action and real model searches before Studio scene generation.
2. Resolve real models from official Kenney and Poly Haven catalogs. Import geometry and textures into self-contained GLBs, measure native bounds, save license/source records and hashes, and expose actual scene usage in Assets.
3. Do not silently report web asset use when no model was acquired. An explicit procedural-only choice remains available for bespoke-only work.
4. Require planned models in applicable environment shots. Limit ordinary environment shots to two labels and reject flat character icons.
5. Share the first accepted environment across subsequent shots, with explicit geometry patches and camera changes. Preserve ordinary full scene JSON for editing/export.
6. Support actual exterior skies in reflections, wider environmental shadow coverage, lens selection, eased camera/target movement and anatomically articulated white figures.
7. Run independent start/middle/end visual review for each Verified shot before advancing. Review world completeness, human poses, subject visibility and overlay clutter as well as clipping/readability.
8. Allow the current shot to be built first for review, with model choices and usage visible. Do not seed demonstration projects or mutate a running user's project during development.

9. Reuse detailed building assemblies and GPU-instanced scenery; 240 real CC0 trees render with bounded draw calls rather than one draw per copy.
10. Provide an authored generic container-vessel assembly with shaped hull, dense ribbed cargo, aft accommodation, bridge windows, rails and lifesaving gear. Its procedural provenance remains distinct from downloaded assets. Reject an ill-fitting toy model as a historical hero.
11. Production-plan fingerprints include format, timing and direction. A partial rebuild cannot certify unchanged shots against a new plan.
