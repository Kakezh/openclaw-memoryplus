/**
 * Generic Adapter
 * Can be used with any agent framework or standalone
 */

import type { MemoryEngine } from "../core/engine.js";
import type { MemoryTool, MemoryToolResult } from "../core/types.js";

export interface GenericAdapter {
  getTools(): MemoryTool[];
  execute(toolName: string, params: any): Promise<MemoryToolResult<any>>;
  getEngine(): MemoryEngine;
}

export function createGenericAdapter(engine: MemoryEngine): GenericAdapter {
  return {
    getTools(): MemoryTool[] {
      return engine.getTools();
    },

    async execute(toolName: string, params: any): Promise<MemoryToolResult<any>> {
      return engine.executeTool(toolName, params);
    },

    getEngine(): MemoryEngine {
      return engine;
    },
  };
}

export async function createMemoryX(config?: import("../core/types.js").MemoryConfig): Promise<GenericAdapter> {
  const { MemoryEngine } = await import("../core/engine.js");
  const engine = new MemoryEngine(config);
  await engine.init();
  return createGenericAdapter(engine);
}
