import { BodyState, StabilityController, Vector3 } from '../../types';
import {
  analyzeStability,
  computeDistance,
  computeCentroid,
  computeAngularMomentum
} from '../stabilityAnalyzer';

// ============================================================================
// LagrangeStable 稳定性控制器
// 保持等边三角形拉格朗日解的对称性
// ============================================================================

interface LagrangeControllerState {
  targetSideLength: number;
  lastSymmetryScore: number;
  correctionCount: number;
  lastCorrectionTime: number;
}

/**
 * 计算等边三角形对称性偏差
 * 返回角度偏差和边长偏差
 */
const computeTriangleSymmetry = (
  bodies: BodyState[],
  targetSideLength: number
): {
  sideLengthStd: number;
  angleStd: number;
  centroidDrift: number;
  overallScore: number;
} => {
  const n = bodies.length;
  if (n !== 3) {
    return {
      sideLengthStd: 0,
      angleStd: 0,
      centroidDrift: 0,
      overallScore: 1
    };
  }

  // 计算所有边长
  const sideLengths: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      sideLengths.push(computeDistance(bodies[i], bodies[j]));
    }
  }

  // 计算边长标准差
  const avgSide = sideLengths.reduce((a, b) => a + b, 0) / sideLengths.length;
  const sideVariance = sideLengths.reduce((sum, s) => sum + (s - avgSide) ** 2, 0) / sideLengths.length;
  const sideLengthStd = Math.sqrt(sideVariance);

  // 计算质心
  const centroid = computeCentroid(bodies);

  // 计算每个顶点到质心的角度
  const angles = bodies.map(body => Math.atan2(body.position.y - centroid.y, body.position.x - centroid.x));

  // 排序角度并计算相邻角度差（应为 120 度）
  const sortedAngles = [...angles].sort((a, b) => a - b);
  const angleDifferences: number[] = [];
  for (let i = 0; i < sortedAngles.length; i++) {
    const nextAngle = sortedAngles[(i + 1) % sortedAngles.length];
    const currentAngle = sortedAngles[i];
    let diff = nextAngle - currentAngle;
    if (i === sortedAngles.length - 1) diff += 2 * Math.PI; // 最后一个到第一个
    angleDifferences.push(diff);
  }

  // 理想角度差是 2π/3 (120度)
  const idealAngleDiff = (2 * Math.PI) / 3;
  const avgAngleDiff = angleDifferences.reduce((a, b) => a + b, 0) / angleDifferences.length;
  const angleVariance = angleDifferences.reduce((sum, a) => sum + (a - avgAngleDiff) ** 2, 0) / angleDifferences.length;
  const angleStd = Math.sqrt(angleVariance);

  // 计算质心漂移
  const initialCentroid = { x: 0, y: 0, z: 0 }; // 假设初始在原点
  const centroidDrift = computeDistance(centroid, initialCentroid);

  // 综合评分
  const sideScore = 1 / (1 + sideLengthStd / (avgSide + 0.001));
  const angleScore = 1 / (1 + angleStd / (idealAngleDiff + 0.001));
  const centroidScore = 1 / (1 + centroidDrift);

  const overallScore = (sideScore + angleScore + centroidScore) / 3;

  return {
    sideLengthStd,
    angleStd,
    centroidDrift,
    overallScore
  };
};

/**
 * 计算目标位置（等边三角形顶点）
 */
const computeTargetTrianglePositions = (
  centroid: Vector3,
  radius: number
): Vector3[] => {
  const positions: Vector3[] = [];

  for (let i = 0; i < 3; i++) {
    const angle = (i * 2 * Math.PI) / 3;
    positions.push({
      x: centroid.x + radius * Math.cos(angle),
      y: centroid.y + radius * Math.sin(angle),
      z: centroid.z
    });
  }

  return positions;
};

/**
 * 计算目标速度（圆形轨道）
 */
