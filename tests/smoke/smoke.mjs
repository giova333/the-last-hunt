// Smoke test: serve the production build, load it in headless Chromium (desktop and a phone),
// press "Begin the Hunt", play a few seconds and fail on any page error, a missing model,
// or a game that isn't rendering frames.
// Run with `npm run test:smoke` (builds first). CHROMIUM_PATH overrides the browser binary.
import { chromium, devices } from 'playwright';
import { preview } from 'vite';

const server = await preview({ preview: { port: 4317, strictPort: true }, logLevel: 'error' });
const url = 'http://localhost:4317/';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const profiles = {
  desktop: { viewport: { width: 1280, height: 720 } },
  phone: devices['Pixel 7'],
};

let failed = false;
for (const [name, ctxOpts] of Object.entries(profiles)) {
  const errors = [];
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  // Third-party fonts are not part of the game; keep the test offline-safe.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.location().url || '')) errors.push(`console: ${m.text()} (${m.location().url})`); });
  // A missing .glb is not an error in the game (it swaps in a stand-in), but it is in a release build.
  page.on('console', (m) => { if (/\[assets\] .* not found/.test(m.text())) errors.push(`missing model: ${m.text()}`); });
  page.on('response', (r) => { if (r.url().startsWith(url) && r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  page.on('requestfailed', (r) => { if (r.url().startsWith(url)) errors.push(`request failed: ${r.url()}`); });

  try {
    await page.goto(url);
    await page.waitForSelector('#start:not([disabled])', { timeout: 90_000 });
    await page.click('#start');
    const f0 = await page.evaluate(() => window.game.renderer.info.render.frame);
    await page.waitForTimeout(4000);
    const s = await page.evaluate(() => {
      const g = window.game, p = g.player.pos;
      return {
        started: g.started,
        frame: g.renderer.info.render.frame,
        hudVisible: !document.querySelector('#hud').classList.contains('hidden'),
        playerOk: [p.x, p.y, p.z].every(Number.isFinite) && g.player.hp > 0,
      };
    });
    if (!s.started) errors.push('game did not start');
    if (!s.hudVisible) errors.push('HUD not shown after start');
    if (!s.playerOk) errors.push('player state is invalid (NaN position or dead on spawn)');
    if (s.frame - f0 < 5) errors.push(`only ${s.frame - f0} frames rendered in 4 s`);
    console.log(`${name}: ${s.frame - f0} frames in 4 s`);

    // Phones have no E key: the lantern menu's "Leave the lantern" button must close it.
    if (ctxOpts.hasTouch) {
      await page.evaluate(() => window.game.openLantern());
      await page.tap('#lantern-menu .leave');
      if (await page.evaluate(() => window.game.ui.lanternOpen)) errors.push('"Leave the lantern" did not close the lantern menu');
    }
  } catch (e) {
    errors.push(String(e));
  }
  if (errors.length) { failed = true; console.error(`✗ ${name}\n  ${errors.join('\n  ')}`); }
  else console.log(`✓ ${name}`);
  await ctx.close();
}

await browser.close();
await new Promise((r) => server.httpServer.close(r));
process.exit(failed ? 1 : 0);
