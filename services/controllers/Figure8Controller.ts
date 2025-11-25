import { BodyState, StabilityController } from '../../types';
import { analyzeStability, computeDistance, computeAngularMomentum } from '../stabilityAnalyzer';

// ============================================================================
// Figure8 稳定性控制器
// 专为 Figure8 预设设计，保持 8 字形轨道的数学精度
// ============================================================================

interface Figure8ControllerState {
  initialAngularMomentum: Vector3 | null;
  energyDriftCount: number;
  maxEnergyDeviation: number;
}

interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/**
 * 创建一个 Figure8 专用稳定性控制器
 * 监控关键指标：角动量、能量、8字形完整性
 */
export const createFigure8Controller = (): StabilityController => {
  const controllerState: Figure8ControllerState = {
    initialAngularMomentum: null,
    energyDriftCount: 0,
    maxEnergyDeviation: 0
  };

  const controller: StabilityController = {
    onBeforeStep: (state: BodyState[], t: number, dt: number) => {
      // 只在特定时间点进行详细分析（避免性能开销）
      if (Math.floor(t) % 5 > dt) return;

      // 第一次调用时记录初始值
      if (!controllerState.initialAngularMomentum) {
        controllerState.initialAngularMomentum = computeAngularMomentum(state);
      }

      // 分析系统稳定性
      const stability = analyzeStability(state);

      // 监控角动量守恒
      const currentAngularMomentum = computeAngularMomentum(state);
      const initialL = controllerState.initialAngularMomentum;

      const LxDiff = Math.abs(currentAngularMomentum.x - initialL.x) / (Math.abs(initialL.x) + 0.001);
      const LyDiff = Math.abs(currentAngularMomentum.y - initialL.y) / (Math.abs(initialL.y) + 0.001);
      const LzDiff = Math.abs(currentAngularMomentum.z - initialL.z) / (Math.abs(initialL.z) + 0.001);

      const maxAngularMomentumDiff = Math.max(LxDiff, LyDiff, LzDiff);

      // 如果角动量偏离超过 5%，进行警告
      if (maxAngularMomentumDiff > 0.05) {
        return {
          uiFeedback: {
            message: `Angular momentum deviation: ${(maxAngularMomentumDiff * 100).toFixed(1)}%`,
            level: 'warning',
            action: 'Consider reducing time step'
          }
        };
      }

      // 监控能量守恒
      if (stability.energyDeviation > 0.05) {
        controllerState.energyDriftCount++;
        controllerState.maxEnergyDeviation = Math.max(
          controllerState.maxEnergyDeviation,
          stability.energyDeviation
        );

        // 如果能量持续漂移，调整参数
        if (controllerState.energyDriftCount > 3) {
          return {
            paramOverrides: {
              timeStep: Math.max(dt * 0.7, 0.0005),  // 减小时间步长
              softening: Math.min(0.02, 0.01 * 1.2)   // 轻微增加软碰撞
            },
            uiFeedback: {
              message: `Energy drift detected (${(stability.energyDeviation * 100).toFixed(1)}%). Adjusting parameters.`,
              level: 'info',
              action: 'Automatically reduced time step'
            }
          };
        }
      } else {
        // 能量稳定，重置计数
        controllerState.energyDriftCount = Math.max(0, controllerState.energyDriftCount - 1);
      }

      // 监控 8 字形完整性（检查轨道交叉）
      const stars = state.filter(b => b.isStar);
      if (stars.length >= 3) {
        // 检查三颗主恒星是否保持一定的间距模式
        const dist01 = computeDistance(stars[0], stars[1]);
        const dist12 = computeDistance(stars[1], stars[2]);
        const dist20 = computeDistance(stars[2], stars[0]);

        // 在 8 字形轨道中，距离应该有周期性变化
        // 如果所有距离都持续增大，可能开始扩散
        if (dist01 > 30 && dist12 > 30 && dist20 > 30) {
          return {
            uiFeedback: {
              message: 'Figure-8 pattern may be breaking apart',
              level: 'warning',
              action: 'Monitor for stabilization'
            }
          };
        }
      }

      return;
    }
  };

  return controller;
};

/**
 * 创建角动量修正控制器（更激进的保护模式）
 * 直接应用微小修正来保持角动量
 */
export const createFigure8MomentumController = (): StabilityController => {
  const controllerState = {
    initialAngularMomentum: null as Vector3 | null,
    lastCorrectionTime: 0
  };

  const controller: StabilityController = {
    onBeforeStep: (state: BodyState[], t: number, dt: number) => {
      // 记录初始角动量
      if (!controllerState.initialAngularMomentum) {
        controllerState.initialAngularMomentum = computeAngularMomentum(state);
        return;
      }

      // 每 10 秒应用一次修正
      if (t - controllerState.lastCorrectionTime < 10) return;

      const currentAngularMomentum = computeAngularMomentum(state);
      const targetL = controllerState.initialAngularMomentum;

      // 计算角动量偏差
      const dLx = targetL.x - currentAngularMomentum.x;
      const dLy = targetL.y - currentAngularMomentum.y;
      const dLz = targetL.z - currentAngularMomentum.z;

      const correctionStrength = 0.001;  // 非常小，避免破坏系统

      // 生成速度修正（Δv = ΔL / (m * r)）
      const correctionController: (state: BodyState[], t: number) => Vector3[] =
        (state) => {
          return state.map(body => {
            // 简化修正：根据距离分配修正量
            const r = Math.sqrt(body.position.x ** 2 + body.position.y ** 2 + body.position.z ** 2);
            if (r < 0.001) return { x: 0, y: 0, z: 0 };

            return {
              x: (dLx / body.mass / r) * correctionStrength,
              y: (dLy / body.mass / r) * correctionStrength,
              z: (dLz / body.mass / r) * correctionStrength
            };
          });
        };

      controllerState.lastCorrectionTime = t;

      return {
        controller: correctionController,
        uiFeedback: {
          message: `Applied angular momentum correction`,
          level: 'info'
        }
      };
    }
  };

  return controller;
};