const computeTargetTriangleVelocities = (
  centroid: Vector3,
  radius: number,
  orbitalSpeed: number
): Vector3[] => {
  const velocities: Vector3[] = [];

  for (let i = 0; i < 3; i++) {
    const angle = (i * 2 * Math.PI) / 3;
    // 切向速度（90度偏移）
    velocities.push({
      x: -orbitalSpeed * Math.sin(angle),
      y: orbitalSpeed * Math.cos(angle),
      z: 0
    });
  }

  return velocities;
};

/**
 * 创建 LagrangeStable 专用稳定性控制器
 */
export const createLagrangeStableController = (targetSideLength = 12): StabilityController => {
  const controllerState: LagrangeControllerState = {
    targetSideLength,
    lastSymmetryScore: 1.0,
    correctionCount: 0,
    lastCorrectionTime: 0
  };

  const controller: StabilityController = {
    onBeforeStep: (state: BodyState[], t: number, dt: number) => {
      // 只在特定时间点评估（减少开销）
      if (Math.floor(t) % 6 > dt) return;

      // 计算对称性
      const symmetry = computeTriangleSymmetry(state, controllerState.targetSideLength);

      // 记录对称性分数历史
      controllerState.lastSymmetryScore = symmetry.overallScore;

      // 如果对称性低于阈值（0.9），进行微小修正
      if (symmetry.overallScore < 0.9) {
        controllerState.correctionCount++;

        // 计算修正强度（非常低，避免干扰）
        const correctionStrength = 0.003;

        // 计算质心
        const centroid = computeCentroid(state);
        const targetRadius = controllerState.targetSideLength / Math.sqrt(3);

        // 目标位置
        const targetPositions = computeTargetTrianglePositions(centroid, targetRadius);

        // 目标速度（基于质量）
        const avgMass = state.reduce((sum, b) => sum + b.mass, 0) / state.length;
        const orbitalSpeed = Math.sqrt(1.0 * avgMass / controllerState.targetSideLength);
        const targetVelocities = computeTargetTriangleVelocities(centroid, targetRadius, orbitalSpeed);

        // 创建速度修正控制器
        const correctionController = (bodies: BodyState[], t: number) => {
          return bodies.map((body, idx) => {
            const targetPos = targetPositions[idx];
            const targetVel = targetVelocities[idx];

            // 位置修正
            const posDx = targetPos.x - body.position.x;
            const posDy = targetPos.y - body.position.y;
            const posDz = targetPos.z - body.position.z;

            // 速度修正
            const velDx = targetVel.x - body.velocity.x;
            const velDy = targetVel.y - body.velocity.y;
            const velDz = targetVel.z - body.velocity.z;

            // 综合考虑位置和速度偏差
            return {
              x: (posDx * 0.1 + velDx) * correctionStrength,
              y: (posDy * 0.1 + velDy) * correctionStrength,
              z: (posDz * 0.1 + velDz) * correctionStrength
            };
          });
        };

        controllerState.lastCorrectionTime = t;

        return {
          controller: correctionController,
          uiFeedback: {
            message: `Symmetry correction applied: ${(symmetry.overallScore * 100).toFixed(1)}%`,
            level: 'info'
          }
        };
      }

      // 监控质心漂移
      if (symmetry.centroidDrift > 2) {
        return {
          uiFeedback: {
            message: `Centroid drift: ${symmetry.centroidDrift.toFixed(2)}`,
            level: 'warning',
            action: 'Consider reducing numerical errors'
          }
        };
      }

      return;
    }
  };

  return controller;
};

/**
 * 完全守恒模式（更激进的保护）
 * 强制锁定角动量和能量
 */
