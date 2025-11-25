import { BodyState, Vector3, StabilityMetrics } from '../types';
import { G_CONST } from '../constants';

// ============================================================================
// 稳定性分析引擎
// 提供通用的稳定性计算函数，供专用控制器调用
// ============================================================================

/**
 * 计算系统能量（总能量、动能、势能）
 */
export const computeEnergy = (bodies: BodyState[]): {
  totalEnergy: number;
  kineticEnergy: number;
  potentialEnergy: number;
} => {
  const n = bodies.length;
  let kinetic = 0;
  let potential = 0;

  // 计算动能
  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    const vSq = b.velocity.x ** 2 + b.velocity.y ** 2 + b.velocity.z ** 2;
    kinetic += 0.5 * b.mass * vSq;
  }

  // 计算势能
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const b1 = bodies[i];
      const b2 = bodies[j];
      const dx = b1.position.x - b2.position.x;
      const dy = b1.position.y - b2.position.y;
      const dz = b1.position.z - b2.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      potential -= (G_CONST * b1.mass * b2.mass) / dist;
    }
  }

  return {
    totalEnergy: kinetic + potential,
    kineticEnergy: kinetic,
    potentialEnergy: potential
  };
};

/**
 * 计算位力比率 (Virial Ratio)
 * 对于稳定束缚系统：2K/|U| ≈ 1
 * > 2：动能过大，系统可能扩散
 * < 0.5：动能过小，系统可能坍缩
 */
export const computeVirialRatio = (kineticEnergy: number, potentialEnergy: number): number => {
  if (potentialEnergy === 0) return 0;
  return (2 * kineticEnergy) / Math.abs(potentialEnergy);
};

/**
 * 计算任意两个天体之间的最小距离
 */
export const computeMinimumPairwiseDistance = (bodies: BodyState[]): number => {
  const n = bodies.length;
  let minDist = Infinity;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = computeDistance(bodies[i], bodies[j]);
      if (dist < minDist) {
        minDist = dist;
      }
    }
  }

  return minDist;
};

/**
 * 计算任意两个天体之间的最大距离（用于弹射检测）
 */
export const computeMaximumPairwiseDistance = (bodies: BodyState[]): number => {
  const n = bodies.length;
  let maxDist = 0;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = computeDistance(bodies[i], bodies[j]);
      if (dist > maxDist) {
        maxDist = dist;
      }
    }
  }

  return maxDist;
};

/**
 * 计算系统质心
 */
export const computeCentroid = (bodies: BodyState[]): Vector3 => {
  let totalMass = 0;
  let cx = 0, cy = 0, cz = 0;

  for (const body of bodies) {
    totalMass += body.mass;
    cx += body.mass * body.position.x;
    cy += body.mass * body.position.y;
    cz += body.mass * body.position.z;
  }

  if (totalMass === 0) return { x: 0, y: 0, z: 0 };

  return {
    x: cx / totalMass,
    y: cy / totalMass,
    z: cz / totalMass
  };
};

/**
 * 计算系统的总角动量
 */
export const computeAngularMomentum = (bodies: BodyState[]): Vector3 => {
  let Lx = 0, Ly = 0, Lz = 0;

  for (const body of bodies) {
    // L = r × p = r × (m * v)
    const px = body.mass * body.velocity.x;
    const py = body.mass * body.velocity.y;
    const pz = body.mass * body.velocity.z;

    Lx += body.position.y * pz - body.position.z * py;
    Ly += body.position.z * px - body.position.x * pz;
    Lz += body.position.x * py - body.position.y * px;
  }

  return { x: Lx, y: Ly, z: Lz };
};

/**
 * 计算对称性分数（通用算法）
 * 返回 0-1 的分数，1 表示完美对称
 */
export const computeSymmetryScore = (bodies: BodyState[]): number => {
  const centroid = computeCentroid(bodies);
  const n = bodies.length;

  if (n < 3) return 1;  // 少于3个天体时认为是对称的

  // 计算每个天体到质心的距离
  const distances = bodies.map(body =>
    computeDistance(body, centroid)
  );

  // 计算这些距离的标准差
  const avgDist = distances.reduce((a, b) => a + b, 0) / n;
  const variance = distances.reduce((sum, d) => sum + (d - avgDist) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  // 对称性分数 = 1 / (1 + stdDev / avgDist)
  // 当 stdDev = 0（完美对称）时，分数为 1
  return 1 / (1 + stdDev / (avgDist + 0.001));
};

/**
 * 计算希尔球半径（用于层级系统分析）
 * Hill Sphere = a * (m / (3M))^(1/3)
 * 其中 m 是卫星质量，M 是主星质量，a 是轨道半长轴（用当前距离近似）
 */
export const computeHillSphere = (
  satellite: BodyState,
  primary: BodyState,
  distance: number
): number => {
  const massRatio = satellite.mass / (3 * primary.mass);
  if (massRatio <= 0) return 0;
  return distance * Math.pow(massRatio, 1/3);
};

/**
 * 计算两个天体的双体能量（用于判断束缚/非束缚）
 */
export const computeTwoBodyEnergy = (
  body1: BodyState,
  body2: BodyState
): number => {
  // 相对位置
  const dx = body1.position.x - body2.position.x;
  const dy = body1.position.y - body2.position.y;
  const dz = body1.position.z - body2.position.z;
  const r = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // 相对速度
  const dvx = body1.velocity.x - body2.velocity.x;
  const dvy = body1.velocity.y - body2.velocity.y;
  const dvz = body1.velocity.z - body2.velocity.z;
  const v = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);

  // 约化质量
  const mu = (body1.mass * body2.mass) / (body1.mass + body2.mass);

  // E = 0.5 * μ * v² - G * m1 * m2 / r
  return 0.5 * mu * v * v - G_CONST * body1.mass * body2.mass / r;
};

