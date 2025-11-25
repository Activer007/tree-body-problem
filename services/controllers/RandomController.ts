import { BodyState } from '../../types';
import type { Vector3 } from '../../types';
import {
  computeEnergy,
  computeVirialRatio,
  computeMinimumPairwiseDistance,
  computeMaximumPairwiseDistance,
  analyzeStability,
  computeDistanceRaw
} from '../stabilityAnalyzer';
import { generateDistantPosition, createBody } from '../../constants';

// ==============================================================================
// Random 稳定性控制器
// 生成时质量控制：基于物理约束过滤不稳定配置
// ==============================================================================

interface RandomConfig {
  minStarDistance: number;
  minPlanetDistance: number;
  virialRatioRange: [number, number];
  massRange: [number, number];
  speedRange: [number, number];
  maxAttempts: number;
}

/**
 * 验证随机配置的质量
 * 基于多维度物理约束
 */
export const validateRandomConfiguration = (
  bodies: BodyState[],
  config: RandomConfig
): {
  valid: boolean;
  reason?: string;
  virialRatio?: number;
  minDistance?: number;
  rocheLobeViolations?: string[];
} => {
  // 计算能量和位力比率
  const energy = computeEnergy(bodies);
  const virialRatio = computeVirialRatio(energy.kineticEnergy, energy.potentialEnergy);

  // 检查位力比率是否在合理范围内
  if (virialRatio > config.virialRatioRange[1]) {
    return {
      valid: false,
      reason: `Too much kinetic energy: ${virialRatio.toFixed(2)}`,
      virialRatio
    };
  }

  if (virialRatio < config.virialRatioRange[0]) {
    return {
      valid: false,
      reason: `Too little kinetic energy: ${virialRatio.toFixed(2)}`,
      virialRatio
    };
  }

  // 检查最小距离
  const minDistance = computeMinimumPairwiseDistance(bodies);
  if (minDistance < config.minStarDistance * 0.8) {
    return {
      valid: false,
      reason: `Bodies too close: ${minDistance.toFixed(2)} < ${config.minStarDistance}`,
      minDistance,
      virialRatio
    };
  }

  // 检查洛希瓣（适用于质量相近且距离近的双星）
  const rocheLobeViolations: string[] = [];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const b1 = bodies[i];
      const b2 = bodies[j];
      const distance = computeMinimumPairwiseDistance([b1, b2]);

      // 质量相近（差异 < 30%）且距离近的恒星
      if (
        distance < 8 &&
        b1.isStar &&
        b2.isStar &&
        Math.abs(b1.mass - b2.mass) / (b1.mass + b2.mass) < 0.3
      ) {
        rocheLobeViolations.push(`${b1.name}-${b2.name}`);
      }
    }
  }

  if (rocheLobeViolations.length > 0) {
    return {
      valid: false,
      reason: 'Roche lobe overflow risk',
      rocheLobeViolations
    };
  }

  return {
    valid: true,
    virialRatio,
    minDistance
  };
};

/**
 * 增强的随机场景生成器
 * 包含质量筛选和物理约束验证
 */
