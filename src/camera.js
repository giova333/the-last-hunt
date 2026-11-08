import * as THREE from 'three';
import { lerpAngle } from './actor.js';

// Third-person orbit camera with lock-on framing and trauma-based shake.
export class ThirdPersonCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0.22;
    this.dist = 4.6;
    this.trauma = 0;
    this.focus = new THREE.Vector3();
    this.t = 0;
  }

  update(dt, player, input, heightAt) {
    this.t += dt;
    const sens = 0.0024;
    if (player.lock) {
      // Swing behind the player, looking toward the target.
      const toT = Math.atan2(player.lock.pos.x - player.pos.x, player.lock.pos.z - player.pos.z);
      this.yaw = lerpAngle(this.yaw, toT, Math.min(1, 6 * dt));
      const big = player.lock.radius > 1;
      this.pitch = THREE.MathUtils.lerp(this.pitch, big ? 0.12 : 0.25, 3 * dt);
    } else {
      this.yaw -= input.mouseDX * sens;
      this.pitch = THREE.MathUtils.clamp(this.pitch + input.mouseDY * sens, -0.35, 1.1);
    }
    const head = player.pos.clone().add(new THREE.Vector3(0, 1.65, 0));
    this.focus.lerp(head, Math.min(1, 12 * dt));
    if (this.focus.distanceTo(head) > 3) this.focus.copy(head);
    const dist = player.lock && player.lock.radius > 1 ? 5.6 : this.dist;
    const off = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)).multiplyScalar(dist);
    const pos = this.focus.clone().add(off);
    // Keep above the floor.
    const floor = heightAt(pos.x, pos.z) + 0.3;
    if (pos.y < floor) pos.y = floor;
    // Over-the-shoulder offset.
    const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    pos.addScaledVector(right, -0.45);
    this.camera.position.copy(pos);
    const look = this.focus.clone().addScaledVector(right, -0.45);
    if (player.lock) look.lerp(player.lock.pos.clone().setY(player.lock.pos.y + (player.lock.radius > 1 ? 2.2 : 1.3)), 0.35);
    this.camera.lookAt(look);
    // Shake.
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma;
    if (s > 0) {
      this.camera.rotation.z += (Math.sin(this.t * 61) * 0.03) * s;
      this.camera.position.x += Math.sin(this.t * 47) * 0.18 * s;
      this.camera.position.y += Math.sin(this.t * 53 + 1) * 0.18 * s;
    }
  }

  shake(a) { this.trauma = Math.min(1, this.trauma + a); }
}
