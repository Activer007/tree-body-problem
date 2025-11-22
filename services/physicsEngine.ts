import { BodyState, Vector3, SimulationConfig } from '../types';

type EnergyStats = {
  totalEnergy: number;
  kineticEnergy: number;
  potentialEnergy: number;
  habitable: boolean;
};

interface DerivativeBuffer {
  dPos: Vector3[]; // Velocities
  dVel: Vector3[]; // Accelerations
}

export class PhysicsEngine {
  bodies: BodyState[];
  config: SimulationConfig;

  // Pre-allocated memory buffers for RK4 integration to prevent GC thrashing
  private k1: DerivativeBuffer;
  private k2: DerivativeBuffer;
  private k3: DerivativeBuffer;
  private k4: DerivativeBuffer;
  private tempBodies: BodyState[]; // Scratchpad for intermediate RK4 states
  private numBodies: number;
  private energySampleInterval: number;
  private timeSinceLastEnergySample = 0;
  private statsCache: EnergyStats | null = null;
  private statsCallback?: (stats: EnergyStats) => void;

  constructor(initialBodies: BodyState[], config: SimulationConfig) {
    // Deep copy initial state to ensure we have our own mutable instances
    this.bodies = initialBodies.map(b => ({
        ...b,
        position: { ...b.position },
        velocity: { ...b.velocity }
    }));

    this.config = config;
    this.numBodies = this.bodies.length;
    this.energySampleInterval = config.energySampleInterval ?? 1;

    // Initialize buffers
    this.k1 = this.createDerivativeBuffer(this.numBodies);
    this.k2 = this.createDerivativeBuffer(this.numBodies);
    this.k3 = this.createDerivativeBuffer(this.numBodies);
    this.k4 = this.createDerivativeBuffer(this.numBodies);
    
    // Temp bodies needs to be a full structure we can overwrite for intermediate calculations
    this.tempBodies = this.bodies.map(b => ({
        ...b,
        position: { x:0, y:0, z:0 },
        velocity: { x:0, y:0, z:0 }
        // Mass/Radius/etc are read from this.bodies or copied here if needed,
        // but for calculation only position/velocity change in temp. 
        // However, calculateAccelerations reads mass from the object passed to it.
        // So we must ensure tempBodies has correct mass.
    }));

    // Seed initial stats cache so UI reads don't trigger immediate recomputation
    this.statsCache = this.calculateEnergyStats();
  }

