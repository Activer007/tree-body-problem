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
  private currentTime = 0;

  // Stability control system (new)
  private stabilityController?: any; // Type: StabilityController['onBeforeStep']
  private initialEnergy: number | null = null; // For tracking energy conservation

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

      // Append controller accelerations if provided
      if (this.config.controller) {
        // stageTime: current simulation time plus this intermediate offset
        const stageTime = this.currentTime + dt;
        const controls = this.config.controller(this.tempBodies, stageTime);
        if (controls && controls.length === n) {
          for (let i = 0; i < n; i++) {
            const u = controls[i];
            if (u) {
              outResult.dVel[i].x += u.x || 0;
              outResult.dVel[i].y += u.y || 0;
              outResult.dVel[i].z += u.z || 0;
            }
          }
        }
      }
      
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

  // Stability control system methods (new)

  /**
   * Set stability controller for preset-specific stability monitoring
   */
  setStabilityController(controller?: any) {
    this.stabilityController = controller;
    if (!this.initialEnergy) {
      // Record initial energy for conservation tracking
      const stats = this.calculateEnergyStats();
      this.initialEnergy = stats.totalEnergy;
    }
  }

  /**
   * Apply parameter overrides (dynamic time step, softening, etc.)
   */
  applyParameterOverrides(overrides: Partial<SimulationConfig>) {
    if (overrides.timeStep !== undefined) {
      this.config.timeStep = overrides.timeStep;
    }
    if (overrides.softening !== undefined) {
      this.config.softening = overrides.softening;
    }
    if (overrides.G !== undefined) {
      this.config.G = overrides.G;
    }
    if (overrides.energySampleInterval !== undefined) {
      this.config.energySampleInterval = overrides.energySampleInterval;
      this.energySampleInterval = overrides.energySampleInterval;
    }
    if (overrides.controller !== undefined) {
      this.config.controller = overrides.controller;
    }
  }

  /**
   * Get current configuration (for UI display)
   */
  getConfig(): SimulationConfig {
    return { ...this.config };
  }

  /**
   * Set configuration (full replacement)
   */
  setConfig(config: SimulationConfig) {
    this.config = config;
    this.energySampleInterval = config.energySampleInterval ?? 1;
  }

  /**
   * Get energy deviation from initial state
   */
  getEnergyDeviation(): number {
    if (!this.initialEnergy) return 0;

    const stats = this.calculateEnergyStats();
    const deviation = Math.abs(stats.totalEnergy - this.initialEnergy) /
                      (Math.abs(this.initialEnergy) + 0.001);
    return deviation;
  }

  step(dt: number) {
    // Call stability controller before step (if any)
    if (this.stabilityController) {
      const controllerResult = this.stabilityController(this.bodies, this.currentTime, dt);

      if (controllerResult) {
        // Apply parameter overrides
        if (controllerResult.paramOverrides) {
          this.applyParameterOverrides(controllerResult.paramOverrides);
        }

        // Update controller
        if (controllerResult.controller) {
          this.config.controller = controllerResult.controller;
        }

        // Controller can return early (e.g., for UI feedback only)
        if (Object.keys(controllerResult).length > 0) {
          // Log or process other controller results (e.g., uiFeedback)
          // This can be extended to communicate with the UI layer
        }
      }
    }
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

      this.currentTime += dt;
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
      const { G } = this.config;
      
      // Find planet reference (non-star body)
      let planet: BodyState | null = null;
      let minStarDist = Infinity;

      // Pass 1: Calculate kinetic energy and find planet
      for(let i=0; i<n; i++) {
          const b = this.bodies[i];
          if (!b.isStar) {
              planet = b;
          }
          // Kinetic Energy: 0.5 * m * v^2
          const vSq = b.velocity.x**2 + b.velocity.y**2 + b.velocity.z**2;
          kinetic += 0.5 * b.mass * vSq;
      }

      // Pass 2: Single O(n²) loop for potential energy AND habitable check
      // This replaces the previous 2 separate O(n²) loops
      for (let i = 0; i < n; i++) {
        const b1 = this.bodies[i];
        for (let j = i + 1; j < n; j++) {
          const b2 = this.bodies[j];
          
          // Calculate distance once
          const dx = b1.position.x - b2.position.x;
          const dy = b1.position.y - b2.position.y;
          const dz = b1.position.z - b2.position.z;
          const distSq = dx*dx + dy*dy + dz*dz;
          const dist = Math.sqrt(distSq);
          
          // Calculate potential energy
          potential -= (G * b1.mass * b2.mass) / dist;
          
          // Check habitable conditions (only if we have a planet)
          if (planet) {
            // Check if this pair is planet-star
            const isPlanetStarPair = (b1 === planet && b2.isStar) || (b2 === planet && b1.isStar);
            
            if (isPlanetStarPair) {
              const star = b1.isStar ? b1 : b2;
              const optimalDist = Math.sqrt(star.mass) * 1.5;
              
              // Check if within habitable zone band around optimal distance
              if (Math.abs(dist - optimalDist) < optimalDist * 0.3) {
                 habitable = true;
              }
              
              // Track minimum distance planet-to-any-star
              if (dist < minStarDist) {
                minStarDist = dist;
              }
            }
          }
        }
      }

      // If planet is too close to any star, it burns
      if (planet && minStarDist < 2) {
        habitable = false;
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