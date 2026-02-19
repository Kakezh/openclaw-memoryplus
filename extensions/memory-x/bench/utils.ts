/**
 * Benchmark Utilities
 * Provides timing, memory measurement, and reporting functions
 */

import os from 'os';

export interface BenchmarkResult {
  name: string;
  value: number;
  unit: string;
  iterations: number;
  min: number;
  max: number;
  mean: number;
  std: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface MemoryResult {
  name: string;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  delta: number;
}

export interface BenchmarkReport {
  timestamp: string;
  platform: string;
  nodeVersion: string;
  cpuCores: number;
  totalMemory: number;
  results: {
    storage?: BenchmarkResult[];
    hierarchy?: BenchmarkResult[];
    memory?: MemoryResult[];
  };
}

export function measureTime<T>(fn: () => T): { result: T; time: number } {
  const start = performance.now();
  const result = fn();
  const time = performance.now() - start;
  return { result, time };
}

export async function measureTimeAsync<T>(fn: () => Promise<T>): Promise<{ result: T; time: number }> {
  const start = performance.now();
  const result = await fn();
  const time = performance.now() - start;
  return { result, time };
}

export function measureMemory(): NodeJS.MemoryUsage {
  if (global.gc) {
    global.gc();
  }
  return process.memoryUsage();
}

export function calculateStats(times: number[]): BenchmarkResult {
  const sorted = [...times].sort((a, b) => a - b);
  const n = sorted.length;
  
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  
  const variance = sorted.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / n;
  const std = Math.sqrt(variance);
  
  const p50 = sorted[Math.floor(n * 0.5)];
  const p95 = sorted[Math.floor(n * 0.95)];
  const p99 = sorted[Math.floor(n * 0.99)];
  
  return {
    name: '',
    value: mean,
    unit: 'ms',
    iterations: n,
    min: sorted[0],
    max: sorted[n - 1],
    mean,
    std,
    p50,
    p95,
    p99,
  };
}

export async function runBenchmark(
  name: string,
  fn: () => Promise<void> | void,
  iterations: number = 100,
  warmup: number = 10
): Promise<BenchmarkResult> {
  // Warmup
  for (let i = 0; i < warmup; i++) {
    await fn();
  }
  
  // Actual benchmark
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const { time } = await measureTimeAsync(async () => {
      await fn();
    });
    times.push(time);
  }
  
  const result = calculateStats(times);
  result.name = name;
  return result;
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(2)} ${units[i]}`;
}

export function formatTime(ms: number): string {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(2)} µs`;
  } else if (ms < 1000) {
    return `${ms.toFixed(2)} ms`;
  } else {
    return `${(ms / 1000).toFixed(2)} s`;
  }
}

export function printResult(result: BenchmarkResult): void {
  console.log(`\n📊 ${result.name}`);
  console.log('─'.repeat(50));
  console.log(`  Mean:   ${formatTime(result.mean)}`);
  console.log(`  Min:    ${formatTime(result.min)}`);
  console.log(`  Max:    ${formatTime(result.max)}`);
  console.log(`  Std:    ${formatTime(result.std)}`);
  console.log(`  P50:    ${formatTime(result.p50)}`);
  console.log(`  P95:    ${formatTime(result.p95)}`);
  console.log(`  P99:    ${formatTime(result.p99)}`);
  console.log(`  Iter:   ${result.iterations}`);
}

export function printMemoryResult(result: MemoryResult): void {
  console.log(`\n💾 ${result.name}`);
  console.log('─'.repeat(50));
  console.log(`  Heap Used:   ${formatBytes(result.heapUsed)}`);
  console.log(`  Heap Total:  ${formatBytes(result.heapTotal)}`);
  console.log(`  External:    ${formatBytes(result.external)}`);
  console.log(`  RSS:         ${formatBytes(result.rss)}`);
  if (result.delta > 0) {
    console.log(`  Delta:       ${formatBytes(result.delta)}`);
  }
}

export function getSystemInfo(): Omit<BenchmarkReport, 'results' | 'timestamp'> {
  return {
    platform: `${process.platform} ${process.arch}`,
    nodeVersion: process.version,
    cpuCores: os.cpus().length,
    totalMemory: os.totalmem(),
  };
}

export function createReport(results: BenchmarkReport['results']): BenchmarkReport {
  return {
    timestamp: new Date().toISOString(),
    ...getSystemInfo(),
    results,
  };
}

export function printHeader(title: string): void {
  console.log('\n' + '═'.repeat(60));
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

export function printSystemInfo(): void {
  const info = getSystemInfo();
  console.log('\n🖥️  System Information');
  console.log('─'.repeat(50));
  console.log(`  Platform:    ${info.platform}`);
  console.log(`  Node.js:     ${info.nodeVersion}`);
  console.log(`  CPU Cores:   ${info.cpuCores}`);
  console.log(`  Total RAM:   ${formatBytes(info.totalMemory)}`);
}

export function getPerformanceGrade(result: BenchmarkResult): string {
  const mean = result.mean;
  if (mean < 1) return '🟢 Excellent';
  if (mean < 10) return '🟡 Good';
  if (mean < 100) return '🟠 Fair';
  return '🔴 Needs Improvement';
}
