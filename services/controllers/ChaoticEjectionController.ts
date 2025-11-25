import { BodyState, StabilityController } from '../../types';
import {
  analyzeStability,
  computeMaximumPairwiseDistance,
  computeTwoBodyEnergy,
  computeDistance
} from '../stabilityAnalyzer';

// ============================================================================
// ChaoticEjection 稳定性控制器
// 三阶段监视：稳定相互作用期、能量交换期、弹射检测期
// ============================================================================

type EjectionPhase = 'stable-interaction' | 'energy-exchange' | 'ejection-possible' | 'post-ejection';

interface ChaoticState {
  phase: EjectionPhase;
  ejectedBodies: Set<string>;
  initialMaxDistance: number;
  energyExchangeRate: number;
  lastEnergy: number;
  closeEncounterCount: Map<string, number>;
}

/**
 * 分析当前系统相态
 */
const analyzePhase = (state: BodyState[], maxDistance: number, ejectedBodies: Set<string>): EjectionPhase => {
  // 如果已经有天体被弹射，进入后弹射阶段
  if (ejectedBodies.size >= 1) {
    return 'post-ejection';
  }

  // 检测弹射可能（距离阈值）
  if (maxDistance > 100) {
    return 'ejection-possible';
  }

  // 检测能量交换期
  if (maxDistance > 50) {
    return 'energy-exchange';
  }

  return 'stable-interaction';
};

/**
 * 检测是否发生了弹射事件
 * 使用距离 + 能量双标准
 */
const detectEjection = (
  allBodies: BodyState[],
  currentMaxDistance: number,
  ejectedBodies: Set<string>
): Array<{ body: BodyState; pairedWith: BodyState }> =>  {
  const ejectedPairs: Array<{ body: BodyState; pairedWith: BodyState }> = [];

  // 距离必须足够大
  if (currentMaxDistance < 80) return ejectedPairs;

  // 检查所有双体组合
  for (let i = 0; i < allBodies.length; i++) {
    for (let j = i + 1; j < allBodies.length; j++) {
      const body1 = allBodies[i];
      const body2 = allBodies[j];
      const distance = computeDistance(body1, body2);

      // 距离大的对
      if (distance > 80) {
        // 计算双体能量
        const twoBodyEnergy = computeTwoBodyEnergy(body1, body2);

        // 如果能量 > 0，是非束缚态，确认弹射
        if (twoBodyEnergy > 0) {
          // 找到哪个是逃逸体（速度更高的）
          const v1 = Math.sqrt(
            body1.velocity.x ** 2 + body1.velocity.y ** 2 + body1.velocity.z ** 2
          );
          const v2 = Math.sqrt(
            body2.velocity.x ** 2 + body2.velocity.y ** 2 + body2.velocity.z ** 2
          );

          const faster = v1 > v2 ? body1 : body2;
          const slower = v1 > v2 ? body2 : body1;

          ejectedPairs.push({ body: faster, pairedWith: slower });
        }
      }
    }
  }

  return ejectedPairs;
};

/**
 * 检测近距离接触事件
 */
const detectCloseEncounters = (
  state: BodyState[],
  existingCount: Map<string, number>
): { encounters: number; details: Map<string, number> } => {
  const details = new Map<string, number>();
  let totalEncounters = 0;

  for (let i = 0; i < state.length; i++) {
    for (let j = i + 1; j < state.length; j++) {
      const distance = computeDistance(state[i], state[j]);

      // 近距离接触：距离 < 3
      if (distance < 3) {
        const pairKey = `${state[i].name}-${state[j].name}`;
        const currentCount = existingCount.get(pairKey) || 0;

        details.set(pairKey, currentCount + 1);
        totalEncounters++;
      }
    }
  }

  return { encounters: totalEncounters, details };
};

/**
 * 创建 ChaoticEjection 专用稳定性控制器
 */
