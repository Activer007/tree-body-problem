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

const StarMesh: React.FC<{ radius: number; color: string; name: string; theme: 'dark' | 'light' }> = ({ radius, color, name, theme }) => {
  // 创建径向渐变纹理以增强3D效果
  const createRadialGradientTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    
    // 创建径向渐变：中心亮，边缘暗
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 180);
    gradient.addColorStop(0.1, 'rgba(255, 255, 255, 0.5)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.5)');
    gradient.addColorStop(0.9, 'rgba(255, 255, 255, 0.9)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
    
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  };

  const gradientTexture = createRadialGradientTexture();

  // 判断是否为黄色恒星（用于light主题下添加轮廓）
  // 黄色恒星包括：Sun A, Alpha, Star A，颜色通常为 #ffaa00, #ffcc00 , #ff6c00
  const isYellowStar = color.toLowerCase() === '#ffaa00' || color.toLowerCase() === '#ffcc00';
  const outlineColor = isYellowStar && theme === 'light' ? '#ff6c00' : null; // 深橙色轮廓

  return (
    <group>
        {/* Main Star Body - Using Standard Material with Emissive for safe, realistic glow */}
        <mesh>
            <sphereGeometry args={[radius, 64, 64]} />
            <meshStandardMaterial 
                color={new THREE.Color(color).multiplyScalar(0.8)} 
                emissive={color}
                emissiveIntensity={2.5} 
                toneMapped={false} 
                roughness={0.3}
                metalness={0.05}
            />
        </mesh>

        {/* 黄色恒星在light主题下的深橙色轮廓 */}
        {outlineColor && (
          <mesh scale={[1.08, 1.08, 1.08]}>
            <sphereGeometry args={[radius, 64, 64]} />
            <meshBasicMaterial 
              color={outlineColor}
              transparent 
              opacity={0.6}
              side={THREE.BackSide}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        )}

        {/* 中心高亮层 - 体现球心亮度 */}
        <mesh scale={[1.05, 1.05, 1.05]}>
            <sphereGeometry args={[radius, 32, 32]} />
            <meshBasicMaterial 
                color={color} 
                transparent 
                opacity={0.95} 
                side={THREE.BackSide} 
                depthWrite={false}
                blending={THREE.AdditiveBlending}
            />
        </mesh>

        {/* 径向渐变层 - 增强3D效果 */}
        <mesh scale={[1.15, 1.15, 1.15]}>
            <sphereGeometry args={[radius, 32, 32]} />
            <meshBasicMaterial 
                map={gradientTexture}
                transparent 
                opacity={0.4} 
                side={THREE.BackSide} 
                depthWrite={false}
                blending={THREE.AdditiveBlending}
            />
        </mesh>

        {/* 内层光晕 - 柔和过渡 */}
        <mesh scale={[1.4, 1.4, 1.4]}>
            <sphereGeometry args={[radius, 32, 32]} />
            <meshBasicMaterial 
                color={color} 
                transparent 
                opacity={theme === 'dark' ? 0.15 : 0.08} 
                depthWrite={false}
                side={THREE.BackSide}
                blending={THREE.AdditiveBlending}
            />
        </mesh>

        {/* 中层光晕 - 扩展光线 */}
        <mesh scale={[1.8, 1.8, 1.8]}>
            <sphereGeometry args={[radius, 32, 32]} />
            <meshBasicMaterial 
                color={color} 
                transparent 
                opacity={theme === 'dark' ? 0.08 : 0.04} 
                depthWrite={false}
                side={THREE.BackSide}
                blending={THREE.AdditiveBlending}
            />
        </mesh>

        {/* 外层光晕 - 大范围柔光 */}
        <mesh scale={[2.5, 2.5, 2.5]}>
            <sphereGeometry args={[radius, 32, 32]} />
            <meshBasicMaterial 
                color={color} 
                transparent 
                opacity={theme === 'dark' ? 0.1 : 0.1} 
                depthWrite={false}
                side={THREE.BackSide}
                blending={THREE.AdditiveBlending}
            />
        </mesh>

        {/* 极外层光晕 - 非常柔和的外光 */}
        <mesh scale={[3.5, 3.5, 3.5]}>
            <sphereGeometry args={[radius, 16, 16]} />
            <meshBasicMaterial 
                color={color} 
                transparent 
                opacity={theme === 'dark' ? 0.06 : 0.03} 
                depthWrite={false}
                side={THREE.BackSide}
                blending={THREE.AdditiveBlending}
            />
        </mesh>

        {/* 强化点光源 - 增加照亮周围的效果 */}
        <pointLight
            distance={150}
            decay={2}
            intensity={8} 
            color={color}
        />
    </group>
  );
};

