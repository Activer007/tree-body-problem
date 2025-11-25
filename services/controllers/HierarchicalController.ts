import { BodyState, StabilityController } from '../../types';
import {
  analyzeStability,
  computeDistance,
  computeHillSphere,
  computeOrbitalSpeed
} from '../stabilityAnalyzer';

// ============================================================================
// Hierarchical 稳定性控制器
// 保护层级轨道结构，监控卫星稳定性
// ============================================================================

interface HierarchyNode {
  body: BodyState;
  parent: HierarchyNode | null;
  children: HierarchyNode[];
  orbitalRadius: number;
  hillSphereRadius: number;
}

interface HierarchicalControllerState {
  hierarchy: HierarchyNode | null;
  ejectionWarnings: Map<string, number>;
  orbitalDrifts: Map<string, { initialRadius: number; currentRadius: number }>;
}

/**
 * 构建层级结构树
 * 按照质量和距离关系识别中心体和卫星
 */
const buildHierarchy = (bodies: BodyState[]): HierarchyNode => {
  // 按质量排序，最重的作为根
  const sorted = [...bodies].sort((a, b) => b.mass - a.mass);

  // 假设最重的是主星
  const primary = sorted[0];
  const root: HierarchyNode = {
    body: primary,
    parent: null,
    children: [],
    orbitalRadius: 0,
    hillSphereRadius: Infinity
  };

  // 为每个其他天体分配父体
  for (let i = 1; i < sorted.length; i++) {
    const body = sorted[i];
    let parent = root;
    let minDist = computeDistance(body, primary);

    // 检查是否有更合适的父体（例如 Sun C 绕 Sun B）
    for (let j = 1; j < i; j++) {
      const potentialParent = sorted[j];
      const dist = computeDistance(body, potentialParent);

      // 如果比其他候选父体近很多，考虑为次级层级
      if (dist < minDist * 0.3) {
        // 找到对应的节点
        // 简化处理：直接设为最高级父体
        break;
      }
    }

    const distance = computeDistance(body, parent.body);
    const hillRadius = computeHillSphere(body, parent.body, distance);

    const node: HierarchyNode = {
      body: body,
      parent: parent,
      children: [],
      orbitalRadius: distance,
      hillSphereRadius: hillRadius
    };

    parent.children.push(node);
  }

  return root;
};

/**
 * 检测卫星弹射风险
 * 返回风险等级 0-1
 */
const detectEjectionRisk = (
  satellite: BodyState,
  parent: BodyState,
  currentDistance: number,
  initialDistance: number
): number => {
  // 如果距离显著增大，风险增加
  const distanceRatio = currentDistance / initialDistance;
  if (distanceRatio > 3) return 0.9;
  if (distanceRatio > 2) return 0.6;
  if (distanceRatio > 1.5) return 0.3;

  // 检查相对速度和束缚能
  const relVelSq =
    (satellite.velocity.x - parent.velocity.x) ** 2 +
    (satellite.velocity.y - parent.velocity.y) ** 2 +
    (satellite.velocity.z - parent.velocity.z) ** 2;

  const escapeVelSq = 2 * (1.0) * parent.mass / currentDistance;

  if (relVelSq > escapeVelSq * 0.8) return 0.8;
  if (relVelSq > escapeVelSq * 0.5) return 0.4;

  return 0;
};

/**
 * 创建 Hierarchical 专用稳定性控制器
 */
