# The Last Hunt — Saint Orlan's Ward (vertical slice)

A gothic Souls-like in the browser (Three.js + Vite). One level: the plague street, the Cistern Plaza, the cathedral steps, and the boss — **the Hound of Saint Orlan**.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static build in dist/
```

## Controls
| | |
|---|---|
| WASD / Shift | move / sprint |
| Space | roll (i-frames) |
| LMB / RMB (or F) | slash / heavy cleave |
| Q, MMB or Tab | lock-on |
| R | blood vial (heal, cures plague) |
| E | interact: lanterns, notes, fog gate |
| Esc | pause |

**Mechanics:** stamina, lock-on, poise and stagger, *blood reclaim* (damage you take can be won back by striking within 4 s), plague pools, lantern checkpoints (resting resets enemies), and a two-phase boss (roar at 50% → faster, with a charge and a frenzy combo).

## Asset pipeline
Concept art (`images/`) → cropped views (`art/refs/`) → **Tripo** → **Blender** (headless) → `public/models/`.

| Step | Tool | Command |
|---|---|---|
| Model from front+back views | Tripo P2 multiview | `tripo make front.png back.png --model tripo-p2 -p face_limit=20000 --then rig-check,rig` |
| Animations | Tripo retarget | `tripo anim retarget <rig_task> --animation preset:idle preset:walk preset:run preset:slash preset:hurt --animate-in-place` |
| Weapons | Tripo P2 image | `tripo make cleaver.png --model tripo-p2 -p face_limit=6000` |
| Merge clips, JPEG/downscale textures | Blender | `Blender -b --python tools/build_character.py -- out.glb 2048 anim.glb [extra.glb]` |
| Orient prop, grip at origin | Blender | `Blender -b --python tools/build_prop.py -- in.glb out.glb 1024 0.12 0 preview.png` |
| Environment props (text → 3D) | Tripo P2 + Blender | `tripo generate text-to-model "…" -p face_limit=10000`, then `Blender -b --python tools/build_env.py -- model.glb public/models/env/name.glb 1024 preview.png` (script: `tools/gen_env_props.sh`) |
| Inspect / contact-sheet clips | Blender, node | `tools/inspect_glb.py`, `tools/contact_sheet.py`, `tools/montage.py`, `tools/motion_energy.mjs` |

Tripo's preset `slash` is a 6.4 s combo and `hurt` is long. `src/assets.js` (`CLIP_TRIM`) trims them in-engine, keeping every bone track: slash keeps the first overhead chop (1.0–2.7 s, impact at 66%), with the root bone's twist frozen so attackers keep facing their target.
The hunter's cuts are procedural (`src/swing.js`): torso twist + two-bone arm IK along a diagonal arc, blade aligned to the swing, and a trail. Light attacks alternate forehand/backhand, heavy is a high cleave. Tripo models face sideways and some clips drift; `CharacterModel.calibrate()` measures both from the bones at load and corrects them.
Drinking a vial is procedural too (`src/drink.js`). Environment props live in `public/models/env/` (statue, lamp, doorway, balustrade, cart, cage, tree, coffins); `makeEnv()` in `assets.js` turns them to face +Z and scales them.
Every GLB is optional: if one is missing the game falls back to a procedural stand-in figure.

## Code map
`src/main.js` game loop, interactions, checkpoints, projectiles · `world.js` level, lighting, collision · `player.js` · `seer.js` · `boss.js` · `camera.js` · `fx.js` particles and decals · `audio.js` (all sound is synthesized) · `ui.js`.

## Lore note
The in-game notes and the boss name are **provisional** placeholders written in the bible's mystery tone (Saint Orlan's Ward purge, Grace, a guilty executioner). They don't define canon. Replace them once the full story bible is recovered.
