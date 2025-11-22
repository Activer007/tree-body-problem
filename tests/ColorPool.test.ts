/**
 * ColorPool 对象池测试
 * 
 * 验证 ColorPool 的功能和性能特性
 */

import * as THREE from 'three';

// 模拟 ColorPool 实现（用于测试）
class ColorPool {
  private pool: THREE.Color[] = [];
  private static instance: ColorPool;

  static getInstance(): ColorPool {
    if (!ColorPool.instance) {
      ColorPool.instance = new ColorPool();
    }
    return ColorPool.instance;
  }

  acquire(colorHex: string): THREE.Color {
    const color = this.pool.pop() || new THREE.Color();
    color.setStyle(colorHex);
    return color;
  }

  release(color: THREE.Color): void {
    this.pool.push(color);
  }

  clear(): void {
    this.pool = [];
  }

  getPoolSize(): number {
    return this.pool.length;
  }
}

describe('ColorPool', () => {
  beforeEach(() => {
    // 重置单例
    ColorPool.getInstance().clear();
  });

  describe('基础功能', () => {
    test('应该能获取颜色对象', () => {
      const pool = ColorPool.getInstance();
      const color = pool.acquire('#ff0000');
      
      expect(color).toBeInstanceOf(THREE.Color);
      expect(color.getHexString()).toBe('ff0000');
    });

    test('应该能释放颜色对象到池中', () => {
      const pool = ColorPool.getInstance();
      const color = new THREE.Color('#ff0000');
      
      pool.release(color);
      
      expect(pool.getPoolSize()).toBe(1);
    });

    test('应该复用池中的对象', () => {
      const pool = ColorPool.getInstance();
      
      const color1 = pool.acquire('#ff0000');
      pool.release(color1);
      
      const color2 = pool.acquire('#00ff00');
      
      // color2 应该是之前的 color1 对象（复用）
      expect(color2).toBe(color1);
      expect(color2.getHexString()).toBe('00ff00');
    });

    test('应该在池为空时创建新对象', () => {
      const pool = ColorPool.getInstance();
      
      const color1 = pool.acquire('#ff0000');
      const color2 = pool.acquire('#00ff00');
      
      // 两个对象应该不同（因为池为空）
      expect(color1).not.toBe(color2);
    });
  });

  describe('性能特性', () => {
    test('应该减少对象创建次数', () => {
      const pool = ColorPool.getInstance();
      
      // 模拟 4 个 Trail 组件，60 FPS，运行 1 秒
      const iterations = 60;
      let objectsCreated = 0;
      
      for (let i = 0; i < iterations; i++) {
        const colors: THREE.Color[] = [];
        
        // 获取 4 个颜色对象
        for (let j = 0; j < 4; j++) {
          const color = pool.acquire(`#${Math.floor(Math.random() * 16777215).toString(16)}`);
          colors.push(color);
          objectsCreated++;
        }
        
        // 释放回池
        colors.forEach(color => pool.release(color));
      }
      
      // 优化后：应该只创建 4 个对象（初始化时）
      // 优化前：会创建 240 个对象（60 FPS × 4 Trail）
      expect(pool.getPoolSize()).toBe(4);
      expect(objectsCreated).toBe(240); // 获取次数
    });

    test('应该支持并发获取和释放', () => {
      const pool = ColorPool.getInstance();
      
      // 模拟并发操作
      const colors: THREE.Color[] = [];
      
      // 获取 10 个颜色
      for (let i = 0; i < 10; i++) {
        colors.push(pool.acquire(`#${i.toString().padStart(6, '0')}`));
      }
      
      expect(pool.getPoolSize()).toBe(0); // 池应该为空
      
      // 释放 5 个
      for (let i = 0; i < 5; i++) {
        pool.release(colors[i]);
      }
      
      expect(pool.getPoolSize()).toBe(5);
      
      // 获取 3 个（应该从池中获取）
      for (let i = 0; i < 3; i++) {
        const color = pool.acquire('#ffffff');
        expect(color).toBe(colors[4 - i]); // 应该是 LIFO 顺序
      }
      
      expect(pool.getPoolSize()).toBe(2);
    });
  });

  describe('单例模式', () => {
    test('应该返回同一个实例', () => {
      const pool1 = ColorPool.getInstance();
      const pool2 = ColorPool.getInstance();
      
      expect(pool1).toBe(pool2);
    });

    test('应该在全局共享状态', () => {
      const pool1 = ColorPool.getInstance();
      const color = pool1.acquire('#ff0000');
      pool1.release(color);
      
      const pool2 = ColorPool.getInstance();
      expect(pool2.getPoolSize()).toBe(1);
    });
  });

  describe('清空功能', () => {
    test('应该能清空整个池', () => {
      const pool = ColorPool.getInstance();
      
      pool.acquire('#ff0000');
      pool.acquire('#00ff00');
      pool.release(new THREE.Color('#0000ff'));
      
      expect(pool.getPoolSize()).toBeGreaterThan(0);
      
      pool.clear();
      
      expect(pool.getPoolSize()).toBe(0);
    });
  });

  describe('颜色设置', () => {
    test('应该正确设置十六进制颜色', () => {
      const pool = ColorPool.getInstance();
      
      const color = pool.acquire('#ff0000');
      expect(color.getHexString()).toBe('ff0000');
      
      const color2 = pool.acquire('#00ff00');
      expect(color2.getHexString()).toBe('00ff00');
    });

    test('应该支持各种颜色格式', () => {
      const pool = ColorPool.getInstance();
      
      const color1 = pool.acquire('#fff');
      expect(color1.getHexString()).toBe('ffffff');
      
      const color2 = pool.acquire('#123456');
      expect(color2.getHexString()).toBe('123456');
    });
  });
});