export const createHierarchicalController = (): StabilityController => {
  const controllerState: HierarchicalControllerState = {
    hierarchy: null,
    ejectionWarnings: new Map(),
    orbitalDrifts: new Map()
  };

  const controller: StabilityController = {
    onBeforeStep: (state: BodyState[], t: number, dt: number) => {
      // 第一次调用时构建层级结构
      if (!controllerState.hierarchy) {
        controllerState.hierarchy = buildHierarchy(state);

        // 记录初始轨道半径
        const traverse = (node: HierarchyNode) => {
          if (node.parent) {
            controllerState.orbitalDrifts.set(node.body.name, {
              initialRadius: computeDistance(node.body, node.parent.body),
              currentRadius: computeDistance(node.body, node.parent.body)
            });
          }
          node.children.forEach(traverse);
        };
        traverse(controllerState.hierarchy);

        return;
      }

      // 每 8 秒评估一次（避免开销）
      if (Math.floor(t) % 8 > dt) return;

      // 遍历层级检测稳定性
      const traverse = (node: HierarchyNode): Array<{ body: string; risk: number; issue: string }> => {
        const warnings: Array<{ body: string; risk: number; issue: string }> = [];

        for (const child of node.children) {
          if (child.parent) {
            const currentDistance = computeDistance(child.body, child.parent.body);
            const drift = controllerState.orbitalDrifts.get(child.body.name);

            if (drift) {
              // 更新当前半径
              drift.currentRadius = currentDistance;

              // 检测弹射风险
              const ejectionRisk = detectEjectionRisk(
                child.body,
                child.parent.body,
                currentDistance,
                drift.initialRadius
              );

              if (ejectionRisk > 0.5) {
                warnings.push({
                  body: child.body.name,
                  risk: ejectionRisk,
                  issue: `High ejection risk (${(ejectionRisk * 100).toFixed(0)}%)`
                });

                // 更新警告计数
                const currentWarnings = controllerState.ejectionWarnings.get(child.body.name) || 0;
                controllerState.ejectionWarnings.set(child.body.name, currentWarnings + 1);
              }

              // 检测轨道半径过度漂移
              const driftRatio = currentDistance / drift.initialRadius;
              if (driftRatio > 1.5 || driftRatio < 0.7) {
                warnings.push({
                  body: child.body.name,
                  risk: 0.4,
                  issue: `Orbital drift: ${(driftRatio * 100 - 100).toFixed(0)}%`
                });
              }
            }
          }

          // 递归检查子节点
          warnings.push(...traverse(child));
        }

        return warnings;
      };

      const warnings = traverse(controllerState.hierarchy);

      // 如果有高风险警告，调整参数
      const highRiskCount = warnings.filter(w => w.risk > 0.6).length;
      if (highRiskCount > 0) {
        return {
          paramOverrides: {
            timeStep: Math.max(dt * 0.6, 0.002),  // 减小时间步长提高精度
            softening: Math.min(0.3, 0.15 * (1 + highRiskCount * 0.2))  // 增加软碰撞
          },
          uiFeedback: {
            message: `${highRiskCount} satellite(s) at ejection risk`,
            level: 'warning',
            action: 'Auto-adjusted time step and softening'
          }
        };
      }

      // 如果持续警告，考虑更激进的校正
      const totalWarnings = controllerState.ejectionWarnings.size;
      if (totalWarnings >= 3 && Math.floor(t) % 20 < dt) {
        return {
          uiFeedback: {
            message: 'Persistent orbital instability detected',
            level: 'critical',
            action: 'Recommendation: Check initial conditions or reduce simulation speed'
          }
        };
      }

      return;
    }
  };

  return controller;
};

/**
 * 创建希尔球可视化控制器
 * 返回标记超出希尔球范围的天体
 */
export const createHillSphereMonitor = (): StabilityController => {
  const controller: StabilityController = {
    onBeforeStep: (state: BodyState[], t: number, dt: number) => {
      // 每 15 秒检查一次
      if (Math.floor(t) % 15 > dt) return;

      // 找到主星（最重）
      const primary = state.reduce((max, b) => (b.mass > max.mass ? b : max), state[0]);
      const satelliteStates: Array<{ name: string; inHillSphere: boolean; distance: number }> = [];

      // 检查每个卫星
      for (const body of state) {
        if (body === primary) continue;

        const distance = computeDistance(body, primary);

        // 简化希尔球计算（假设圆形轨道）
        const hillSphere = computeHillSphere(body, primary, distance);

        // 检查是否接近希尔球边界
        const ratio = distance / hillSphere;

        satelliteStates.push({
          name: body.name,
          inHillSphere: ratio <= 1.0,
          distance
        });

        if (ratio > 0.8 && ratio <= 1.0) {
          // 接近边界
          return {
            uiFeedback: {
              message: `${body.name} near Hill sphere boundary`,
              level: 'warning',
              action: `Distance: ${distance.toFixed(1)}, Hill radius: ${hillSphere.toFixed(1)}`
            }
          };
        }

        if (ratio > 1.0) {
          // 超出希尔球
          return {
            uiFeedback: {
              message: `${body.name} outside Hill sphere (ejected)`,
              level: 'critical',
              action: `Consider resetting simulation`
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
 * 创建渐进轨道校正器
 * 轻微调整速度以保持轨道稳定
 */
export const createOrbitalCorrectionController = (correctionStrength = 0.01): StabilityController => {
  const controller: StabilityController = {
    onBeforeStep: (state: BodyState[], t: number, dt: number) => {
      // 每 12 秒应用一次校正
      if (Math.floor(t) % 12 > dt) return;

      const primary = state.reduce((max, b) => (b.mass > max.mass ? b : max), state[0]);

      // 生成速度校正
      const correctionController = (bodies: BodyState[], t: number) => {
        return bodies.map(body => {
          if (body === primary) return { x: 0, y: 0, z: 0 };

          const distance = computeDistance(body, primary);
          const requiredSpeed = computeOrbitalSpeed(body, primary.mass, distance);

          // 当前切向速度
          const dx = body.position.x - primary.position.x;
          const dy = body.position.y - primary.position.y;
          const r = Math.sqrt(dx * dx + dy * dy);

          if (r < 0.001) return { x: 0, y: 0, z: 0 };

          const currentSpeed = Math.abs(
            body.velocity.x * (-dy / r) + body.velocity.y * (dx / r)
          );

          // 速度差
          const speedDiff = requiredSpeed - currentSpeed;

          return {
            x: (-dy / r) * speedDiff * correctionStrength,
            y: (dx / r) * speedDiff * correctionStrength,
            z: 0
          };
        });
      };

      return {
        controller: correctionController,
        uiFeedback: {
          message: 'Applied orbital stability correction',
          level: 'info'
        }
      };
    }
  };

  return controller;
};
