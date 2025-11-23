import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { PhysicsEngine } from './services/physicsEngine';
import { BodyVisual, StarField } from './components/Visuals';
import { Controls } from './components/Controls';
// import { DEFAULT_TIME_STEP, G_CONST } from './constants';
import { BodyState, SimulationStats, ModeId, ParameterMeta } from './types';
import { getModeById } from './modes/registry';
import { getDefaultGlobalParams, GlobalParams } from './parameters/global';

// Inner component to handle the animation loop within Canvas context
const SimulationLoop = ({
  physicsRef,
  bodiesRef,
  statsCacheRef,
  setStats,
  isRunning,
  speed,
  baseTimeStep
}: {
  physicsRef: React.MutableRefObject<PhysicsEngine | null>,
  bodiesRef: React.MutableRefObject<BodyState[]>,
  statsCacheRef: React.MutableRefObject<ReturnType<PhysicsEngine['getStats']> | null>,
  setStats: (s: SimulationStats) => void,
  isRunning: boolean,
  speed: number,
  baseTimeStep: number
}) => {
  const frameCount = useRef(0);

  useFrame((state, delta) => {
    if (!isRunning || !physicsRef.current) return;

    // Run multiple physics steps per frame for stability at higher speeds
    // Clamp substeps to avoid runaway CPU usage at extreme speeds
    const targetFrameDuration = 1 / 60; // baseline for scaling delta
    const effectiveSpeed = speed * (delta / targetFrameDuration);
    const maxSubSteps = 12;
    const steps = Math.min(maxSubSteps, Math.max(1, Math.ceil(effectiveSpeed * 2)));
    const dt = (baseTimeStep * speed * (delta / targetFrameDuration)) / steps;

    for (let i = 0; i < steps; i++) {
      physicsRef.current.step(dt);
    }

    // Sync visualization ref with physics state without creating new arrays
    bodiesRef.current = physicsRef.current.bodies;

    // Update UI stats less frequently (every 20 frames) to save React cycles
    frameCount.current++;
    if (frameCount.current % 20 === 0 && physicsRef.current) {
        const rawStats = statsCacheRef.current || physicsRef.current.getStats();
        statsCacheRef.current = rawStats;

        setStats({
            ...rawStats,
            era: rawStats.habitable ? 'Stable' : 'Chaotic', // Simplified logic
            timeElapsed: state.clock.elapsedTime,
            fps: delta > 0 ? 1 / delta : 0
        });
    }
  });

  return null;
};

// Component to handle camera reset
const CameraController = ({
  bodiesRef,
  resetCameraKey
}: {
  bodiesRef: React.MutableRefObject<BodyState[]>,
  resetCameraKey: number
}) => {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    if (resetCameraKey === 0) return; // Skip initial mount

    const bodies = bodiesRef.current;
    if (bodies.length === 0) return;

    // Calculate bounding box of all bodies
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    bodies.forEach(body => {
      minX = Math.min(minX, body.position.x - body.radius);
      maxX = Math.max(maxX, body.position.x + body.radius);
      minY = Math.min(minY, body.position.y - body.radius);
      maxY = Math.max(maxY, body.position.y + body.radius);
      minZ = Math.min(minZ, body.position.z - body.radius);
      maxZ = Math.max(maxZ, body.position.z + body.radius);
    });

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;

    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;
    const maxSize = Math.max(sizeX, sizeY, sizeZ);

    // Calculate distance to fit all bodies in view
    // Using FOV = 45 degrees
    const distance = maxSize / (2 * Math.tan((45 * Math.PI) / (2 * 180))) + maxSize * 0.5;

    // Position camera at an angle to see all bodies
    const angle = Math.PI / 4; // 45 degrees
    const cameraX = centerX + distance * Math.cos(angle);
    const cameraY = centerY + distance * 0.6;
    const cameraZ = centerZ + distance * Math.sin(angle);

    // Animate camera to new position
    const startPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    const endPos = { x: cameraX, y: cameraY, z: cameraZ };
    const duration = 0.8; // seconds
    let elapsed = 0;

    const animateCamera = () => {
      elapsed += 0.016; // ~60fps
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function (ease-in-out)
      const easeProgress = progress < 0.5 
        ? 2 * progress * progress 
        : -1 + (4 - 2 * progress) * progress;

      camera.position.x = startPos.x + (endPos.x - startPos.x) * easeProgress;
      camera.position.y = startPos.y + (endPos.y - startPos.y) * easeProgress;
      camera.position.z = startPos.z + (endPos.z - startPos.z) * easeProgress;

      if (progress < 1) {
        requestAnimationFrame(animateCamera);
      } else {
        // Ensure final position is exact
        camera.position.set(endPos.x, endPos.y, endPos.z);
      }
    };

    animateCamera();

    // Update orbit controls target
    if (controlsRef.current) {
      controlsRef.current.target.set(centerX, centerY, centerZ);
      controlsRef.current.update();
    }
  }, [resetCameraKey, camera, bodiesRef]);

  return (
    <OrbitControls 
      ref={controlsRef}
      enablePan={true} 
      enableZoom={true} 
      enableRotate={true}
      minDistance={5}
      maxDistance={200}
    />
  );
};

