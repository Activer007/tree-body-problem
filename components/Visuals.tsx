import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Trail, Html } from '@react-three/drei';
import * as THREE from 'three';
import { BodyState } from '../types';
import { generateStarfield, StarLayerData } from '../services/starfieldGenerator';

// ============================================================================
// 性能优化：Color 对象池，避免每帧创建新对象
// ============================================================================
class ColorPool {
  private pool: THREE.Color[] = [];
  private static instance: ColorPool;

  static getInstance(): ColorPool {
    if (!ColorPool.instance) {
      ColorPool.instance = new ColorPool();
    }
    return ColorPool.instance;
  }

  /**
   * 从池中获取一个 Color 对象，或创建新的
   * @param colorHex 十六进制颜色字符串 (如 '#ff0000')
   */
  acquire(colorHex: string): THREE.Color {
    const color = this.pool.pop() || new THREE.Color();
    color.setStyle(colorHex);
    return color;
  }

  /**
   * 将 Color 对象返回到池中供复用
   */
  release(color: THREE.Color): void {
    this.pool.push(color);
  }

  /**
   * 清空对象池
   */
  clear(): void {
    this.pool = [];
  }
}

interface BodyVisualProps {
  body: BodyState;
  simulationRef: React.MutableRefObject<BodyState[]>;
  index: number;
  traceLength: number;
  theme: 'dark' | 'light';
}

