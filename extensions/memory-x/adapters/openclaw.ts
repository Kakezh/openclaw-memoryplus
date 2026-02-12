/**
 * OpenClaw Adapter
 * Adapts Memory-X for use with OpenClaw agent framework
 */

import type { MemoryEngine } from "../core/engine.js";
import type { MemoryTool, MemoryConfig } from "../core/types.js";

export interface OpenClawPluginApi {
  logger: { info: (msg: string) => void; error: (msg: string) => void };
  registerTool: (factory: (ctx: any) => any[], options?: any) => void;
  registerCli?: (factory: (ctx: any) => void, options?: any) => void;
  pluginConfig?: any;
}

export interface OpenClawToolContext {
  workspaceDir?: string;
  sessionKey?: string;
  config?: any;
}

export interface OpenClawAdapter {
  register(api: OpenClawPluginApi): void;
  getEngine(): MemoryEngine;
}

export function createOpenClawAdapter(
  engine: MemoryEngine,
  options: { toolNames?: string[] } = {}
): OpenClawAdapter {
  const { toolNames } = options;

  return {
    register(api: OpenClawPluginApi): void {
      api.registerTool(
        (ctx: OpenClawToolContext) => {
          const tools = engine.getTools();
          const filteredTools = toolNames
            ? tools.filter((t) => toolNames.includes(t.name))
            : tools;

          return filteredTools.map((tool) => convertToOpenClawTool(tool, api));
        },
        { names: toolNames || engine.getTools().map((t) => t.name) }
      );

      api.logger.info("[Memory-X] OpenClaw adapter registered");
    },

    getEngine(): MemoryEngine {
      return engine;
    },
  };
}

function convertToOpenClawTool(tool: MemoryTool, api: OpenClawPluginApi): any {
  return {
    name: tool.name,
    label: tool.name.replace("memory_", "").charAt(0).toUpperCase() +
           tool.name.replace("memory_", "").slice(1),
    description: tool.description,
    parameters: convertSchema(tool.parameters),
    async execute(toolCallId: string, params: any): Promise<any> {
      try {
        const result = await tool.execute(params);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
          details: result.data,
        };
      } catch (error) {
        api.logger.error(`[Memory-X] Tool ${tool.name} failed: ${error}`);
        throw error;
      }
    },
  };
}

function convertSchema(schema: any): any {
  if (!schema || typeof schema !== "object") return schema;

  const converted: any = {};

  if (schema.type) converted.type = schema.type;
  if (schema.properties) {
    converted.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      converted.properties[key] = convertSchema(value);
    }
  }
  if (schema.required) converted.required = schema.required;
  if (schema.enum) converted.enum = schema.enum;
  if (schema.description) converted.description = schema.description;
  if (schema.default !== undefined) converted.default = schema.default;
  if (schema.minimum !== undefined) converted.minimum = schema.minimum;
  if (schema.maximum !== undefined) converted.maximum = schema.maximum;
  if (schema.items) converted.items = convertSchema(schema.items);
  if (schema.additionalProperties !== undefined) {
    converted.additionalProperties = schema.additionalProperties;
  }

  return converted;
}

export async function createOpenClawPlugin(config?: MemoryConfig): Promise<{
  id: string;
  name: string;
  description: string;
  kind: "memory";
  register(api: OpenClawPluginApi): void;
}> {
  const { MemoryEngine } = await import("../core/engine.js");
  const engine = new MemoryEngine(config);
  await engine.init();

  const adapter = createOpenClawAdapter(engine);

  return {
    id: "memory-x",
    name: "Memory-X",
    description: "Unified hierarchical memory system",
    kind: "memory",
    register(api: OpenClawPluginApi): void {
      adapter.register(api);
    },
  };
}