  private createDerivativeBuffer(n: number): DerivativeBuffer {
      return {
          dPos: Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0 })),
          dVel: Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0 }))
      };
  }

  // --- Mutable Vector Math Helpers (In-place operations) ---
  
  private setVector(target: Vector3, source: Vector3) {
      target.x = source.x;
      target.y = source.y;
      target.z = source.z;
  }

  // target = a + b * s
  private addScaledVector(target: Vector3, a: Vector3, b: Vector3, s: number) {
      target.x = a.x + b.x * s;
      target.y = a.y + b.y * s;
      target.z = a.z + b.z * s;
  }

  // -----------------------------------

  // Writes result directly into outAcc array
  private calculateAccelerations(state: BodyState[], outAcc: Vector3[]) {
    const n = this.numBodies;
    const { G, softening } = this.config;

    // Reset accelerations
    for(let i=0; i<n; i++) {
        outAcc[i].x = 0;
        outAcc[i].y = 0;
        outAcc[i].z = 0;
    }

    for (let i = 0; i < n; i++) {
      const bodyA = state[i];
      for (let j = i + 1; j < n; j++) {
        const bodyB = state[j];

        const dx = bodyB.position.x - bodyA.position.x;
        const dy = bodyB.position.y - bodyA.position.y;
        const dz = bodyB.position.z - bodyA.position.z;

        const distSq = dx*dx + dy*dy + dz*dz;
        const dist = Math.sqrt(distSq + softening * softening);
        const f = G / (dist * dist * dist); 

        const fx = f * dx;
        const fy = f * dy;
        const fz = f * dz;

        // Acceleration of A
        outAcc[i].x += fx * bodyB.mass;
        outAcc[i].y += fy * bodyB.mass;
        outAcc[i].z += fz * bodyB.mass;

        // Acceleration of B
        outAcc[j].x -= fx * bodyA.mass;
        outAcc[j].y -= fy * bodyA.mass;
        outAcc[j].z -= fz * bodyA.mass;
      }
    }
  }

  // Compute derivative for RK4
  // inputState: the base state (this.bodies)
  // dtOffset: time to advance for this intermediate step
  // derivative: previous derivative to use for projection (k1, k2, etc)
  // outResult: where to store the calculated derivative (velocity and acceleration)
  private evaluate(inputState: BodyState[], dt: number, derivative: DerivativeBuffer | null, outResult: DerivativeBuffer) {
      const n = this.numBodies;

      // 1. Setup temporary state (tempBodies)
      for (let i = 0; i < n; i++) {
          const b = this.tempBodies[i];
          const initial = inputState[i];

          if (derivative) {
              // b.position = initial.position + derivative.dPos * dt
              this.addScaledVector(b.position, initial.position, derivative.dPos[i], dt);
              // b.velocity = initial.velocity + derivative.dVel * dt
              this.addScaledVector(b.velocity, initial.velocity, derivative.dVel[i], dt);
          } else {
              this.setVector(b.position, initial.position);
              this.setVector(b.velocity, initial.velocity);
          }
          // Ensure mass is consistent (copied in constructor, assumed constant)
      }

      // 2. Calculate Output Derivative
      // dPos = velocity of temp state
      // dVel = acceleration of temp state
      
      // Calculate accelerations based on temp state, write to outResult.dVel
      this.calculateAccelerations(this.tempBodies, outResult.dVel);
      
      // Write velocities to outResult.dPos
      for (let i = 0; i < n; i++) {
          this.setVector(outResult.dPos[i], this.tempBodies[i].velocity);
      }
  }

  setStatsCallback(cb?: (stats: EnergyStats) => void) {
    this.statsCallback = cb;
    if (cb && this.statsCache) {
      cb(this.statsCache);
    }
  }

  step(dt: number) {
      // RK4 Integration Steps
      // Note: We reuse this.bodies and the k buffers, creating NO new objects here.
      
      // k1 = evaluate(state, 0, null)
      this.evaluate(this.bodies, 0, null, this.k1);
      
      // k2 = evaluate(state, dt*0.5, k1)
      this.evaluate(this.bodies, dt * 0.5, this.k1, this.k2);
      
      // k3 = evaluate(state, dt*0.5, k2)
      this.evaluate(this.bodies, dt * 0.5, this.k2, this.k3);
      
      // k4 = evaluate(state, dt, k3)
      this.evaluate(this.bodies, dt, this.k3, this.k4);

      // Final integration
      // state = state + (k1 + 2*k2 + 2*k3 + k4) * dt / 6
      const n = this.numBodies;
      const dtDiv6 = dt / 6.0;

      for (let i = 0; i < n; i++) {
          const body = this.bodies[i];
          
          const k1p = this.k1.dPos[i];
          const k2p = this.k2.dPos[i];
          const k3p = this.k3.dPos[i];
          const k4p = this.k4.dPos[i];

          body.position.x += (k1p.x + 2*k2p.x + 2*k3p.x + k4p.x) * dtDiv6;
          body.position.y += (k1p.y + 2*k2p.y + 2*k3p.y + k4p.y) * dtDiv6;
          body.position.z += (k1p.z + 2*k2p.z + 2*k3p.z + k4p.z) * dtDiv6;

          const k1v = this.k1.dVel[i];
          const k2v = this.k2.dVel[i];
          const k3v = this.k3.dVel[i];
          const k4v = this.k4.dVel[i];

          body.velocity.x += (k1v.x + 2*k2v.x + 2*k3v.x + k4v.x) * dtDiv6;
          body.velocity.y += (k1v.y + 2*k2v.y + 2*k3v.y + k4v.y) * dtDiv6;
          body.velocity.z += (k1v.z + 2*k2v.z + 2*k3v.z + k4v.z) * dtDiv6;
      }

      this.timeSinceLastEnergySample += dt;
      if (this.timeSinceLastEnergySample >= this.energySampleInterval) {
          this.statsCache = this.calculateEnergyStats();
          this.timeSinceLastEnergySample = 0;

          if (this.statsCallback) {
            this.statsCallback(this.statsCache);
          }
      }
  }

  private calculateEnergyStats(): EnergyStats {
      let potential = 0;
      let kinetic = 0;
      let habitable = false;

      const n = this.numBodies;
      // Optimized: Avoid .find and .filter to reduce allocations
      let planet: BodyState | null = null;
      const stars: BodyState[] = [];

      // Single pass to categorize
      for(let i=0; i<n; i++) {
          const b = this.bodies[i];
          if (b.isStar) {
              stars.push(b);
          } else {
              planet = b;
          }
          // Kinetic Energy: 0.5 * m * v^2
          const vSq = b.velocity.x**2 + b.velocity.y**2 + b.velocity.z**2;
          kinetic += 0.5 * b.mass * vSq;
      }

      // Potential Energy: -G * m1 * m2 / r
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const b1 = this.bodies[i];
          const b2 = this.bodies[j];
          const dx = b1.position.x - b2.position.x;
          const dy = b1.position.y - b2.position.y;
          const dz = b1.position.z - b2.position.z;
          const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
          potential -= (this.config.G * b1.mass * b2.mass) / dist;
        }
      }

      // Simple Habitable Check
      if (planet) {
        let minStarDist = Infinity;
        for (const star of stars) {
          const dx = star.position.x - planet.position.x;
          const dy = star.position.y - planet.position.y;
          const dz = star.position.z - planet.position.z;
          const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

          const optimalDist = Math.sqrt(star.mass) * 1.5;
          if (Math.abs(dist - optimalDist) < optimalDist * 0.3) {
             habitable = true;
          }
          if (dist < minStarDist) minStarDist = dist;
        }

        // If too close, it burns
        if (minStarDist < 2) habitable = false;
      }

      return {
        totalEnergy: kinetic + potential,
        kineticEnergy: kinetic,
        potentialEnergy: potential,
        habitable
      };
  }

  getStats() {
    if (!this.statsCache) {
      this.statsCache = this.calculateEnergyStats();
    }

    return this.statsCache;
  }
}