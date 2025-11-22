import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { PhysicsEngine } from './services/physicsEngine';
import { BodyVisual, StarField } from './components/Visuals';
import { Controls } from './components/Controls';
import { PRESETS, DEFAULT_TIME_STEP, G_CONST, generateRandomScenario } from './constants';
import { BodyState, SimulationStats, PresetName } from './types';

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

    // Update UI stats less frequently (every 10 frames) to save React cycles
    frameCount.current++;
    if (frameCount.current % 10 === 0 && physicsRef.current) {
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

export default function App() {
  const [currentPreset, setCurrentPreset] = useState<PresetName>('Figure8');
  const [isRunning, setIsRunning] = useState(true);
  const [simulationSpeed, setSimulationSpeed] = useState(1.0);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  
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
      softening: 0.15,
      energySampleInterval: 1
    });
    setCurrentPreset(presetName);

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
  // High speed = shorter trail history
  const getTrailLength = (speed: number) => {
      if (speed > 8) return 40;
      if (speed > 5) return 80;
      if (speed > 2) return 150;
      return 300;
  };

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
               This key={currentPreset} forces a full remount of the scene when preset changes. */}
           {physicsRef.current && physicsRef.current.bodies.map((body, idx) => (
             <BodyVisual 
                key={`${currentPreset}-${idx}`} 
                index={idx}
                body={body} 
                simulationRef={bodiesRef} 
                traceLength={getTrailLength(simulationSpeed)}
                theme={theme}
             />
           ))}
        </group>

        <StarField theme={theme} />
        <OrbitControls 
          enablePan={true} 
          enableZoom={true} 
          enableRotate={true}
          minDistance={5}
          maxDistance={200}
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
      />
    </div>
  );
}