export const BodyVisual: React.FC<BodyVisualProps> = ({ body, simulationRef, index, traceLength, theme }) => {
  const groupRef = useRef<THREE.Group>(null);

  // 行星颜色：以蓝色为主（参照地球风格）
  // 深色主题：白色与蓝色相间混合
  const darkPlanetColor = body.isStar ? body.color : '#2563eb'; // 深色主题用更亮的蓝色
  const lightPlanetColor = new THREE.Color('#1e40af').lerp(new THREE.Color('#3b82f6'), 0.4);
  lightPlanetColor.offsetHSL(0, 0.1, 0.12);
  const planetColor = theme === 'dark' ? darkPlanetColor : lightPlanetColor.getStyle();

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

  const trailColor = body.isStar ? body.color : (theme === 'dark' ? '#e0f2fe' : '#0ea5e9');

  return (
    <>
      <group ref={groupRef}>
        {body.isStar ? (
           <StarMesh radius={body.radius} color={body.color} theme={theme} />
        ) : (
           /* PLANET VISUALS - 地球风格蓝色行星 */
           <>
             {/* 主体球体 */}
             <mesh castShadow receiveShadow>
                <sphereGeometry args={[body.radius, 64, 64]} />
                <meshStandardMaterial
                  color={planetColor}
                  roughness={0.6}
                  metalness={0.15}
                  emissive={theme === 'dark' ? '#1e3a8a' : '#e0f2fe'}
                  emissiveIntensity={theme === 'dark' ? 0.5 : 0.1}
                />
             </mesh>
             
             {/* 白色与蓝色相间的纹理层（仅深色主题） */}
             {theme === 'dark' && (
               <mesh scale={[1.02, 1.02, 1.02]}>
                  <sphereGeometry args={[body.radius, 64, 64]} />
                  <meshBasicMaterial
                    color="#ffffff"
                    transparent
                    opacity={0.25}
                    side={THREE.FrontSide}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                  />
               </mesh>
             )}
             
             {/* 大气光晕效果 */}
             <mesh scale={[1.15, 1.15, 1.15]}>
                <sphereGeometry args={[body.radius, 32, 32]} />
                <meshBasicMaterial
                  color={theme === 'dark' ? '#60a5fa' : '#7dd3fc'}
                  transparent
                  opacity={theme === 'dark' ? 0.2 : 0.1}
                  side={THREE.BackSide}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                />
             </mesh>
             
             {/* 外层白色光晕（仅深色主题） */}
             {theme === 'dark' && (
               <mesh scale={[1.3, 1.3, 1.3]}>
                  <sphereGeometry args={[body.radius, 32, 32]} />
                  <meshBasicMaterial
                    color="#ffffff"
                    transparent
                    opacity={0.08}
                    side={THREE.BackSide}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                  />
               </mesh>
             )}
           </>
        )}

        {/* Label */}
        <Html 
            position={[0, body.radius * (body.isStar ? 2.5 : 2.0) + 0.5, 0]} 
            center
            distanceFactor={15}
            zIndexRange={[100, 0]}
            style={{ pointerEvents: 'none' }}
        >
            <div className={`select-none text-sm font-mono px-2 rounded backdrop-blur-sm border whitespace-nowrap transition-colors duration-300
                ${theme === 'dark'
                  ? 'text-white bg-black/50 border-white/10 shadow-sm'
                  : 'text-gray-900 bg-white/85 border-gray-200 shadow-md'
                }`}>
                {body.name}
            </div>
        </Html>
      </group>
      
      <Trail
        width={body.isStar ? 1.6 : 0.8}
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
      size={theme === 'dark' ? 1.5 : 1.3}
      speed={0}
      opacity={theme === 'dark' ? 0.4 : 0.28}
      noise={10}
      color={theme === 'dark' ? '#ffffff' : '#94a3b8'}
    />
  );
}