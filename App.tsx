import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { PhysicsEngine } from './services/physicsEngine';
import { BodyVisual, StarField } from './components/Visuals';
import { Controls } from './components/Controls';
import { PRESETS, DEFAULT_TIME_STEP, G_CONST, generateRandomScenario } from './constants';
import { BodyState, SimulationStats, PresetName } from './types';
import * as THREE from 'three';

// Inner component to handle the animation loop within Canvas context
const SimulationLoop = ({
  physicsRef,
  bodiesRef,
  statsCacheRef,
  setStats,
  isRunning,
  speed
}: {
  physicsRef: React.MutableRefObject<PhysicsEngine | null>,
  bodiesRef: React.MutableRefObject<BodyState[]>,
  statsCacheRef: React.MutableRefObject<ReturnType<PhysicsEngine['getStats']> | null>,
  setStats: (s: SimulationStats) => void,
  isRunning: boolean,
  speed: number
}) => {
  const frameCount = useRef(0);

  useFrame((state, delta) => {
    if (!isRunning || !physicsRef.current) return;

    // Run multiple physics steps per frame for stability at higher speeds
    // Maximum time per frame to avoid "spiral of death" is usually capped
    const steps = Math.ceil(speed * 2); 
    const dt = (DEFAULT_TIME_STEP * speed) / steps;

    for (let i = 0; i < steps; i++) {
      physicsRef.current.step(dt);
    }

    // Sync visualization ref with physics state
    bodiesRef.current = [...physicsRef.current.bodies];

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
  const [currentPreset, setCurrentPreset] = useState<PresetName>('Figure8');
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

  // Initialize simulation
  const initSimulation = useCallback((presetName: PresetName) => {
    let initialBodies: BodyState[];

    if (presetName === 'Random') {
        // Dynamically generate new random bodies each time
        initialBodies = generateRandomScenario();
    } else {
        const preset = PRESETS.find(p => p.name === presetName) || PRESETS[0];
        initialBodies = JSON.parse(JSON.stringify(preset.bodies)); // Deep copy
    }
    
    bodiesRef.current = initialBodies;
    physicsRef.current = new PhysicsEngine(initialBodies, {
      G: G_CONST,
      timeStep: DEFAULT_TIME_STEP,
      softening: 0.08,
      energySampleInterval: 1
    });
    setCurrentPreset(presetName);
    
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
  }, []);

  // Init on mount
  useEffect(() => {
    initSimulation('Figure8');
  }, [initSimulation]);

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
      />
    </div>
  );
}