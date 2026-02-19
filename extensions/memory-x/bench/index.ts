/**
 * Memory-X Benchmark Suite
 * Run with: pnpm bench
 */

import { runStorageBenchmarks } from './storage.bench.js';
import { runHierarchyBenchmarks } from './hierarchy.bench.js';
import { runMemoryBenchmarks } from './memory.bench.js';
import {
  printHeader,
  printSystemInfo,
  createReport,
  formatBytes,
} from './utils.js';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║          Memory-X Performance Benchmark Suite              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  printSystemInfo();

  const allResults: {
    storage: Awaited<ReturnType<typeof runStorageBenchmarks>>;
    hierarchy: Awaited<ReturnType<typeof runHierarchyBenchmarks>>;
    memory: Awaited<ReturnType<typeof runMemoryBenchmarks>>;
  } = {
    storage: { results: [], memory: [] },
    hierarchy: { results: [] },
    memory: { results: [], perMemory: 0 },
  };

  try {
    // Run storage benchmarks
    allResults.storage = await runStorageBenchmarks();

    // Run hierarchy benchmarks
    allResults.hierarchy = await runHierarchyBenchmarks();

    // Run memory benchmarks
    allResults.memory = await runMemoryBenchmarks();
  } catch (error) {
    console.error('\n❌ Benchmark failed:', error);
    process.exit(1);
  }

  // Summary
  printHeader('Summary');

  console.log('\n📊 Key Metrics:');
  console.log('─'.repeat(60));

  const singleWrite = allResults.storage.results.find(r => r.name === 'Single Write');
  const search500 = allResults.storage.results.find(r => r.name === 'Search (500 memories)');
  const remember = allResults.hierarchy.results.find(r => r.name === 'Remember (4-level hierarchy)');

  if (singleWrite) {
    console.log(`  Single Write Latency:    ${singleWrite.mean.toFixed(2)} ms`);
  }
  if (search500) {
    console.log(`  Search Latency (500):    ${search500.mean.toFixed(2)} ms`);
  }
  if (remember) {
    console.log(`  Remember (4-level):      ${remember.mean.toFixed(2)} ms`);
  }
  console.log(`  Memory per Memory:       ${formatBytes(allResults.memory.perMemory)}`);

  // Performance grades
  console.log('\n📈 Performance Grades:');
  console.log('─'.repeat(60));

  const grade = (ms: number): string => {
    if (ms < 1) return '🟢 Excellent (<1ms)';
    if (ms < 10) return '🟡 Good (<10ms)';
    if (ms < 100) return '🟠 Fair (<100ms)';
    return '🔴 Needs Improvement';
  };

  if (singleWrite) {
    console.log(`  Write Latency:           ${grade(singleWrite.mean)}`);
  }
  if (search500) {
    console.log(`  Search Latency:          ${grade(search500.mean)}`);
  }

  // Save JSON report
  const report = createReport({
    storage: allResults.storage.results,
    hierarchy: allResults.hierarchy.results,
    memory: allResults.memory.results,
  });

  const reportPath = path.join(process.cwd(), 'bench', 'results.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`\n📄 Report saved to: ${reportPath}`);
  console.log('\n✅ Benchmark completed successfully!\n');
}

main().catch(console.error);