export const createChaoticEjectionController = (): StabilityController => {
  const controllerState: ChaoticState = {
    phase: 'stable-interaction',
    ejectedBodies: new Set(),
    initialMaxDistance: 15,  // 初始最大距离（配置依赖）
    energyExchangeRate: 0,
    lastEnergy: 0,
    closeEncounterCount: new Map()
  };

  const controller: StabilityController = {
    onBeforeStep: (state: BodyState[], t: number, dt: number) => {
      // 初始化能量
      if (controllerState.lastEnergy === 0) {
        const initialStability = analyzeStability(state);
        controllerState.lastEnergy = initialStability.totalEnergy;
        return;
      }

      // 计算当前稳定性
      const stability = analyzeStability(state, controllerState.lastEnergy);
      const maxDistance = computeMaximumPairwiseDistance(state);

      // 更新相态
      const previousPhase = controllerState.phase;
      controllerState.phase = analyzePhase(state, maxDistance, controllerState.ejectedBodies);

      // 相态变化时的通知
      if (controllerState.phase !== previousPhase) {
        const phaseMessages = {
          'stable-interaction': 'System in stable interaction phase',
          'energy-exchange': 'High energy exchange detected',
          'ejection-possible': 'Ejection highly likely',
          'post-ejection': 'Ejection confirmed'
        };

        return {
          uiFeedback: {
            message: `Phase transition: ${phaseMessages[controllerState.phase]}`,
            level: controllerState.phase === 'ejection-possible' || controllerState.phase === 'post-ejection'
              ? 'critical'
              : 'info'
          }
        };
      }

      // 阶段 1: 稳定相互作用期 (t < 20，主要看能量守恒)
      if (t < 20) {
        // 计算能量变化率
        controllerState.energyExchangeRate = Math.abs(
          (stability.totalEnergy - controllerState.lastEnergy) / dt
        );

        // 如果能量变化过快，警告
        if (controllerState.energyExchangeRate > 0.1) {
          return {
            paramOverrides: {
              timeStep: Math.max(dt * 0.5, 0.002)  // 更精细的时间步长
            },
            uiFeedback: {
              message: `Rapid energy exchange: ${controllerState.energyExchangeRate.toFixed(3)}
`,
              level: 'warning'
            }
          };
        }
      }

      // 阶段 2: 检测近距离接触事件
      if (t > 10 && t < 100) {
        const { encounters, details } = detectCloseEncounters(state, controllerState.closeEncounterCount);

        // 更新计数
        details.forEach((count, pair) => {
          controllerState.closeEncounterCount.set(pair, count);
        });

        // 如果近距离接触频繁，调整软碰撞
        if (encounters > 0) {
          return {
            paramOverrides: {
              softening: Math.min(0.3, 0.15 * 1.2)  // 增加软碰撞保护
            },
            uiFeedback: {
              message: `Close encounters: ${encounters}`,
              level: encounters > 2 ? 'warning' : 'info'
            }
          };
        }
      }

      // 阶段 3: 弹射检测期 (t >= 20)
      if (t >= 20) {
        const ejectedPairs = detectEjection(state, maxDistance, controllerState.ejectedBodies);

        if (ejectedPairs.length > 0) {
          // 记录弹射的天体
          ejectedPairs.forEach(({ body }) => {
            controllerState.ejectedBodies.add(body.name);
          });

          // 自动降低模拟速度，便于观察弹射轨迹
          return {
            paramOverrides: {
              timeStep: Math.min(dt, 0.003),  // 更小的时间步长追踪弹射
              softening: 0.05                  // 降低软碰撞，保持轨迹精度
            },
            uiFeedback: {
              message: `Ejection detected: ${ejectedPairs.map(p => p.body.name).join(', ')}`,
              level: 'critical',
              action: 'Simulation slowed for observation'
            }
          };
        }
      }

      // 阶段 4: 后弹射阶段
      if (controllerState.ejectedBodies.size >= 1) {
        // 剩余系统通常是稳定的双星系统
        // 可以恢复正常参数
        if (Math.floor(t) % 30 < dt) {
          return {
            uiFeedback: {
              message: `Post-ejection: ${controllerState.ejectedBodies.size} body(ies) ejected`,
              level: 'info',
              action: `Remaining system likely stable`
            }
          };
        }
      }

      // 更新上次记录
      controllerState.lastEnergy = stability.totalEnergy;

      return;
    }
  };

  return controller;
};

/**
 * 创建高速监视器
 * 当模拟速度 > 1x 时，自动增加子步长
 */
export const createHighSpeedMonitor = (simulationSpeed: number): StabilityController => {
  const controller: StabilityController = {
    onBeforeStep: (state: BodyState[], t: number, dt: number) => {
      // 仅在高速模拟时介入
      if (simulationSpeed <= 1) return;

      // 当速度 > 4x 时，强制更小的步长
      if (simulationSpeed > 4) {
        return {
          paramOverrides: {
            timeStep: Math.min(dt * 0.5, 0.003)  // 更精细的步长
          },
          uiFeedback: {
            message: `High simulation speed (${simulationSpeed}x) - enhanced precision`,
            level: 'info'
          }
        };
      }

      return;
    }
  };

  return controller;
};

/**
 * 创建弹射事件记录器
 * 记录弹射事件的详细信息
 */
export const createEjectionRecorder = (): StabilityController => {
  const ejectionLog: Array<{
    time: number;
    body: string;
    velocity: number;
    pairedWith: string;
  }> = [];

  const controller: StabilityController = {
    onBeforeStep: (state: BodyState[], t: number, dt: number) => {
      // 检测弹射
      const maxDistance = computeMaximumPairwiseDistance(state);

      if (maxDistance > 100) {
        for (let i = 0; i < state.length; i++) {
          for (let j = i + 1; j < state.length; j++) {
            const distance = computeDistance(state[i], state[j]);

            if (distance > 100) {
              const twoBodyEnergy = computeTwoBodyEnergy(state[i], state[j]);

              if (twoBodyEnergy > 0) {
                const v1 = Math.sqrt(
                  state[i].velocity.x ** 2 + state[i].velocity.y ** 2 + state[i].velocity.z ** 2
                );
                const v2 = Math.sqrt(
                  state[j].velocity.x ** 2 + state[j].velocity.y ** 2 + state[j].velocity.z ** 2
                );

                const faster = v1 > v2 ? state[i] : state[j];
                const slower = v1 > v2 ? state[j] : state[i];

                // 记录
                ejectionLog.push({
                  time: t,
                  body: faster.name,
                  velocity: Math.max(v1, v2),
                  pairedWith: slower.name
                });

                console.log(
                  `[Ejection Record] Time: ${t.toFixed(2)}, Body: ${faster.name}, ` +
                  `Velocity: ${Math.max(v1, v2).toFixed(2)}, Paired: ${slower.name}`
                );
              }
            }
          }
        }
      }

      return;
    }
  };

  return controller;
};
