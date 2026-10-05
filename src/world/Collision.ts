/** Simplified 2D (XZ) collision: box colliders for the environment, circles for actors. */
export interface AABB { minX: number; maxX: number; minZ: number; maxZ: number }
export interface Circle { x: number; z: number; r: number }

export class CollisionWorld {
  boxes: AABB[] = [];
  circles: Circle[] = [];
  bounds: AABB = { minX: -12, maxX: 12, minZ: -14, maxZ: 14 };

  addBox(cx: number, cz: number, w: number, d: number, pad = 0) {
    this.boxes.push({ minX: cx - w / 2 - pad, maxX: cx + w / 2 + pad, minZ: cz - d / 2 - pad, maxZ: cz + d / 2 + pad });
  }

  free(x: number, z: number, r: number) { return !this.hit(x, z, r); }

  /**
   * First obstacle hit by segment (x0,z0)->(x1,z1); returns fraction 0..1 or 1 if clear.
   * Used for bullets / line of sight. Circles (trees) ignored for bullets unless includeCircles.
   */
  segment(x0: number, z0: number, x1: number, z1: number, includeCircles = false): number {
    const dx = x1 - x0, dz = z1 - z0;
    let best = 1;
    for (const b of this.boxes) {
      // slab test
      let tmin = 0, tmax = best;
      for (const [o, d, mn, mx] of [[x0, dx, b.minX, b.maxX], [z0, dz, b.minZ, b.maxZ]]) {
        if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) { tmin = 2; break; } continue; }
        let t1 = (mn - o) / d, t2 = (mx - o) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) { tmin = 2; break; }
      }
      if (tmin <= tmax && tmin < best) best = tmin;
    }
    if (includeCircles) for (const c of this.circles) {
      const fx = x0 - c.x, fz = z0 - c.z;
      const a = dx * dx + dz * dz, bb = 2 * (fx * dx + fz * dz), cc = fx * fx + fz * fz - c.r * c.r;
      const disc = bb * bb - 4 * a * cc;
      if (disc < 0) continue;
      const t = (-bb - Math.sqrt(disc)) / (2 * a);
      if (t >= 0 && t < best) best = t;
    }
    return best;
  }

  private hit(x: number, z: number, r: number, ignore?: Circle) {
    if (x - r < this.bounds.minX || x + r > this.bounds.maxX || z - r < this.bounds.minZ || z + r > this.bounds.maxZ) return true;
    for (const b of this.boxes) {
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    for (const c of this.circles) {
      if (c === ignore || c.r <= 0) continue;
      const dx = x - c.x, dz = z - c.z, rr = r + c.r;
      if (dx * dx + dz * dz < rr * rr) return true;
    }
    return false;
  }

  /** Move with axis-separated sliding. Returns resolved position. */
  move(x: number, z: number, dx: number, dz: number, r: number): [number, number] {
    // sub-step to avoid tunnelling at high speed
    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / (r * 0.5)) || 1;
    const sx = dx / steps, sz = dz / steps;
    for (let i = 0; i < steps; i++) {
      if (!this.hit(x + sx, z, r)) x += sx;
      if (!this.hit(x, z + sz, r)) z += sz;
    }
    return [x, z];
  }
}
