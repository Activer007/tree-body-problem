# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个使用 React + Three.js + TypeScript 构建的三体问题交互式模拟器。该项目使用 Vite 作为构建工具，通过 @react-three/fiber 在 React 中渲染 3D 场景，实现了高性能的 N 体引力物理模拟。

## 常用命令

### 开发
```bash
npm run dev          # 启动开发服务器 (localhost:3000)
npm run build        # 构建生产版本
npm run preview      # 预览生产构建
npm install          # 安装依赖
```

## 核心架构

### 文件结构
- `App.tsx` - 主应用组件，包含 Canvas 渲染和状态管理
- `services/physicsEngine.ts` - 自定义物理引擎，使用 RK4 积分算法
- `components/` - React 组件
  - `Controls.tsx` - UI 控制面板
  - `Visuals.tsx` - 3D 可视化组件
- `types.ts` - TypeScript 类型定义
- `constants.ts` - 物理常量和预设场景

### 技术栈
- **前端**: React 19 + TypeScript
- **3D 渲染**: Three.js + @react-three/fiber + @react-three/drei
- **构建工具**: Vite
- **UI**: Tailwind CSS (内联样式)
- **图标**: Lucide React

### 物理引擎设计
- 使用 RK4 (Runge-Kutta 4th order) 积分算法进行精确的 N 体模拟
- 内存优化的缓冲区系统，避免 GC 压力
- 支持软碰撞参数防止奇点
- 实时计算能量、动能、势能和宜居带

### 组件架构
- `SimulationLoop` - 内部组件处理动画循环，避免每帧重新渲染
- 使用 useRef 存储物理状态，避免不必要的 React 重渲染
- `BodyVisual` - 渲染单个天体，包含轨迹、光晕效果
- `StarField` - 背景星空

### 预设场景系统
- `Figure8` - 稳定的 8 字形轨道
- `Hierarchical` - 层次系统（类似日-地-月）
- `ChaoticEjection` - 混沌弹射场景
- `Random` - 动态生成的随机场景

### 性能优化要点
- 物理计算与渲染分离，使用 refs 避免重渲染
- 预分配内存缓冲区，减少 GC 开销
- 帧率限制和统计更新频率控制
- 轨迹长度根据模拟速度动态调整

## 开发注意事项

### 物理参数
- `G_CONST = 1.0` - 标准化引力常数
- `DEFAULT_TIME_STEP = 0.01` - 默认时间步长
- 软碰撞参数 `softening = 0.15` 防止距离过近时的数值问题

### Three.js 集成
- 使用 @react-three/fiber 的 Canvas 包装器
- PerspectiveCamera 默认位置 [0,0,40]，FOV 45度
- OrbitControls 支持缩放(5-200)、旋转、平移

### 主题系统
- 支持深色/浅色主题切换
- 影响背景色、光照强度、材质混合模式
- 使用 Tailwind 类名进行样式管理