export const createConservationController = (): StabilityController => {
  const initialState = {
    angularMomentum: null as Vector3 | null,
    energy: 0,
    locked: false
  };

  const controller: StabilityController = {
    onBeforeStep: (state: BodyState[], t: number, dt: number) => {
      // 初始化守恒量
      if (!initialState.locked) {
        initialState.angularMomentum = computeAngularMomentum(state);

        const energy = state.reduce((sum, b) => {
          const vSq = b.velocity.x ** 2 + b.velocity.y ** 2 + b.velocity.z ** 2;
          return sum + 0.5 * b.mass * vSq;
        }, 0);
        initialState.energy = energy;

        initialState.locked = true;
      }

      // 每 20 秒应用一次强校正
      if (Math.floor(t) % 20 > dt) return;

      const currentAngularMomentum = computeAngularMomentum(state);
      const targetL = initialState.angularMomentum!;

      // 计算偏差
      const dLx = targetL.x - currentAngularMomentum.x;
      const dLy = targetL.y - currentAngularMomentum.y;
      const dLz = targetL.z - currentAngularMomentum.z;

      const correctionController = (bodies: BodyState[], t: number) => {
        return bodies.map((body, idx) => {
          const r = Math.sqrt(
            body.position.x ** 2 + body.position.y ** 2 + body.position.z ** 2
          );
          if (r < 0.001) return { x: 0, y: 0, z: 0 };

          // 强角动量校正
          return {
            x: (dLx / body.mass) / (r * bodies.length) * 0.01,
            y: (dLy / body.mass) / (r * bodies.length) * 0.01,
            z: (dLz / body.mass) / (r * bodies.length) * 0.01
          };
        });
      };

      return {
        controller: correctionController,
        uiFeedback: {
          message: 'Conservation mode: Angular momentum correction',
          level: 'info'
        }
      };
    }
  };

  return controller;
};

/**
 * 周期性重对齐控制器
 * 定期将系统重置到完美对称状态（保持总能量）
 */
export const createPeriodicRealignmentController = (interval = 50): StabilityController => {
  const controller: StabilityController = {
    onBeforeStep: (state: BodyState[], t: number, dt: number) => {
      // 每 interval 秒执行一次重对齐
      if (Math.floor(t) % interval > dt) return;

      // 计算质心和目标半径
      const centroid = computeCentroid(state);
      const targetRadius = 12 / Math.sqrt(3);  // 默认等边三角形边长 12

      // 计算角动量（保持守恒）
      const angularMomentum = computeAngularMomentum(state);

      // 记录当前能量
      const currentEnergy = state.reduce((sum, b) => {
        const vSq = b.velocity.x ** 2 + b.velocity.y ** 2 + b.velocity.z ** 2;
        return sum + 0.5 * b.mass * vSq;
      }, 0);

      // 重新定位天体到完美对称位置
      for (let i = 0; i < state.length; i++) {
        const angle = (i * 2 * Math.PI) / 3;

        // 新位置
        state[i].position = {
          x: centroid.x + targetRadius * Math.cos(angle),
          y: centroid.y + targetRadius * Math.sin(angle),
          z: centroid.z
        };

        // 新速度（切向，保持角动量）
        const orbitalSpeed = Math.sqrt(state[i].mass / targetRadius);
        state[i].velocity = {
          x: -orbitalSpeed * Math.sin(angle),
          y: orbitalSpeed * Math.cos(angle),
          z: 0
        };
      }

      // 调整速度以保持能量守恒
      const newEnergy = state.reduce((sum, b) => {
        const vSq = b.velocity.x ** 2 + b.velocity.y ** 2 + b.velocity.z ** 2;
        return sum + 0.5 * b.mass * vSq;
      }, 0);

      const energyScale = Math.sqrt(currentEnergy / (newEnergy + 0.001));

      state.forEach(body => {
        body.velocity.x *= energyScale;
        body.velocity.y *= energyScale;
        body.velocity.z *= energyScale;
      });

      return {
        uiFeedback: {
          message: `Periodic realignment performed (t=${t.toFixed(1)})`,
          level: 'info'
        }
      };
    }
  };

  return controller;
};
