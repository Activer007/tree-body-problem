import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Trail, Html, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { BodyState } from '../types';

interface BodyVisualProps {
  body: BodyState;
  simulationRef: React.MutableRefObject<BodyState[]>;
  index: number;
  traceLength: number;
  theme: 'dark' | 'light';
}

const StarMesh: React.FC<{ radius: number; color: string; theme: 'dark' | 'light' }> = ({ radius, color, theme }) => {
  return (
    <group>
        {/* Main Star Body - Using Standard Material with Emissive for safe, realistic glow */}
        <mesh>
            <sphereGeometry args={[radius, 64, 64]} />
            <meshStandardMaterial 
                color={new THREE.Color(color).multiplyScalar(0.8)} 
                emissive={color}
                emissiveIntensity={2.0} 
                toneMapped={false} 
                roughness={0.4}
                metalness={0.1}
            />
        </mesh>

        {/* Inner Glow - subtle gradient */}
        <mesh scale={[1.2, 1.2, 1.2]}>
            <sphereGeometry args={[radius, 32, 32]} />
            <meshBasicMaterial 
                color={color} 
                transparent 
                opacity={0.25} 
                side={THREE.BackSide} 
                depthWrite={false}
                blending={theme === 'dark' ? THREE.AdditiveBlending : THREE.NormalBlending}
            />
        </mesh>

         {/* Outer Corona - larger and fainter */}
        <mesh scale={[2.2, 2.2, 2.2]}>
            <sphereGeometry args={[radius, 32, 32]} />
            <meshBasicMaterial 
                color={color} 
                transparent 
                opacity={theme === 'dark' ? 0.1 : 0.05} 
                depthWrite={false}
                side={THREE.FrontSide}
                blending={theme === 'dark' ? THREE.AdditiveBlending : THREE.NormalBlending}
            />
        </mesh>

        <pointLight
            distance={100}
            decay={2}
            intensity={5} 
            color={color}
        />
    </group>
  );
};

export const BodyVisual: React.FC<BodyVisualProps> = ({ body, simulationRef, index, traceLength, theme }) => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (groupRef.current && simulationRef.current[index]) {
      const currentBody = simulationRef.current[index];
      groupRef.current.position.set(
        currentBody.position.x,
        currentBody.position.y,
        currentBody.position.z
      );
    }
  });

  const trailColor = body.isStar ? body.color : (theme === 'dark' ? '#ffffff' : '#000000');

  return (
    <>
      <group ref={groupRef}>
        {body.isStar ? (
           <StarMesh radius={body.radius} color={body.color} theme={theme} />
        ) : (
           /* PLANET VISUALS */
           <mesh castShadow receiveShadow>
              <sphereGeometry args={[body.radius, 32, 32]} />
              <meshStandardMaterial 
                color={theme === 'dark' ? body.color : '#333333'} 
                roughness={0.7}
                metalness={0.2}
              />
           </mesh>
        )}

        {/* Label */}
        <Html 
            position={[0, body.radius * (body.isStar ? 2.5 : 2.0) + 0.5, 0]} 
            center
            distanceFactor={15}
            zIndexRange={[100, 0]}
            style={{ pointerEvents: 'none' }}
        >
            <div className={`select-none text-xs font-mono px-2 rounded backdrop-blur-sm border whitespace-nowrap transition-colors duration-300
                ${theme === 'dark' 
                  ? 'text-white/80 bg-black/40 border-white/10' 
                  : 'text-black/80 bg-white/40 border-black/10 shadow-sm'
                }`}>
                {body.name}
            </div>
        </Html>
      </group>
      
      <Trail
        width={body.isStar ? 0.8 : 0.2}
        length={traceLength}
        color={new THREE.Color(trailColor)}
        attenuation={(t) => t * t}
        target={groupRef} 
      >
         <mesh position={[0,0,0]} visible={false}><boxGeometry /></mesh>
      </Trail>
    </>
  );
};

export const StarField = ({ theme }: { theme: 'dark' | 'light' }) => {
  return (
    <Sparkles 
      count={3000} 
      scale={120} 
      size={theme === 'dark' ? 1.5 : 1.2} 
      speed={0} 
      opacity={theme === 'dark' ? 0.4 : 0.2} 
      noise={10}
      color={theme === 'dark' ? '#ffffff' : '#1f2937'}
    />
  );
}