const StarMesh: React.FC<{ radius: number; color: string; theme: 'dark' | 'light' }> = ({ radius, color, theme }) => {
  const gradientTextureRef = useRef<THREE.Texture | null>(null);

  // 创建径向渐变纹理以增强3D效果
  const gradientTexture = useMemo(() => {
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
  }, [color, theme]);

  useEffect(() => {
    gradientTextureRef.current = gradientTexture;

    return () => {
      gradientTextureRef.current?.dispose();
      gradientTextureRef.current = null;
    };
  }, [gradientTexture]);

  const appliedGradientTexture = gradientTextureRef.current ?? gradientTexture;

  // 判断是否为黄色恒星（用于light主题下添加轮廓）
  // 黄色恒星包括：Sun A, Alpha, Star A，颜色通常为 #ffaa00, #ffcc00 , #ff6c00
  const isYellowStar = color.toLowerCase() === '#ffaa00' || color.toLowerCase() === '#ffcc00';
  const outlineColor = isYellowStar && theme === 'light' ? '#ff6c00' : null; // 深橙色轮廓

  return (
    <group>
        {/* Main Star Body - Using Standard Material with Emissive for safe, realistic glow */}
        <mesh>
            <sphereGeometry args={[radius, 32, 32]} />
            <meshStandardMaterial
                color={new THREE.Color(color).multiplyScalar(0.8)}
                emissive={color}
                emissiveMap={appliedGradientTexture}
                emissiveIntensity={2.5}
                toneMapped={false}
                roughness={0.3}
                metalness={0.05}
            />
        </mesh>

        {/* 黄色恒星在light主题下的深橙色轮廓 */}
        {outlineColor && (
          <mesh scale={[1.08, 1.08, 1.08]}>
            <sphereGeometry args={[radius, 32, 32]} />
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

        {/* 合并光晕层 - 使用着色器实现多层效果 */}
        <mesh scale={[1.4, 1.4, 1.4]}>
            <sphereGeometry args={[radius, 24, 24]} />
            <meshBasicMaterial 
                color={color} 
                transparent 
                opacity={theme === 'dark' ? 0.15 : 0.08} 
                depthWrite={false}
                side={THREE.BackSide}
                blending={THREE.AdditiveBlending}
            />
        </mesh>

        {/* 外层光晕 - 大范围柔光 */}
        <mesh scale={[2.5, 2.5, 2.5]}>
            <sphereGeometry args={[radius, 20, 20]} />
            <meshBasicMaterial 
                color={color} 
                transparent 
                opacity={theme === 'dark' ? 0.1 : 0.1} 
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

  // ============================================================================
  // 性能优化：使用 useMemo 缓存颜色计算和 Color 对象
  // 避免每次渲染都创建新的 THREE.Color 对象
  // ============================================================================
  const { planetColor, trailColor } = useMemo(() => {
    // 行星颜色：以蓝色为主（参照地球风格）
    // 深色主题：白色与蓝色相间混合
    const darkPlanetColor = body.isStar ? body.color : '#2563eb'; // 深色主题用更亮的蓝色
    const lightPlanetColor = new THREE.Color('#1e40af').lerp(new THREE.Color('#3b82f6'), 0.4);
    lightPlanetColor.offsetHSL(0, 0.1, 0.12);
    const planetColorStr = theme === 'dark' ? darkPlanetColor : lightPlanetColor.getStyle();

    const trailColorStr = body.isStar ? body.color : (theme === 'dark' ? '#e0f2fe' : '#0ea5e9');

    return {
      planetColor: planetColorStr,
      trailColor: trailColorStr
    };
  }, [body.isStar, body.color, theme]);

  // ============================================================================
  // 性能优化：从对象池获取 Trail 颜色，避免每帧创建新对象
  // ============================================================================
  const cachedTrailColor = useMemo(() => {
    const pool = ColorPool.getInstance();
    return pool.acquire(trailColor);
  }, [trailColor]);

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
                <sphereGeometry args={[body.radius, 32, 32]} />
                <meshStandardMaterial
                  color={planetColor}
                  roughness={0.6}
                  metalness={0.15}
                  emissive={theme === 'dark' ? '#1e3a8a' : '#e0f2fe'}
                  emissiveIntensity={theme === 'dark' ? 0.5 : 0.1}
                />
             </mesh>
             
             {/* 合并光晕效果 */}
             <mesh scale={[1.15, 1.15, 1.15]}>
                <sphereGeometry args={[body.radius, 24, 24]} />
                <meshBasicMaterial
                  color={theme === 'dark' ? '#60a5fa' : '#7dd3fc'}
                  transparent
                  opacity={theme === 'dark' ? 0.2 : 0.1}
                  side={THREE.BackSide}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                />
             </mesh>
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
      
      {/* ========================================================================
          性能优化：Trail 组件
          - 使用缓存的 Color 对象，避免每帧创建新对象
          - 使用 useMemo 缓存 attenuation 函数，避免每次渲染都创建新函数
          ======================================================================== */}
      <Trail
        width={body.isStar ? 1.6 : 0.8}
        length={traceLength}
        color={cachedTrailColor}
        attenuation={useMemo(() => (t: number) => t * t, [])}
        target={groupRef} 
      >
         <mesh position={[0,0,0]} visible={false}><boxGeometry /></mesh>
      </Trail>
    </>
  );
};

const starVertexShader = `
  uniform float uTime;
  uniform float uParallax;
  uniform float uPixelRatio;
  attribute float size;
  attribute float twinkleSpeed;
  attribute float twinklePhase;
  attribute float twinkleAmplitude;
  attribute vec3 drift;
  attribute vec3 color;
  varying vec3 vColor;

  void main() {
    vec3 animatedPosition = position + drift * uTime;
    vec4 mvPosition = modelViewMatrix * vec4(animatedPosition, 1.0);
    float twinkle = sin(uTime * twinkleSpeed + twinklePhase) * twinkleAmplitude;
    float distanceFalloff = max(0.1, -mvPosition.z);
    float pointSize = (size + twinkle) * (1.0 + uParallax) * 30.0;
    gl_PointSize = max(1.0, pointSize * uPixelRatio / distanceFalloff);
    gl_Position = projectionMatrix * mvPosition;
    vColor = color;
  }
`;

const starFragmentShader = `
  uniform float uThemeMix;
  varying vec3 vColor;

  void main() {
    float dist = length(gl_PointCoord - vec2(0.5));
    float alpha = smoothstep(0.5, 0.0, dist);
    vec3 lightTint = vec3(0.96, 0.98, 1.0);
    vec3 finalColor = mix(vColor, mix(lightTint, vec3(1.0), 0.35), uThemeMix);
    float finalAlpha = alpha * mix(0.85, 0.6, uThemeMix);
    gl_FragColor = vec4(finalColor, finalAlpha);
  }
`;

const createLayerGeometry = (layer: StarLayerData) => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(layer.positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(layer.colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(layer.sizes, 1));
  geometry.setAttribute('twinkleSpeed', new THREE.BufferAttribute(layer.twinkleSpeed, 1));
  geometry.setAttribute('twinklePhase', new THREE.BufferAttribute(layer.twinklePhase, 1));
  geometry.setAttribute('twinkleAmplitude', new THREE.BufferAttribute(layer.twinkleAmplitude, 1));
  geometry.setAttribute('drift', new THREE.BufferAttribute(layer.drift, 3));
  return geometry;
};

const createLayerUniforms = (layer: StarLayerData) => ({
  uTime: { value: 0 },
  uParallax: { value: layer.parallaxFactor },
  uPixelRatio: { value: typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1 },
  uThemeMix: { value: 0 }
});

const StarLayerPoints: React.FC<{ layer: StarLayerData; theme: 'dark' | 'light' }> = ({ layer, theme }) => {
  const geometry = useMemo(() => createLayerGeometry(layer), [layer]);
  const uniforms = useMemo(() => createLayerUniforms(layer), [layer]);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  useFrame((_, delta) => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uTime.value += delta;
    const targetMix = theme === 'light' ? 1 : 0;
    const lerpFactor = Math.min(delta * 5, 1);
    materialRef.current.uniforms.uThemeMix.value = THREE.MathUtils.lerp(
      materialRef.current.uniforms.uThemeMix.value,
      targetMix,
      lerpFactor
    );
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={starVertexShader}
        fragmentShader={starFragmentShader}
        transparent
        depthWrite={false}
        depthTest
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

export const StarField: React.FC<{ theme: 'dark' | 'light'; seed?: number }> = ({ theme, seed }) => {
  const starfieldData = useMemo(() => generateStarfield(seed ? { seed } : undefined), [seed]);

  return (
    <group>
      {starfieldData.layers.map((layer) => (
        <StarLayerPoints key={layer.id} layer={layer} theme={theme} />
      ))}
    </group>
  );
};
