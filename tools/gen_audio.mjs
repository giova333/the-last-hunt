// Generate the game's sound effects and music with ElevenLabs.
//   node tools/gen_audio.mjs            (reads ELEVEN_LABS_KEY from .env.local or the environment)
// Resumable: existing files are skipped. Output: public/audio/{sfx,music}/*.mp3
import fs from 'fs';
import path from 'path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let key = process.env.ELEVEN_LABS_KEY;
const envFile = path.join(root, '.env.local');
if (!key && fs.existsSync(envFile)) key = (fs.readFileSync(envFile, 'utf8').match(/^ELEVEN_LABS_KEY=(.+)$/m) || [])[1]?.trim();
if (!key || key === 'PASTE_YOUR_KEY_HERE') { console.error('No ELEVEN_LABS_KEY: put your key in .env.local'); process.exit(1); }

// name: [prompt, seconds, variants]
const SFX = {
  swing_light: ['fast heavy steel saw-cleaver blade whooshing through the air, sharp swish, no impact', 0.7, 3],
  swing_heavy: ['slow massive iron cleaver swung hard through the air, deep powerful whoosh, no impact', 1.0, 2],
  hit_flesh: ['serrated blade slicing into flesh, wet meaty gore impact with blood splatter', 0.7, 3],
  hit_heavy: ['massive blade cleaving into a huge beast, deep wet crunch and bone crack', 1.0, 2],
  step: ['single leather boot footstep on wet cobblestone, close, one step only', 0.5, 4],
  roll: ['a person rolling quickly across stone ground, leather coat rustle and a soft thud', 0.8, 1],
  drink: ['uncorking a small glass vial and gulping a thick liquid', 1.4, 1],
  heal: ['dark eerie magical shimmer of restored life, soft whoosh with a low choir breath', 1.4, 1],
  seer_screech: ['creepy plague creature hissing screech, raspy and inhuman, horror', 1.4, 2],
  censer: ['heavy iron censer on a chain swung through the air, chain rattle and whoosh', 1.0, 2],
  claw: ['giant beast claws slashing through the air, heavy savage whoosh', 0.9, 2],
  roar: ['huge monstrous werewolf beast roaring furiously, deep and terrifying, reverberant', 3.5, 2],
  slam: ['colossal beast landing on stone ground, massive impact boom with rubble', 1.8, 1],
  stomp: ['heavy monster footstep on stone, deep thud', 0.6, 3],
  lantern: ['old oil lantern igniting with a whoosh of flame and a soft distant church bell', 2.5, 1],
  gate: ['passing through a dense magical fog wall, deep ethereal whoosh, ominous', 3.0, 1],
  death: ['single deep funeral church bell toll with long dark reverb', 5.0, 1],
  victory: ['short dark gothic choir chord swelling and fading in a cathedral', 5.0, 1],
  shatter: ['small glass vial shattering on stone', 1.0, 1],
  ambience: ['night wind howling softly through gothic city streets, distant crows and a faint distant bell, continuous ambience', 20, 1],
};
const MUSIC = {
  explore: ['Dark ambient gothic horror exploration music for a cursed Victorian city at night: sparse low cellos, distant church bells, eerie choir pads, fragile music-box fragments, melancholic and tense, slow, no percussion, instrumental, loopable', 120],
  boss1: ['Epic Victorian gothic horror boss battle music: frantic driving string ostinato, thunderous timpani and taiko, chanting Latin choir, pipe organ, dissonant brass stabs, relentless and terrifying, instrumental, loopable', 150],
  boss2: ['Second phase of a Victorian gothic horror boss battle: faster and more frenzied, screaming violins, pounding war drums, full choir shouting, cathedral organ blasts, chaotic desperate climax, instrumental, loopable', 120],
};

const H = { 'xi-api-key': key, 'Content-Type': 'application/json' };
async function save(url, body, out) {
  if (fs.existsSync(out)) { console.log('skip', path.basename(out)); return true; }
  const r = await fetch(url, { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!r.ok) { console.log('FAIL', path.basename(out), r.status, (await r.text()).slice(0, 300)); return false; }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
  console.log('ok', path.basename(out));
  return true;
}

const only = process.argv[2]; // optional: 'sfx' | 'music'
const jobs = [];
if (only !== 'music') for (const [name, [prompt, sec, n]] of Object.entries(SFX)) for (let i = 0; i < n; i++) {
  jobs.push(() => save('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128',
    { text: prompt, duration_seconds: sec, prompt_influence: 0.55 }, path.join(root, `public/audio/sfx/${name}${n > 1 ? `_${i + 1}` : ''}.mp3`)));
}
if (only !== 'sfx') for (const [name, [prompt, sec]] of Object.entries(MUSIC)) {
  jobs.push(() => save('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128',
    { prompt, music_length_ms: sec * 1000, force_instrumental: true }, path.join(root, `public/audio/music/${name}.mp3`)));
}
// A few at a time.
let fails = 0;
for (let i = 0; i < jobs.length; i += 2) {   // plan allows 2 concurrent requests
  const res = await Promise.all(jobs.slice(i, i + 2).map((j) => j().catch((e) => { console.log('ERR', e.message); return false; })));
  fails += res.filter((x) => !x).length;
}
// Manifest of what exists, for the game to load.
const list = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.mp3')).sort() : [];
fs.writeFileSync(path.join(root, 'public/audio/manifest.json'), JSON.stringify({ sfx: list(path.join(root, 'public/audio/sfx')), music: list(path.join(root, 'public/audio/music')) }, null, 1));
console.log(`done, ${fails} failed`);
