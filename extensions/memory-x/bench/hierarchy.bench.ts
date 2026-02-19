/**
 * Hierarchy Operations Benchmark
 * Tests four-level memory hierarchy operations
 */

import { MemoryEngine } from '../core/engine.js';
import {
  runBenchmark,
  printResult,
  printHeader,
  type BenchmarkResult,
} from './utils.js';

export async function runHierarchyBenchmarks(): Promise<{
  results: BenchmarkResult[];
}> {
  const results: BenchmarkResult[] = [];

  printHeader('Hierarchy Operations Tests');

  // Test 1: Remember Operation (Full Hierarchy)
  console.log('\n📝 Test 1: Remember Operation (Full Hierarchy)');
  const engine1 = new MemoryEngine({ storage: 'memory' });
  await engine1.init();

  const rememberResult = await runBenchmark(
    'Remember (4-level hierarchy)',
    async () => {
      await engine1.remember('User prefers TypeScript for frontend development', {
        type: 'preference',
        confidence: 0.9,
        entities: ['User', 'TypeScript', 'Frontend'],
      });
    },
    100,
    10
  );
  results.push(rememberResult);
  printResult(rememberResult);

  engine1.close();

  // Test 2: Recall Operation
  console.log('\n📝 Test 2: Recall Operation');
  const engine2 = new MemoryEngine({ storage: 'memory' });
  await engine2.init();

  // Populate with test data
  for (let i = 0; i < 500; i++) {
    await engine2.remember(`Test memory ${i} with various content about programming`, {
      type: 'fact',
      entities: ['Test'],
    });
  }

  const recallResult = await runBenchmark(
    'Recall (500 memories)',
    async () => {
      await engine2.recall('programming test');
    },
    50,
    5
  );
  results.push(recallResult);
  printResult(recallResult);

  engine2.close();

  // Test 3: Reflect Operation
  console.log('\n📝 Test 3: Reflect Operation');
  const engine3 = new MemoryEngine({ storage: 'memory' });
  await engine3.init();

  // Populate with themed data
  for (let i = 0; i < 100; i++) {
    await engine3.remember(`User preference ${i} for coding style`, {
      type: 'preference',
      entities: ['User', 'Coding'],
    });
  }

  const reflectResult = await runBenchmark(
    'Reflect (100 memories)',
    async () => {
      await engine3.reflect();
    },
    20,
    3
  );
  results.push(reflectResult);
  printResult(reflectResult);

  engine3.close();

  // Test 4: Stats Operation
  console.log('\n📝 Test 4: Stats Operation');
  const engine4 = new MemoryEngine({ storage: 'memory' });
  await engine4.init();

  for (let i = 0; i < 1000; i++) {
    await engine4.remember(`Memory ${i}`, { type: 'fact' });
  }

  const statsResult = await runBenchmark(
    'Stats (1000 memories)',
    () => {
      engine4.stats();
    },
    100,
    10
  );
  results.push(statsResult);
  printResult(statsResult);

  engine4.close();

  // Test 5: Mixed Workload
  console.log('\n📝 Test 5: Mixed Workload (80% read, 20% write)');
  const engine5 = new MemoryEngine({ storage: 'memory' });
  await engine5.init();

  // Initial population
  for (let i = 0; i < 200; i++) {
    await engine5.remember(`Initial memory ${i}`, { type: 'fact' });
  }

  let counter = 0;
  const mixedResult = await runBenchmark(
    'Mixed Workload',
    async () => {
      if (counter % 5 === 0) {
        // 20% writes
        await engine5.remember(`New memory ${counter}`, { type: 'fact' });
      } else {
        // 80% reads
        await engine5.recall('memory');
      }
      counter++;
    },
    100,
    10
  );
  results.push(mixedResult);
  printResult(mixedResult);

  engine5.close();

  return { results };
}
