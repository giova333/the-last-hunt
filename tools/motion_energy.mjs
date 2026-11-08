// Prints per-0.2s motion energy for each clip in a GLB, to find usable segments.
import fs from 'fs';
const f = process.argv[2];
const b = fs.readFileSync(f);
const jl = b.readUInt32LE(12);
const j = JSON.parse(b.slice(20, 20 + jl));
const bin = b.slice(20 + jl + 8);
const read = (ai) => {
  const a = j.accessors[ai], bv = j.bufferViews[a.bufferView];
  const n = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type];
  return new Float32Array(bin.buffer.slice(bin.byteOffset + (bv.byteOffset || 0) + (a.byteOffset || 0), bin.byteOffset + (bv.byteOffset || 0) + (a.byteOffset || 0) + a.count * n * 4));
};
for (const anim of j.animations) {
  if (process.argv[3] && anim.name !== process.argv[3]) continue;
  const bins = {};
  for (const ch of anim.channels) {
    if (ch.target.path !== 'rotation') continue;
    const s = anim.samplers[ch.sampler];
    const t = read(s.input), q = read(s.output);
    for (let i = 1; i < t.length; i++) {
      let dot = 0; for (let k = 0; k < 4; k++) dot += q[i * 4 + k] * q[(i - 1) * 4 + k];
      const ang = 2 * Math.acos(Math.min(1, Math.abs(dot)));
      const bk = Math.floor(t[i] / 0.2);
      bins[bk] = (bins[bk] || 0) + ang;
    }
  }
  const keys = Object.keys(bins).map(Number).sort((a, b) => a - b);
  const max = Math.max(...Object.values(bins));
  console.log(`== ${anim.name}`);
  console.log(keys.map((k) => `${(k * 0.2).toFixed(1).padStart(5)} ${'#'.repeat(Math.round((bins[k] / max) * 40))}`).join('\n'));
}
