// effects.js — particles for impacts, smoke and explosions, plus the cash-pickup
// spinners. One reusable THREE.Points pool per burst; nothing is allocated per frame.

import * as THREE from 'three';

export function createEffects(scene) {
  const bursts = [];

  function burst(x, y, z, color, count, speed, life, up = 2) {
    const positions = new Float32Array(count * 3);
    const velocities = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      velocities.push(new THREE.Vector3(
        Math.cos(a) * Math.cos(b) * speed * (0.4 + Math.random() * 0.8),
        Math.sin(b) * speed * 0.7 + up,
        Math.sin(a) * Math.cos(b) * speed * (0.4 + Math.random() * 0.8),
      ));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color, size: 0.35, transparent: true, opacity: 1 });
    const points = new THREE.Points(geo, mat);
    scene.add(points);
    bursts.push({ points, velocities, life, maxLife: life });
  }

  function explosion(x, y, z) {
    burst(x, y + 0.5, z, 0xff8822, 26, 9, 0.9, 4);
    burst(x, y + 0.5, z, 0x444444, 16, 4, 1.6, 5);
    burst(x, y + 0.5, z, 0xffe9a0, 12, 12, 0.5, 3);
  }

  // Cash pickups: spinning gold coins that bob and glint.
  const pickups = [];
  const coinGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.1, 16);
  coinGeo.rotateX(Math.PI / 2);
  const coinMat = new THREE.MeshStandardMaterial({ color: 0xffc93e, metalness: 0.8, roughness: 0.25, emissive: 0x664400, emissiveIntensity: 0.5 });

  function addPickup(x, z) {
    const mesh = new THREE.Mesh(coinGeo, coinMat);
    mesh.position.set(x, 1.2, z);
    mesh.castShadow = true;
    scene.add(mesh);
    const p = { mesh, x, z, taken: false, phase: Math.random() * 6 };
    pickups.push(p);
    return p;
  }

  function update(dt, playerX, playerZ, onCollect) {
    for (const b of bursts) {
      b.life -= dt;
      const pos = b.points.geometry.attributes.position;
      for (let i = 0; i < b.velocities.length; i++) {
        const v = b.velocities[i];
        v.y -= 9 * dt;
        pos.array[i * 3] += v.x * dt;
        pos.array[i * 3 + 1] += v.y * dt;
        pos.array[i * 3 + 2] += v.z * dt;
        if (pos.array[i * 3 + 1] < 0.05) pos.array[i * 3 + 1] = 0.05;
      }
      pos.needsUpdate = true;
      b.points.material.opacity = Math.max(0, b.life / b.maxLife);
    }
    for (let i = bursts.length - 1; i >= 0; i--) {
      if (bursts[i].life <= 0) {
        scene.remove(bursts[i].points);
        bursts[i].points.geometry.dispose();
        bursts[i].points.material.dispose();
        bursts.splice(i, 1);
      }
    }
    for (const p of pickups) {
      if (p.taken) continue;
      p.phase += dt * 2.4;
      p.mesh.rotation.y += dt * 2;
      p.mesh.position.y = 1.2 + Math.sin(p.phase) * 0.25;
      const d = Math.hypot(p.x - playerX, p.z - playerZ);
      if (d < 2.2) {
        p.taken = true;
        p.mesh.visible = false;
        burst(p.x, 1.2, p.z, 0xffd23e, 12, 4, 0.6);
        if (onCollect) onCollect(p);
      }
    }
  }

  return { burst, explosion, addPickup, update, pickups };
}