/**
 * 计算空间扩散度
 * = 最大距离 / 最小距离
 */
export const computeSpatialSpread = (bodies: BodyState[]): number => {
  const minDist = computeMinimumPairwiseDistance(bodies);
  const maxDist = computeMaximumPairwiseDistance(bodies);

  if (minDist < 0.001) return Infinity;
  return maxDist / minDist;
};

/**
 * 计算轨道速度（用于反馈调整）
 */
export const computeOrbitalSpeed = (
  body: BodyState,
  centralMass: number,
  distance: number
): number => {
  if (distance <= 0) return 0;
  return Math.sqrt(G_CONST * centralMass / distance);
};

/**
 * 计算两个向量之间的距离
 */
export function computeDistance(a: any, b: any): number {
  const av: Vector3 = (a && a.position) ? a.position : a;
  const bv: Vector3 = (b && b.position) ? b.position : b;
  const dx = av.x - bv.x;
  const dy = av.y - bv.y;
  const dz = av.z - bv.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * 计算两个向量之间的距离（使用原始坐标）
 */
export const computeDistanceRaw = (pos1: [number, number, number], pos2: Vector3): number => {
  const dx = pos1[0] - pos2.x;
  const dy = pos1[1] - pos2.y;
  const dz = pos1[2] - pos2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

/**
 * 计算标准差
 */
export const computeStd = (values: number[]): number => {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + (val - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

/**
 * 主稳定性分析函数
 * 计算完整的 StabilityMetrics
 */
export const analyzeStability = (
  bodies: BodyState[],
  initialEnergy?: number
): StabilityMetrics => {
  // 计算能量
  const energy = computeEnergy(bodies);

  // 计算位力比率
  const virialRatio = computeVirialRatio(energy.kineticEnergy, energy.potentialEnergy);

  // 计算质心和距离
  const centroid = computeCentroid(bodies);
  const minDistance = computeMinimumPairwiseDistance(bodies);
  const maxDistance = computeMaximumPairwiseDistance(bodies);

  // 计算对称性
  const symmetryScore = computeSymmetryScore(bodies);

  // 计算角动量
  const angularMomentum = computeAngularMomentum(bodies);

  // 计算能量偏差
  const energyDeviation = initialEnergy !== undefined
    ? Math.abs(energy.totalEnergy - initialEnergy) / (Math.abs(initialEnergy) + 0.001)
    : 0;

  // 计算空间扩散度
  const spatialSpread = computeSpatialSpread(bodies);

  // 计算距离标准差（从质心）
  const distancesFromCenter = bodies.map(body => computeDistance(body, centroid));
  const radiusStd = computeStd(distancesFromCenter);

  return {
    totalEnergy: energy.totalEnergy,
    kineticEnergy: energy.kineticEnergy,
    potentialEnergy: energy.potentialEnergy,
    energyDeviation,
    virialRatio,
    centroid,
    radiusStd,
    symmetryScore,
    minDistance,
    maxDistance,
    spatialSpread,
    angularMomentum,
    energyChangeRate: 0  // 需要外部提供 dE/dt
  };
};

/**
 * 综合稳定性评估
 * 返回整体稳定性状态和关键问题
 */
export const evaluateStabilityStatus = (metrics: StabilityMetrics): {
  status: 'stable' | 'warning' | 'critical';
  issues: string[];
} => {
  const issues: string[] = [];

  // 检查能量守恒（偏差 > 10% 警告）
  if (metrics.energyDeviation > 0.1) {
    issues.push(`Energy deviation: ${(metrics.energyDeviation * 100).toFixed(1)}%`);
  }

  // 检查位力比率（理想值 ≈ 1）
  if (metrics.virialRatio > 2.0) {
    issues.push(`High kinetic energy (${metrics.virialRatio.toFixed(2)})`);
  } else if (metrics.virialRatio < 0.4) {
    issues.push(`Low kinetic energy (${metrics.virialRatio.toFixed(2)})`);
  }

  // 检查距离（过大可能表示弹射）
  if (metrics.maxDistance > 100) {
    issues.push('Ejection detected (large distance)');
  }

  // 检查对称性（如果应该有对称性）
  if (metrics.symmetryScore < 0.8) {
    issues.push(`Low symmetry: ${metrics.symmetryScore.toFixed(2)}`);
  }

  // 判断总体状态
  let status: 'stable' | 'warning' | 'critical' = 'stable';
  if (issues.length >= 2) {
    status = 'critical';
  } else if (issues.length >= 1) {
    status = 'warning';
  }

  return { status, issues };
};