export default function App() {
  const [globalParams, setGlobalParams] = useState<GlobalParams>(getDefaultGlobalParams());
  const [currentPreset, setCurrentPreset] = useState<ModeId>('Figure8');
  const [modeParameterSchema, setModeParameterSchema] = useState<ParameterMeta[]>([]);
  const [modeParams, setModeParams] = useState<Record<string, any>>({});
  const [isRunning, setIsRunning] = useState(true);
  const [simulationSpeed, setSimulationSpeed] = useState(1.0);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [resetKey, setResetKey] = useState(0); // Key to force remount and clear trails
  const [resetCameraKey, setResetCameraKey] = useState(0); // Key to trigger camera reset
  
  const [stats, setStats] = useState<SimulationStats>({
    totalEnergy: 0,
    kineticEnergy: 0,
    potentialEnergy: 0,
    habitable: false,
    era: 'Stable',
    timeElapsed: 0,
    fps: 0
  });

  // We use Refs for the heavy lifting (physics state) to avoid React re-renders on every frame
  const bodiesRef = useRef<BodyState[]>([]);
  const physicsRef = useRef<PhysicsEngine | null>(null);
  const energyStatsRef = useRef<ReturnType<PhysicsEngine['getStats']> | null>(null);

  function defaultsFromSchema(schema: ParameterMeta[]): Record<string, any> {
    const obj: Record<string, any> = {};
    for (const m of schema) obj[m.key] = m.default;
    return obj;
  }

  // Initialize simulation
  const initSimulation = (modeId: ModeId) => {
    const mode = getModeById(modeId);
    const schema = mode.parameters || [];
    setModeParameterSchema(schema);
    const params = defaultsFromSchema(schema);
    setModeParams(params);

    const initialBodies: BodyState[] = mode.createInitialBodies(undefined, params);

    bodiesRef.current = initialBodies;
    const controller = mode.createController ? mode.createController(initialBodies, params) : undefined;
    physicsRef.current = new PhysicsEngine(initialBodies, {
      G: globalParams.G,
      timeStep: globalParams.timeStep,
      softening: globalParams.softening,
      energySampleInterval: 1,
      controller
    });
    setCurrentPreset(modeId);
    
    // Increment resetKey to force remount of BodyVisual components and clear trails
    setResetKey(prev => prev + 1);

    // Reset camera to fit the new scenario
    setResetCameraKey(prev => prev + 1);

    // Reset stats
    if (physicsRef.current) {
        physicsRef.current.setStatsCallback((s) => {
          energyStatsRef.current = s;
        });

        const s = physicsRef.current.getStats();
        energyStatsRef.current = s;
        setStats({ ...s, era: 'Stable', timeElapsed: 0, fps: 60 });
    }
  };

  // Init on mount
  useEffect(() => {
    initSimulation('Figure8');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Calculate trail length based on speed to avoid clutter
  const getTrailLength = (speed: number) => {
      if (speed > 8) return 60;
      if (speed > 5) return 80;
      if (speed > 2) return 120;
      return 200;
  };

  // Handle camera reset
  const handleResetCamera = useCallback(() => {
    setResetCameraKey(prev => prev + 1);
  }, []);

  // Global params handlers
  const handleChangeGlobalParams = useCallback((next: GlobalParams) => {
    setGlobalParams(next);
  }, []);

  const handleApplyGlobalParams = useCallback(() => {
    const mode = getModeById(currentPreset);
    const currentBodies = bodiesRef.current;
    const controller = mode.createController ? mode.createController(currentBodies, modeParams) : undefined;
    physicsRef.current = new PhysicsEngine(currentBodies, {
      G: globalParams.G,
      timeStep: globalParams.timeStep,
      softening: globalParams.softening,
      energySampleInterval: 1,
      controller
    });

    // Force remount visuals (clear trails) and refresh camera target if needed
    setResetKey(prev => prev + 1);

    if (physicsRef.current) {
      physicsRef.current.setStatsCallback((s) => {
        energyStatsRef.current = s;
      });

      const s = physicsRef.current.getStats();
      energyStatsRef.current = s;
      setStats({ ...s, era: 'Stable', timeElapsed: 0, fps: 60 });
    }
  }, [currentPreset, globalParams, modeParams]);

  // Mode params handlers
  const handleChangeModeParams = useCallback((next: Record<string, any>) => {
    setModeParams(next);
  }, []);

  const handleApplyModeParams = useCallback(() => {
    const mode = getModeById(currentPreset);
    if (!physicsRef.current) return;
    const currentBodies = bodiesRef.current;
    const controller = mode.createController ? mode.createController(currentBodies, modeParams) : undefined;
    // hot-swap controller without restarting physics
    (physicsRef.current as any).config.controller = controller;
  }, [currentPreset, modeParams]);

  const bgColor = theme === 'dark' ? '#050505' : '#ffffff';

  return (
    <div className={`w-full h-screen relative overflow-hidden transition-colors duration-500 ${theme === 'dark' ? 'bg-black text-white' : 'bg-white text-black'}`}>
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: true }}>
        <PerspectiveCamera makeDefault position={[0, 0, 40]} fov={45} />
        <color attach="background" args={[bgColor]} />
        
        <ambientLight intensity={theme === 'dark' ? 0.1 : 0.8} />
        {theme === 'light' && <directionalLight position={[10, 10, 5]} intensity={0.5} castShadow />}
        
        <SimulationLoop
          physicsRef={physicsRef}
          bodiesRef={bodiesRef}
          statsCacheRef={energyStatsRef}
          setStats={setStats}
          isRunning={isRunning}
          speed={simulationSpeed}
          baseTimeStep={globalParams.timeStep}
        />

        <group>
           {/* We render based on the initial bodies length. 
               The individual BodyVisual components pull their realtime position from the ref.
               This key includes resetKey to force a full remount when reset is clicked, clearing trails. */}
           {physicsRef.current && physicsRef.current.bodies.map((body, idx) => (
             <BodyVisual 
                key={`${resetKey}-${idx}`} 
                index={idx}
                body={body} 
                simulationRef={bodiesRef} 
                traceLength={getTrailLength(simulationSpeed)}
                theme={theme}
             />
           ))}
        </group>

        <StarField theme={theme} />
        <CameraController 
          bodiesRef={bodiesRef}
          resetCameraKey={resetCameraKey}
        />
      </Canvas>

      <Controls 
        isRunning={isRunning}
        setIsRunning={setIsRunning}
        simulationSpeed={simulationSpeed}
        setSimulationSpeed={setSimulationSpeed}
        resetSimulation={initSimulation}
        currentPreset={currentPreset}
        stats={stats}
        bodies={bodiesRef.current}
        theme={theme}
        setTheme={setTheme}
        onResetCamera={handleResetCamera}
        globalParams={globalParams}
        onChangeGlobalParams={handleChangeGlobalParams}
        onApplyGlobalParams={handleApplyGlobalParams}
        modeParameterSchema={modeParameterSchema}
        modeParams={modeParams}
        onChangeModeParams={handleChangeModeParams}
        onApplyModeParams={handleApplyModeParams}
      />
    </div>
  );
}