export const generateRandomScenarioWithValidation = (
  seed: number = Math.random(),
  config: RandomConfig = {
    minStarDistance: 12,
    minPlanetDistance: 8,
    virialRatioRange: [0.4, 1.5],
    massRange: [9, 14],  // 集中在中间，避免极端值
    speedRange: [0.08, 0.22],  // 物理合理的速度范围
    maxAttempts: 15
  }
): {
  bodies: BodyState[];
  attempts: number;
  validation: { valid: boolean; virialRatio: number };
} => {
  const colors = ['#ffaa00', '#00aaff', '#ff4444'];
  const positions: [number, number, number][] = [];

  let attempts = 0;
  let bodies: BodyState[] = [];
  let validation: { valid: boolean; virialRatio: number } = { valid: false, virialRatio: 0 };

  // 尝试生成有效的配置
  do {
    bodies = [];
    positions.length = 0;

    // 生成 3 颗恒星
    for (let i = 0; i < 3; i++) {
      // 生成位置，保持最小距离
      let pos: [number, number, number];
      let attempts = 0;
      do {
        pos = [
          (Math.random() - 0.5) * 24,
          (Math.random() - 0.5) * 24,
          (Math.random() - 0.5) * 24
        ];
        attempts++;
      } while (
        attempts < 50 &&
        positions.some(existing => {
          const dx = pos[0] - existing[0];
          const dy = pos[1] - existing[1];
          const dz = pos[2] - existing[2];
          return Math.sqrt(dx * dx + dy * dy + dz * dz) < config.minStarDistance;
        })
        );

      positions.push(pos);

      // 生成质量（集中在中间范围，避免极端值）
      const mass = config.massRange[0] + Math.random() * (config.massRange[1] - config.massRange[0]);

      // 基于平均距离计算基础速度（v ≈ sqrt(GM/r)）
      const avgDist = positions.reduce((sum, p, idx) => {
        if (idx === positions.length - 1) return sum; // 跳过当前
        const dx = pos[0] - p[0];
        const dy = pos[1] - p[1];
        const dz = pos[2] - p[2];
        return sum + Math.sqrt(dx * dx + dy * dy + dz * dz);
      }, 0) / (positions.length - 1 || 1);

      const baseSpeed = Math.sqrt(mass / (avgDist + 0.001)) * (0.6 + Math.random() * 0.6);

      // 球坐标随机方向
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      const speed = config.speedRange[0] + Math.random() * (config.speedRange[1] - config.speedRange[0]);

      bodies.push(
        createBody(`Star ${String.fromCharCode(65 + i)}`, mass, pos, [
          speed * Math.sin(phi) * Math.cos(theta),
          speed * Math.sin(phi) * Math.sin(theta),
          speed * Math.cos(phi)
        ], colors[i])
      );
    }

    // 生成行星
    const planetPos = generateDistantPosition(positions, config.minPlanetDistance);

    // 找到最近的恒星作为宿主
    const nearestStar = bodies.reduce(
      (min, b, idx) => {
        if (!b.isStar) return min;
        const dist = computeDistanceRaw(planetPos, b.position);
        return dist < min.dist ? { star: b, dist } : min;
      },
      { star: bodies[0], dist: Infinity }
    ).star;

    const starDist = computeDistanceRaw(planetPos, nearestStar.position);
    const planetSpeed = Math.sqrt(nearestStar.mass / (starDist + 0.001)) * (0.8 + Math.random() * 0.4);

    bodies.push(
      createBody(
        'Planet',
        0.01,
        planetPos,
        [
          planetSpeed * (Math.random() - 0.5) * 2,
          planetSpeed * (Math.random() - 0.5) * 2,
          planetSpeed * (Math.random() - 0.5) * 0.5
        ],
        '#ffffff',
        false
      )
    );

    // 验证配置
    { const v = validateRandomConfiguration(bodies, config); validation = { valid: v.valid, virialRatio: v.virialRatio ?? 0 }; }
    attempts++;

    // 如果有效或达到最大尝试次数，退出
    if (validation.valid || attempts >= config.maxAttempts) {
      break;
    }
  } while (true);

  return {
    bodies,
    attempts,
    validation
  };
};

/**
 * 运行时动态监视器
 * 在模拟过程中监控系统演化
 */
export const createRandomRuntimeMonitor = (): {
  controller: any;
  captureInterestingConfiguration: (state: BodyState[]) => void;
} => {
  const capturedConfigs: Array<{ time: number; state: BodyState[]; metrics: any }> = [];

  const controller = {
    onBeforeStep: (state: BodyState[], t: number, dt: number) => {
      // 每 5 单位时间评估一次
      if (Math.floor(t) % 5 > dt) return;

      const stability = analyzeStability(state);

      // 检查位力比率是否稳定
      if (Math.abs(stability.virialRatio - 1) > 0.5) {
        return {
          paramOverrides: {
            timeStep: Math.max(dt * 0.6, 0.003),
            softening: Math.min(0.3, 0.15 * (1 + Math.abs(stability.virialRatio - 1) * 0.4))
          },
          uiFeedback: {
            message: `Virial ratio unstable: ${stability.virialRatio.toFixed(2)}`,
            level: 'warning'
          }
        };
      }

      // 检查空间扩散过快（可能即将弹射）
      const spread = stability.spatialSpread;
      if (spread > 20) { // 阈值可调
        captureInterestingConfiguration(state);

        return {
          uiFeedback: {
            message: `Rapid spatial spread detected: ${spread.toFixed(1)}`,
            level: 'warning',
            action: 'Unstable configuration auto-saved'
          }
        };
      }

      // 检查长期漂移
      if (stability.energyDeviation > 0.15) {
        return {
          paramOverrides: {
            softening: Math.min(0.4, 0.15 * (1 + stability.energyDeviation))
          },
          uiFeedback: {
            message: `Energy drift: ${(stability.energyDeviation * 100).toFixed(1)}%`,
            level: 'warning'
          }
        };
      }

      return;
    }
  };

  const captureInterestingConfiguration = (state: BodyState[]) => {
    const metrics = analyzeStability(state);
    capturedConfigs.push({
      time: 0, // 实际时间
      state: state.map(b => ({ ...b })),
      metrics
    });

    console.log(
      `Interesting configuration captured! Energy: ${metrics.totalEnergy.toFixed(2)}, ` +
      `Virial: ${metrics.virialRatio.toFixed(2)}, Spread: ${metrics.spatialSpread.toFixed(2)}`
    );

    // 限制记录数量
    if (capturedConfigs.length > 5) {
      capturedConfigs.shift(); // 移除最早的
    }
  };

  return { controller, captureInterestingConfiguration };
};


