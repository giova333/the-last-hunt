---
name: asset-pipeline
description: The Last Hunt art pipeline, from concept to wired-in asset. Use when adding or replacing a 3D model, texture or HUD image, or estimating Tripo credits.
---

# Asset pipeline

Each step ends on its criterion. Tool arguments live in each script's header comment.

1. **Concept.** Generate each image into `art/refs/` with `tools/gen_image.sh` (Codex, about 40 s each; run them in parallel). Attach existing `art/refs/` images as style references so the set stays consistent. Prompt rules:
   - Image → 3D input: `square`, whole object, three-quarter view, plain grey background, unlit.
   - Anything needing alpha: solid `#00FF00` background.
   - A stretchable frame: plain, uniform middle section.

   Show the user every image; regenerate what they reject, with their notes added to the prompt.
   _Done: the user approved every image._

2. **Quote.** Images cost no credits (the user's ChatGPT plan quota). Tripo prices as of 2026-11 (truth: `credits_consumed` in each `task.json`, `tripo usage`):

   | Task | Credits |
   |---|---|
   | text-to-model `--model tripo-v3.1 -p texture_quality=detailed` | 30 |
   | text- or image-to-model, default P2 | 110 |
   | rig / retarget | 25 / 10–50 |

   Budget one retry per model. Check `tripo balance`.
   _Done: the user approved the total._

3. **Generate.** Follow `tools/gen_*.sh` (`TRIPO_CLIENT_APP=claude`, props at `face_limit` 5–10k). Output lands in gitignored `art/tripo/`. Keep models static and opaque: flames, glow, see-through glass and moving parts (draining liquid) are built in code, e.g. `makeVial` in `src/drink.js`.
   _Done: `preview.png` matches the concept._

4. **Build.** `/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/build_env.py -- …` → `public/models/env/<name>.glb`. Hand props: `build_prop.py`; characters: `build_character.py`.
   _Done: triangle count printed and within the frame budget._

5. **Wire in.** Add the name to `ENV` in `src/assets.js`; place with `makeEnv(name, heightMetres)`; keep the primitive fallback. For an anchor (flame, glow, light), measure vertex positions in Blender; `makeEnv` turns the model by −π/2, so model (x, y, z) → group (−z, y, x) × height.
   _Done: the object stands at its spot in game._

6. **2D assets.** `tools/key_image.py` keys out the green, despills and crops (needs Pillow + numpy: make a venv in the scratchpad), then `cwebp`. Output to `public/ui/` or `public/textures/`. URLs: CSS `url('../ui/x.webp')`, JS `'textures/x.webp'` (Vite base is `./`).
   _Done: the cutout has no green fringe on a dark background._

7. **Verify.** Screenshot each asset at its landmark (AGENTS.md, "Seeing the game"), phone smoke profile green, `renderer.info` compared.
