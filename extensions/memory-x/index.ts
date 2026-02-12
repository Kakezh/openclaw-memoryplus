/**
 * Memory-X: Framework-Agnostic Hierarchical Memory System
 * 
 * Main entry point - exports both core and adapters
 * 
 * @example
 * // Standalone usage
 * import { MemoryEngine } from '@kakezh/memory-x';
 * const engine = new MemoryEngine();
 * await engine.init();
 * await engine.remember("User prefers dark mode", { type: "preference" });
 * 
 * @example
 * // With OpenClaw
 * import { createOpenClawPlugin } from '@kakezh/memory-x/adapters/openclaw';
 * export default createOpenClawPlugin();
 */

// Core exports (framework-agnostic)
export { MemoryEngine } from "./core/engine.js";
export type * from "./core/types.js";

// Adapter exports
export { createGenericAdapter, createMemoryX } from "./adapters/generic.js";
export { createOpenClawAdapter, createOpenClawPlugin } from "./adapters/openclaw.js";

// Convenience re-exports
export type { GenericAdapter } from "./adapters/generic.js";
export type { OpenClawAdapter, OpenClawPluginApi } from "./adapters/openclaw.js";
