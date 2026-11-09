# The Last Hunt

Browser souls-like on three.js + Vite, deployed to GitHub Pages and played on phones.

## Frame budget

Phones set the budget (see commit 8b42165). Every rendering change stays inside it:

- **Real lights** come only from the pool in `World.poolLights` (6 touch / 10 desktop). A new flame is a `PointLight` source the pool picks up, or a `glow()` sprite.
- **Instances share** geometry and material; per-instance variation comes from world position in the shader.
- **World animation** (fire, cloth, embers) runs in shaders off `worldTime` in `src/world.js`.
- **Cut-outs** use `alphaTest`.
- Compare `game.renderer.info` (`render.calls`, `programs.length`) before and after.

## Checks

`npm test` and `npm run test:smoke` (CI runs both). After a fresh clone: `npm install && npx playwright install chromium`.

Locally the desktop smoke profile is red on `main`: headless Chromium rejects pointer lock (`src/input.js:41`). The phone profile is the signal; only new errors are yours.

## Seeing the game

`npx vite`, then drive `window.game` from the console:

- Teleport: `game.player.pos.set(x, 0, z)`; camera: `game.cam.yaw`.
- Landmarks: start lantern (2.5, 3), street z 0–58, fountain (0, 74, r 4.4), plaza braziers (±12.5, 86), steps lantern (−10, 89), arena (0, 128).
- Quiet the street: `game.seers.forEach((s) => (s.hp = 0))`.

## Art

Adding or replacing a model, texture or UI image, or estimating Tripo credits → `asset-pipeline` skill.

`.tripo/context.json` is rewritten by every Tripo run; leave it out of commits.
