/**
 * Memory Overhead Benchmark
 * Tests memory usage patterns
 */

import { MemoryEngine } from '../core/engine.js';
import {
  measureMemory,
  printHeader,
  formatBytes,
  type MemoryResult,
} from './utils.js';

const SIZES = [100, 500, 1000, 2000, 5000];

function generateContent(words: number): string {
  const dict = ['user', 'prefers', 'dark', 'mode', 'TypeScript', 'React', 'code', 'test', 'project', 'data'];
  return Array.from({ length: words }, () => dict[Math.floor(Math.random() * dict.length)]).join(' ');
}

export async function runMemoryBenchmarks(): Promise<{
  results: MemoryResult[];
  perMemory: number;
}> {
  const results: MemoryResult[] = [];

  printHeader('Memory Overhead Tests');

  // Test 1: Memory Growth by Size
  console.log('\n📝 Test 1: Memory Growth by Data Size');
  console.log('─'.repeat(60));

  const baseline = measureMemory();
  console.log(`  Baseline Heap: ${formatBytes(baseline.heapUsed)}`);

  for (const size of SIZES) {
    const engine = new MemoryEngine({ storage: 'memory' });
    await engine.init();

    const before = measureMemory();

    for (let i = 0; i < size; i++) {
      await engine.remember(generateContent(20), {
        type: 'fact',
        entities: ['Entity' + (i % 20)],
      });
    }

    const after = measureMemory();
    const delta = after.heapUsed - before.heapUsed;
    const perMemory = delta / size;

    results.push({
      name: `${size} memories`,
      heapUsed: after.heapUsed,
      heapTotal: after.heapTotal,
      external: after.external,
      rss: after.rss,
      delta,
    });

    console.log(`  ${size.toString().padStart(5)} memories: ${formatBytes(delta).padStart(12)} (${formatBytes(perMemory)}/mem)`);

    engine.close();
  }

  // Test 2: Memory with Different Content Sizes
  console.log('\n📝 Test 2: Memory by Content Size');
  console.log('─'.repeat(60));

  const contentSizes = [10, 50, 100, 200, 500]; // words
  const memoriesPerTest = 500;

  for (const contentSize of contentSizes) {
    const engine = new MemoryEngine({ storage: 'memory' });
    await engine.init();

    const before = measureMemory();

    for (let i = 0; i < memoriesPerTest; i++) {
      await engine.remember(generateContent(contentSize), { type: 'fact' });
    }

    const after = measureMemory();
    const delta = after.heapUsed - before.heapUsed;

    console.log(`  ${contentSize.toString().padStart(3)} words/mem: ${formatBytes(delta).padStart(12)} (${formatBytes(delta / memoriesPerTest)}/mem)`);

    engine.close();
  }

  // Test 3: Entity Impact on Memory
  console.log('\n📝 Test 3: Entity Impact on Memory');
  console.log('─'.repeat(60));

  const entityCounts = [0, 1, 3, 5, 10];
  const testCount = 500;

  for (const entityCount of entityCounts) {
    const engine = new MemoryEngine({ storage: 'memory' });
    await engine.init();

    const before = measureMemory();

    for (let i = 0; i < testCount; i++) {
      const entities = Array.from({ length: entityCount }, (_, j) => `Entity${i % 10}_${j}`);
      await engine.remember(generateContent(20), {
        type: 'fact',
        entities,
      });
    }

    const after = measureMemory();
    const delta = after.heapUsed - before.heapUsed;

    console.log(`  ${entityCount.toString().padStart(2)} entities/mem: ${formatBytes(delta).padStart(12)} (${formatBytes(delta / testCount)}/mem)`);

    engine.close();
  }

  // Calculate average per-memory overhead
  const engine = new MemoryEngine({ storage: 'memory' });
  await engine.init();
  const beforeFinal = measureMemory();
  
  for (let i = 0; i < 1000; i++) {
    await engine.remember(generateContent(20), {
      type: 'fact',
      entities: ['Entity' + (i % 10)],
    });
  }
  
  const afterFinal = measureMemory();
  const perMemory = (afterFinal.heapUsed - beforeFinal.heapUsed) / 1000;
  engine.close();

  console.log('\n📊 Summary');
  console.log('─'.repeat(60));
  console.log(`  Average memory per memory: ${formatBytes(perMemory)}`);

  return { results, perMemory };
}
