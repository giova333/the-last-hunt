import * as THREE from 'three';

// Pooled particle system for blood, sparks, mist and dust.
// Particles live in a fixed ring of preallocated slots: emitting reuses the oldest slot
// (no Array.shift, no per-particle allocation), so a full pool costs the same as an empty one.
export class FX {
  constructor(scene, { max = 2500, maxDecals = 80 } = {}) {
    this.max = max;
    this.maxDecals = maxDecals;
    this.p = Array.from({ length: max }, () => ({ x: 0, y: 0, z: 0, v: new THREE.Vector3(), life: 0, max: 1, size: 0, c: [0, 0, 0], gravity: 0, drag: 0 }));
    this.head = 0;
    this.alive = 0;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 3);
    this.col = new Float32Array(this.max * 3);
    this.size = new Float32Array(this.max);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, vertexColors: true,
      vertexShader: `attribute float size; varying vec3 vColor;
        void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * 300.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vColor; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vColor, smoothstep(0.5, 0.1, d)); }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.decals = [];
    this.scene = scene;
    this.decalMat = new THREE.MeshStandardMaterial({ color: 0x2a0303, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  }

  emit(n, origin, { color = [0.5, 0.02, 0.02], speed = 4, up = 2, life = 0.8, size = 0.08, gravity = 12, spread = 1, dir = null, drag = 0 } = {}) {
    for (let i = 0; i < n; i++) {
      const q = this.p[this.head];
      this.head = (this.head + 1) % this.max;
      const v = q.v.set((Math.random() - 0.5) * 2, Math.random() * up / Math.max(speed, 0.01), (Math.random() - 0.5) * 2).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8) * spread);
      if (dir) v.addScaledVector(dir, speed * 0.8);
      v.y += up * Math.random();
      for (let k = 0; k < 3; k++) q.c[k] = color[k] * (0.7 + Math.random() * 0.5);
      q.x = origin.x; q.y = origin.y; q.z = origin.z;
      q.life = life * (0.6 + Math.random() * 0.6); q.max = life; q.size = size * (0.6 + Math.random() * 0.8);
      q.gravity = gravity; q.drag = drag;
    }
  }

  blood(at, dir, amount = 1) {
    this.emit(Math.round(40 * amount), at, { color: [0.55, 0.02, 0.03], speed: 5, up: 3, dir, life: 0.9, size: 0.09 });
    this.emit(Math.round(12 * amount), at, { color: [0.3, 0.0, 0.0], speed: 1.2, up: 0.6, life: 1.4, size: 0.35, gravity: 0.5, drag: 2 });
    if (Math.random() < 0.7) this.splat(at.x + (dir?.x || 0) * 0.8, at.z + (dir?.z || 0) * 0.8, 0.3 + Math.random() * 0.5 * amount);
  }

  sparks(at) { this.emit(18, at, { color: [1.6, 1.0, 0.4], speed: 6, up: 2, life: 0.35, size: 0.05, gravity: 14 }); }
  bloodSteam(at, n = 2) { this.emit(n, at, { color: [0.55, 0.04, 0.02], speed: 0.3, up: 1.6, life: 1.2, size: 0.35, gravity: -0.7, drag: 1 }); }
  poison(at, n = 4) { this.emit(n, at, { color: [0.35, 0.55, 0.1], speed: 0.4, up: 1.4, life: 1.4, size: 0.4, gravity: -0.6, drag: 1 }); }
  dust(at, n = 30, r = 1) { this.emit(n, at, { color: [0.25, 0.22, 0.2], speed: 3 * r, up: 1, life: 1.2, size: 0.5, gravity: 0.3, drag: 2 }); }
  mist(at) { this.emit(60, at, { color: [0.6, 0.0, 0.02], speed: 6, up: 1.5, life: 1.6, size: 0.6, gravity: -0.3, drag: 1.5 }); }
  heal(at) { this.emit(30, at, { color: [1.2, 0.5, 0.3], speed: 0.8, up: 2.5, life: 1, size: 0.12, gravity: -1.5 }); }
  echoes(at) { this.emit(40, at, { color: [0.9, 0.85, 0.7], speed: 1, up: 3, life: 1.8, size: 0.1, gravity: -1.2 }); }

  splat(x, z, r) {
    const y = this.heightAt ? this.heightAt(x, z) : 0;
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 10), this.decalMat);
    m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 6; m.scale.x = 0.6 + Math.random() * 0.8;
    m.position.set(x, y + 0.02, z);
    this.scene.add(m);
    this.decals.push(m);
    if (this.decals.length > this.maxDecals) { const d = this.decals.shift(); this.scene.remove(d); d.geometry.dispose(); }
  }

  update(dt) {
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      const q = this.p[i];
      if (q.life > 0) {
        q.life -= dt;
        if (q.life > 0) {
          alive++;
          q.v.y -= q.gravity * dt;
          if (q.drag) q.v.multiplyScalar(Math.max(0, 1 - q.drag * dt));
          q.x += q.v.x * dt; q.y += q.v.y * dt; q.z += q.v.z * dt;
          const floor = this.heightAt ? this.heightAt(q.x, q.z) : 0;
          if (q.y < floor + 0.02) { q.y = floor + 0.02; q.v.multiplyScalar(0.2); }
        }
      }
      if (q.life <= 0) { this.size[i] = 0; continue; }
      const k = q.life / q.max;
      this.pos[i * 3] = q.x; this.pos[i * 3 + 1] = q.y; this.pos[i * 3 + 2] = q.z;
      this.col[i * 3] = q.c[0]; this.col[i * 3 + 1] = q.c[1]; this.col[i * 3 + 2] = q.c[2];
      this.size[i] = q.size * Math.min(1, k * 2);
    }
    const idle = alive === 0 && this.alive === 0;   // nothing changed since the last upload
    this.alive = alive;
    if (idle) return;
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = g.attributes.color.needsUpdate = g.attributes.size.needsUpdate = true;
  }
}