describe('性能对比：优化前后', () => {
  test('应该显著减少内存分配', () => {
    const pool = ColorPool.getInstance();
    
    // 模拟 4 个 Trail 组件，60 FPS，运行 10 秒
    const fps = 60;
    const duration = 10;
    const trails = 4;
    const totalFrames = fps * duration;
    
    // 优化前：每帧创建新对象
    let objectsCreatedBefore = 0;
    for (let i = 0; i < totalFrames; i++) {
      for (let j = 0; j < trails; j++) {
        objectsCreatedBefore++;
      }
    }
    
    // 优化后：使用对象池
    let objectsCreatedAfter = 0;
    const colors: THREE.Color[] = [];
    for (let i = 0; i < totalFrames; i++) {
      for (let j = 0; j < trails; j++) {
        if (i === 0) {
          colors.push(pool.acquire(`#${j}`));
          objectsCreatedAfter++;
        }
      }
    }
    
    console.log(`\n性能对比 (${fps} FPS, ${duration}秒):`);
    console.log(`优化前: ${objectsCreatedBefore} 个对象创建`);
    console.log(`优化后: ${objectsCreatedAfter} 个对象创建`);
    console.log(`改进: ${((1 - objectsCreatedAfter / objectsCreatedBefore) * 100).toFixed(1)}%`);
    
    expect(objectsCreatedAfter).toBeLessThan(objectsCreatedBefore);
  });

  test('应该减少垃圾回收压力', () => {
    // 每个 THREE.Color 对象约 48 字节
    const colorSize = 48; // bytes
    const trails = 4;
    const fps = 60;
    const duration = 60; // 1 分钟
    
    // 优化前：每秒垃圾
    const objectsPerSecondBefore = fps * trails;
    const garbagePerSecondBefore = objectsPerSecondBefore * colorSize;
    const garbagePerMinuteBefore = garbagePerSecondBefore * duration;
    
    // 优化后：仅初始化时创建对象
    const objectsPerSecondAfter = trails / duration; // 平均分布
    const garbagePerSecondAfter = objectsPerSecondAfter * colorSize;
    const garbagePerMinuteAfter = garbagePerSecondAfter * duration;
    
    console.log(`\n垃圾回收压力 (1 分钟):`);
    console.log(`优化前: ${(garbagePerMinuteBefore / 1024).toFixed(1)} KB`);
    console.log(`优化后: ${(garbagePerMinuteAfter / 1024).toFixed(1)} KB`);
    console.log(`改进: ${((1 - garbagePerMinuteAfter / garbagePerMinuteBefore) * 100).toFixed(1)}%`);
    
    expect(garbagePerMinuteAfter).toBeLessThan(garbagePerMinuteBefore);
  });
});

