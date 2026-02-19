/**
 * Storage Performance Benchmark
 * Tests SQLite storage operations
 */

import { MemoryEngine } from '../core/engine.js';
import {
  runBenchmark,
  printResult,
  printHeader,
  measureMemory,
  type BenchmarkResult,
  type MemoryResult,
  formatBytes,
} from './utils.js';

const TEST_DATA_SIZES = [100, 500, 1000, 5000];

function generateTestContent(length: number): string {
  const words = ['user', 'prefers', 'dark', 'mode', 'TypeScript', 'React', 'Node.js', 'project', 'code', 'test'];
  let content = '';
  for (let i = 0; i < length; i++) {
    content += words[Math.floor(Math.random() * words.length)] + ' ';
  }
  return content.trim();
}

export async function runStorageBenchmarks(): Promise<{
  results: BenchmarkResult[];
  memory: MemoryResult[];
}> {
  const results: BenchmarkResult[] = [];
  const memory: MemoryResult[] = [];

  printHeader('Storage Performance Tests');

  // Test 1: Single Write Latency
  console.log('\n📝 Test 1: Single Write Latency');
  const engine1 = new MemoryEngine({ storage: 'memory' });
  await engine1.init();

  const singleWriteResult = await runBenchmark(
    'Single Write',
    async () => {
      await engine1.remember(generateTestContent(10), {
        type: 'preference',
        confidence: 0.8,
        entities: ['User'],
      });
    },
    100,
    10
  );
  results.push(singleWriteResult);
  printResult(singleWriteResult);

  engine1.close();

  // Test 2: Batch Write Throughput
  console.log('\n📝 Test 2: Batch Write Throughput');
  const engine2 = new MemoryEngine({ storage: 'memory' });
  await engine2.init();

  const batchSize = 100;
  const batchWriteResult = await runBenchmark(
    `Batch Write (${batchSize} items)`,
    async () => {
      for (let i = 0; i < batchSize; i++) {
        await engine2.remember(generateTestContent(10), { type: 'fact' });
      }
    },
    10,
    2
  );
  results.push(batchWriteResult);
  printResult(batchWriteResult);

  engine2.close();

  // Test 3: Search Latency at Different Data Sizes
  console.log('\n📝 Test 3: Search Latency by Data Size');
  
  for (const size of TEST_DATA_SIZES) {
    const engine = new MemoryEngine({ storage: 'memory' });
    await engine.init();

    // Populate data
    for (let i = 0; i < size; i++) {
      await engine.remember(generateTestContent(10), { type: 'fact' });
    }

    const searchResult = await runBenchmark(
      `Search (${size} memories)`,
      async () => {
        await engine.recall('user prefers');
      },
      50,
      5
    );
    results.push(searchResult);
    printResult(searchResult);

    engine.close();
  }

  // Test 4: Memory Overhead
  console.log('\n📝 Test 4: Memory Overhead');
  const engine4 = new MemoryEngine({ storage: 'memory' });
  await engine4.init();

  const memBefore = measureMemory();
  
  const numMemories = 1000;
  for (let i = 0; i < numMemories; i++) {
    await engine4.remember(generateTestContent(20), {
      type: 'fact',
      entities: ['Entity' + (i % 10)],
    });
  }

  const memAfter = measureMemory();
  
  memory.push({
    name: `Memory Overhead (${numMemories} memories)`,
    heapUsed: memAfter.heapUsed,
    heapTotal: memAfter.heapTotal,
    external: memAfter.external,
    rss: memAfter.rss,
    delta: memAfter.heapUsed - memBefore.heapUsed,
  });

  console.log(`\n💾 Memory Overhead (${numMemories} memories)`);
  console.log('─'.repeat(50));
  console.log(`  Heap Delta:  ${formatBytes(memAfter.heapUsed - memBefore.heapUsed)}`);
  console.log(`  Per Memory:  ${formatBytes((memAfter.heapUsed - memBefore.heapUsed) / numMemories)}`);

  engine4.close();

  return { results, memory };
}
