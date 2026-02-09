/**
 * Memory Bank Plugin
 * Workspace Memory v2 implementation for OpenClaw
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { BankManager } from "./bank-manager.js";
import { parseRetainSection, generateRetainSection } from "./parser.js";
import type { MemoryBankConfig, ParsedMemoryEntry } from "./types.js";

// Plugin configuration schema
const configSchema = Type.Object({
  enabled: Type.Boolean({ default: true }),
  parseRetain: Type.Boolean({ default: true }),
  trackOpinions: Type.Boolean({ default: true }),
  autoUpdateEntities: Type.Boolean({ default: true }),
  reflectInterval: Type.Enum({ daily: "daily", weekly: "weekly", manual: "manual" }, {
    default: "daily",
  }),
});

const memoryBankPlugin = {
  id: "memory-bank",
  name: "Memory Bank",
  description: "Workspace Memory v2 with bank/ directory and ## Retain parsing",
  kind: "memory",
  configSchema,
  
  register(api: OpenClawPluginApi) {
    const logger = api.runtime.logging.getSubsystemLogger("memory-bank");
    
    // Register tools
    api.registerTool(
      (ctx) => {
        const config: MemoryBankConfig = {
          enabled: ctx.config.enabled ?? true,
          workspacePath: ctx.workspacePath,
          parseRetain: ctx.config.parseRetain ?? true,
          trackOpinions: ctx.config.trackOpinions ?? true,
          autoUpdateEntities: ctx.config.autoUpdateEntities ?? true,
          reflectInterval: ctx.config.reflectInterval ?? "daily",
        };

        const bankManager = new BankManager(config);

        // Tool: Parse Retain Section
        const parseRetainTool = api.runtime.tools.defineTool({
          name: "bank_parse_retain",
          description: "Parse ## Retain section from a memory file",
          parameters: Type.Object({
            filePath: Type.String({ description: "Path to memory file (e.g., memory/2026-02-09.md)" }),
          }),
          returns: Type.Object({
            entries: Type.Array(Type.Object({
              id: Type.String(),
              type: Type.String(),
              content: Type.String(),
              confidence: Type.Optional(Type.Number()),
              entities: Type.Array(Type.String()),
              source: Type.String(),
              lineNumber: Type.Number(),
            })),
            date: Type.String(),
          }),
          async execute({ filePath }) {
            try {
              const fs = await import("node:fs/promises");
              const content = await fs.readFile(filePath, "utf-8");
              const result = parseRetainSection(content, filePath);
              
              if (!result) {
                return { entries: [], date: "" };
              }

              return {
                entries: result.entries,
                date: result.date,
              };
            } catch (error) {
              logger.error("Failed to parse retain section:", error);
              throw error;
            }
          },
        });

        // Tool: Update Entity Page
        const updateEntityTool = api.runtime.tools.defineTool({
          name: "bank_update_entity",
          description: "Create or update an entity page in bank/entities/",
          parameters: Type.Object({
            entityId: Type.String({ description: "Entity slug (e.g., 'Peter', 'The-Castle')" }),
            name: Type.String({ description: "Display name" }),
            summary: Type.String({ description: "Brief description" }),
            facts: Type.Optional(Type.Array(Type.String())),
          }),
          returns: Type.Object({ success: Type.Boolean() }),
          async execute({ entityId, name, summary, facts = [] }) {
            try {
              await bankManager.initialize();
              await bankManager.upsertEntity(entityId, name, summary, facts);
              return { success: true };
            } catch (error) {
              logger.error("Failed to update entity:", error);
              throw error;
            }
          },
        });

        // Tool: Read Entity Page
        const readEntityTool = api.runtime.tools.defineTool({
          name: "bank_read_entity",
          description: "Read an entity page from bank/entities/",
          parameters: Type.Object({
            entityId: Type.String(),
          }),
          returns: Type.Object({
            content: Type.Optional(Type.String()),
            exists: Type.Boolean(),
          }),
          async execute({ entityId }) {
            try {
              await bankManager.initialize();
              const content = await bankManager.readEntity(entityId);
              return { content: content || undefined, exists: !!content };
            } catch (error) {
              logger.error("Failed to read entity:", error);
              throw error;
            }
          },
        });

        // Tool: Append to Bank File
        const appendBankTool = api.runtime.tools.defineTool({
          name: "bank_append",
          description: "Append an entry to a bank file (world/experience/opinions)",
          parameters: Type.Object({
            type: Type.Enum({ world: "world", experience: "experience", opinions: "opinions" }),
            entry: Type.String({ description: "Entry text (will be prefixed with '- ')" }),
          }),
          returns: Type.Object({ success: Type.Boolean() }),
          async execute({ type, entry }) {
            try {
              await bankManager.initialize();
              const formattedEntry = entry.startsWith("- ") ? entry : `- ${entry}`;
              await bankManager.appendToBankFile(type, formattedEntry);
              return { success: true };
            } catch (error) {
              logger.error("Failed to append to bank:", error);
              throw error;
            }
          },
        });

        // Tool: Get Bank Stats
        const bankStatsTool = api.runtime.tools.defineTool({
          name: "bank_stats",
          description: "Get statistics about the memory bank",
          parameters: Type.Object({}),
          returns: Type.Object({
            worldEntries: Type.Number(),
            experienceEntries: Type.Number(),
            opinionEntries: Type.Number(),
            entityCount: Type.Number(),
          }),
          async execute() {
            try {
              await bankManager.initialize();
              return await bankManager.getStats();
            } catch (error) {
              logger.error("Failed to get bank stats:", error);
              throw error;
            }
          },
        });

        return [
          parseRetainTool,
          updateEntityTool,
          readEntityTool,
          appendBankTool,
          bankStatsTool,
        ];
      },
      { names: ["bank_parse_retain", "bank_update_entity", "bank_read_entity", "bank_append", "bank_stats"] }
    );

    // Register CLI commands
    api.registerCli(
      ({ program }) => {
        const bankCmd = program
          .command("memory-bank")
          .description("Memory Bank management commands");

        bankCmd
          .command("init")
          .description("Initialize memory bank structure")
          .action(async () => {
            const workspacePath = api.runtime.config.getWorkspacePath();
            const bankManager = new BankManager({
              enabled: true,
              workspacePath,
              parseRetain: true,
              trackOpinions: true,
              autoUpdateEntities: true,
              reflectInterval: "daily",
            });
            
            await bankManager.initialize();
            console.log("✓ Memory bank initialized");
            console.log(`  Location: ${workspacePath}/bank/`);
          });

        bankCmd
          .command("parse <file>")
          .description("Parse ## Retain section from a memory file")
          .action(async (file: string) => {
            const fs = await import("node:fs/promises");
            const content = await fs.readFile(file, "utf-8");
            const result = parseRetainSection(content, file);
            
            if (!result) {
              console.log("No ## Retain section found");
              return;
            }

            console.log(`\n## Retain entries from ${result.date}:`);
            console.log("=" .repeat(50));
            
            for (const entry of result.entries) {
              console.log(`\n[${entry.type}] ${entry.content}`);
              if (entry.confidence) {
                console.log(`  Confidence: ${entry.confidence}`);
              }
              if (entry.entities.length > 0) {
                console.log(`  Entities: ${entry.entities.join(", ")}`);
              }
            }
          });

        bankCmd
          .command("stats")
          .description("Show memory bank statistics")
          .action(async () => {
            const workspacePath = api.runtime.config.getWorkspacePath();
            const bankManager = new BankManager({
              enabled: true,
              workspacePath,
              parseRetain: true,
              trackOpinions: true,
              autoUpdateEntities: true,
              reflectInterval: "daily",
            });
            
            const stats = await bankManager.getStats();
            console.log("\nMemory Bank Statistics:");
            console.log("=" .repeat(30));
            console.log(`World entries:      ${stats.worldEntries}`);
            console.log(`Experience entries: ${stats.experienceEntries}`);
            console.log(`Opinion entries:    ${stats.opinionEntries}`);
            console.log(`Entity pages:       ${stats.entityCount}`);
          });

        bankCmd
          .command("entities")
          .description("List all entity pages")
          .action(async () => {
            const workspacePath = api.runtime.config.getWorkspacePath();
            const bankManager = new BankManager({
              enabled: true,
              workspacePath,
              parseRetain: true,
              trackOpinions: true,
              autoUpdateEntities: true,
              reflectInterval: "daily",
            });
            
            const entities = await bankManager.listEntities();
            console.log("\nEntity Pages:");
            console.log("=" .repeat(30));
            for (const entity of entities) {
              console.log(`  - ${entity}`);
            }
          });
      },
      { commands: ["memory-bank"] }
    );

    logger.info("Memory Bank plugin registered");
  },
};

export default memoryBankPlugin;
