import { BodyState } from '../../types';

// Controller: keeps the Rosette Hexa-Ring approximately circular, equal-angle and co-rotating
export function makeRosetteController(initialBodies: BodyState[]) {
  // Identify petal indices by name prefix
  const petalIdx = initialBodies
    .map((b, i) => ({ b, i }))
    .filter(x => x.b.name.startsWith('Petal'))
    .map(x => x.i);

  // Target radius r* as mass-weighted average of initial radii
  const rStar = (() => {
    let mSum = 0, mrSum = 0;
    for (const i of petalIdx) {
      const b = initialBodies[i];
      const r = Math.hypot(b.position.x, b.position.y, b.position.z);
      mrSum += b.mass * r;
      mSum += b.mass;
    }
    return mSum > 0 ? mrSum / mSum : 12; // fallback to preset radius
  })();

  // Target angular speed ω* from initial tangential velocity / radius (mass-weighted)
  const omegaStar = (() => {
    let mSum = 0, sum = 0;
    for (const i of petalIdx) {
      const b = initialBodies[i];
      const r = Math.hypot(b.position.x, b.position.y) || 1e-6;
      const theta = Math.atan2(b.position.y, b.position.x);
      const vt = (-b.velocity.x * Math.sin(theta) + b.velocity.y * Math.cos(theta));
      sum += b.mass * (vt / r);
      mSum += b.mass;
    }
    return mSum > 0 ? sum / mSum : 0;
  })();

  // Gains and thrust cap (tunable)
  const k_r = 0.08;
  const k_dr = 0.18;
  const k_t = 0.12;
  const k_dt = 0.08;
  const k_c = 0.02;
  const a_max = 0.04;

  return (state: BodyState[], t: number) => {
    const n = state.length;
    const acc = Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0 }));
    if (petalIdx.length === 0) return acc;

    // Mass-weighted centroid and centroid velocity of the ring
    let mSum = 0, cx = 0, cy = 0, cz = 0, cvx = 0, cvy = 0, cvz = 0;
    for (const i of petalIdx) {
      const b = state[i];
      mSum += b.mass;
      cx += b.mass * b.position.x;
      cy += b.mass * b.position.y;
      cz += b.mass * b.position.z;
      cvx += b.mass * b.velocity.x;
      cvy += b.mass * b.velocity.y;
      cvz += b.mass * b.velocity.z;
    }
    if (mSum <= 0) return acc;
    cx /= mSum; cy /= mSum; cz /= mSum;
    cvx /= mSum; cvy /= mSum; cvz /= mSum;

    // Estimate current normal (total angular momentum direction)
    let Lx = 0, Ly = 0, Lz = 0;
    for (const i of petalIdx) {
      const b = state[i];
      const rx = b.position.x - cx, ry = b.position.y - cy, rz = b.position.z - cz;
      const vx = b.velocity.x - cvx, vy = b.velocity.y - cvy, vz = b.velocity.z - cvz;
      Lx += (ry * vz - rz * vy) * b.mass;
      Ly += (rz * vx - rx * vz) * b.mass;
      Lz += (rx * vy - ry * vx) * b.mass;
    }
    const Ln = Math.hypot(Lx, Ly, Lz) || 1;
    const nx = Lx / Ln, ny = Ly / Ln, nz = Lz / Ln;

    for (const i of petalIdx) {
      const b = state[i];
      const rx = b.position.x - cx, ry = b.position.y - cy, rz = b.position.z - cz;
      const vx = b.velocity.x - cvx, vy = b.velocity.y - cvy, vz = b.velocity.z - cvz;

      const r = Math.hypot(rx, ry, rz) || 1e-9;
      const r_hat = { x: rx / r, y: ry / r, z: rz / r };

      // t_hat = n × r_hat
      const tx0 = ny * r_hat.z - nz * r_hat.y;
      const ty0 = nz * r_hat.x - nx * r_hat.z;
      const tz0 = nx * r_hat.y - ny * r_hat.x;
      const t_norm = Math.hypot(tx0, ty0, tz0) || 1e-9;
      const t_hat = { x: tx0 / t_norm, y: ty0 / t_norm, z: tz0 / t_norm };

      const vr = vx * r_hat.x + vy * r_hat.y + vz * r_hat.z;
      const vt = vx * t_hat.x + vy * t_hat.y + vz * t_hat.z;

      const a_r = -k_r * (r - rStar) - k_dr * vr;
      const a_t = -k_t * (vt - omegaStar * r) - k_dt * vt;

      let ax = a_r * r_hat.x + a_t * t_hat.x - k_c * vx;
      let ay = a_r * r_hat.y + a_t * t_hat.y - k_c * vy;
      let az = a_r * r_hat.z + a_t * t_hat.z - k_c * vz;

      const aN = Math.hypot(ax, ay, az);
      if (aN > a_max) {
        const s = a_max / aN;
        ax *= s; ay *= s; az *= s;
      }

      acc[i].x = ax; acc[i].y = ay; acc[i].z = az;
    }

    return acc;
  };
}

