/**
 * AMemGym Memory Plugin
 * Intelligent memory with AWE architecture and diagnostics
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { MemoryWriteDecider } from "./write-decider.js";
import type { AMemConfig, AMemEntry, MemoryDiagnostics } from "./types.js";

// Default configuration
const DEFAULT_CONFIG: AMemConfig = {
  enabled: true,
  workspacePath: "",
  dbPath: ".memory/amem.sqlite",
  writeThreshold: 0.7,
  minConfidence: 0.5,
  autoMergeDuplicates: true,
  similarityThreshold: 0.85,
  retrievalStrategy: "hybrid",
  vectorWeight: 0.7,
  keywordWeight: 0.3,
  maxResults: 10,
  minScore: 0.6,
  diagnosticsEnabled: true,
  logLevel: "info",
  evolutionEnabled: true,
  evolutionInterval: 10,
  feedbackLoop: "closed",
};

const configSchema = Type.Object({
  enabled: Type.Boolean({ default: true }),
  writeThreshold: Type.Number({ default: 0.7, minimum: 0, maximum: 1 }),
  minConfidence: Type.Number({ default: 0.5, minimum: 0, maximum: 1 }),
  autoMergeDuplicates: Type.Boolean({ default: true }),
  similarityThreshold: Type.Number({ default: 0.85, minimum: 0, maximum: 1 }),
  retrievalStrategy: Type.Enum({ vector: "vector", hybrid: "hybrid", keyword: "keyword" }, { default: "hybrid" }),
  vectorWeight: Type.Number({ default: 0.7 }),
  keywordWeight: Type.Number({ default: 0.3 }),
  maxResults: Type.Number({ default: 10 }),
  minScore: Type.Number({ default: 0.6 }),
  diagnosticsEnabled: Type.Boolean({ default: true }),
  logLevel: Type.Enum({ none: "none", error: "error", warn: "warn", info: "info", verbose: "verbose" }, { default: "info" }),
  evolutionEnabled: Type.Boolean({ default: true }),
  evolutionInterval: Type.Number({ default: 10 }),
  feedbackLoop: Type.Enum({ open: "open", closed: "closed" }, { default: "closed" }),
});

const amemPlugin = {
  id: "memory-amem",
  name: "AMemGym Memory",
  description: "Intelligent memory with AWE architecture, diagnostics, and self-evolution",
  kind: "memory",
  configSchema,

  register(api: OpenClawPluginApi) {
    const logger = api.runtime.logging.getSubsystemLogger("memory-amem");
    const diagnostics: MemoryDiagnostics = {
      writeFailures: [],
      readFailures: [],
      utilizationFailures: [],
    };

    // In-memory storage (can be replaced with SQLite)
    const memoryStore: Map<string, AMemEntry> = new Map();

    api.registerTool(
      (ctx) => {
        const config: AMemConfig = {
          ...DEFAULT_CONFIG,
          workspacePath: ctx.workspacePath,
          ...ctx.config,
        };

        const writeDecider = new MemoryWriteDecider(config);

        // Tool: Write Memory (AWE style)
        const writeTool = api.runtime.tools.defineTool({
          name: "amem_write",
          description: "Write a memory entry with intelligent decision making",
          parameters: Type.Object({
            content: Type.String({ description: "Memory content" }),
            type: Type.Enum({
              fact: "fact",
              preference: "preference",
              goal: "goal",
              constraint: "constraint",
              relationship: "relationship",
              event: "event",
            }),
            confidence: Type.Optional(Type.Number({ description: "Confidence 0-1" })),
            entityRefs: Type.Optional(Type.Array(Type.String())),
            tags: Type.Optional(Type.Array(Type.String())),
            context: Type.Optional(Type.String({ description: "Conversation context" })),
          }),
          returns: Type.Object({
            success: Type.Boolean(),
            id: Type.Optional(Type.String()),
            decision: Type.Object({
              shouldWrite: Type.Boolean(),
              reason: Type.String(),
              importance: Type.Number(),
            }),
          }),
          async execute(params) {
            try {
              const existingEntries = Array.from(memoryStore.values());
              const decision = await writeDecider.decide(
                params.content,
                params.context || "",
                existingEntries
              );

              if (!decision.shouldWrite) {
                // Log write failure for diagnostics
                if (config.diagnosticsEnabled) {
                  diagnostics.writeFailures.push({
                    id: `write-${Date.now()}`,
                    content: params.content,
                    reason: decision.reason.includes("importance")
                      ? "low_importance"
                      : decision.reason.includes("confidence")
                      ? "low_confidence"
                      : "other",
                    confidence: params.confidence || decision.confidence,
                    timestamp: Date.now(),
                    context: params.context || "",
                  });
                }

                logger.info(`Memory write rejected: ${decision.reason}`);
                return {
                  success: false,
                  decision: {
                    shouldWrite: false,
                    reason: decision.reason,
                    importance: decision.importance,
                  },
                };
              }

              // Create memory entry
              const entry: AMemEntry = {
                id: `amem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                type: decision.type,
                content: params.content,
                confidence: params.confidence || decision.confidence,
                importance: decision.importance,
                source: ctx.sessionKey || "unknown",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                accessCount: 0,
                entityRefs: params.entityRefs || decision.suggestedEntities,
                tags: params.tags || decision.suggestedTags,
                generation: 1,
              };

              // Handle consolidation
              if (decision.consolidationTarget) {
                const existing = memoryStore.get(decision.consolidationTarget);
                if (existing) {
                  entry.parentId = existing.id;
                  entry.generation = existing.generation + 1;
                  // Merge content
                  entry.content = await writeDecider.mergeEntries(
                    existing,
                    params.content,
                    entry.confidence
                  );
                }
              }

              memoryStore.set(entry.id, entry);
              logger.info(`Memory written: ${entry.id} (${decision.type})`);

              return {
                success: true,
                id: entry.id,
                decision: {
                  shouldWrite: true,
                  reason: decision.reason,
                  importance: decision.importance,
                },
              };
            } catch (error) {
              logger.error("Failed to write memory:", error);
              throw error;
            }
          },
        });

        // Tool: Query Memory
        const queryTool = api.runtime.tools.defineTool({
          name: "amem_query",
          description: "Query memories with semantic search",
          parameters: Type.Object({
            query: Type.String(),
            type: Type.Optional(Type.Enum({
              fact: "fact",
              preference: "preference",
              goal: "goal",
              constraint: "constraint",
              relationship: "relationship",
              event: "event",
            })),
            entityRef: Type.Optional(Type.String()),
            minConfidence: Type.Optional(Type.Number()),
            limit: Type.Optional(Type.Number({ default: 5 })),
          }),
          returns: Type.Object({
            results: Type.Array(Type.Object({
              id: Type.String(),
              content: Type.String(),
              type: Type.String(),
              confidence: Type.Number(),
              score: Type.Number(),
            })),
          }),
          async execute(params) {
            try {
              const entries = Array.from(memoryStore.values());

              // Filter by type and confidence
              let filtered = entries;
              if (params.type) {
                filtered = filtered.filter((e) => e.type === params.type);
              }
              if (params.minConfidence) {
                filtered = filtered.filter((e) => e.confidence >= params.minConfidence);
              }
              if (params.entityRef) {
                filtered = filtered.filter((e) =>
                  e.entityRefs.includes(params.entityRef!)
                );
              }

              // Simple keyword scoring (can be enhanced with embeddings)
              const queryWords = params.query.toLowerCase().split(/\s+/);
              const scored = filtered.map((entry) => {
                const entryWords = entry.content.toLowerCase();
                let score = 0;
                for (const word of queryWords) {
                  if (entryWords.includes(word)) score += 1;
                }
                // Boost by confidence and importance
                score = score * (entry.confidence + entry.importance) / 2;
                return { entry, score };
              });

              scored.sort((a, b) => b.score - a.score);
              const results = scored.slice(0, params.limit || 5);

              // Update access count
              for (const { entry } of results) {
                entry.accessCount++;
                entry.lastAccessedAt = Date.now();
              }

              return {
                results: results.map(({ entry, score }) => ({
                  id: entry.id,
                  content: entry.content,
                  type: entry.type,
                  confidence: entry.confidence,
                  score,
                })),
              };
            } catch (error) {
              logger.error("Failed to query memories:", error);
              throw error;
            }
          },
        });

        // Tool: Get Diagnostics
        const diagnosticsTool = api.runtime.tools.defineTool({
          name: "amem_diagnostics",
          description: "Get memory system diagnostics",
          parameters: Type.Object({}),
          returns: Type.Object({
            writeFailures: Type.Number(),
            readFailures: Type.Number(),
            utilizationFailures: Type.Number(),
            totalMemories: Type.Number(),
            avgConfidence: Type.Number(),
          }),
          async execute() {
            const entries = Array.from(memoryStore.values());
            const avgConfidence =
              entries.length > 0
                ? entries.reduce((sum, e) => sum + e.confidence, 0) / entries.length
                : 0;

            return {
              writeFailures: diagnostics.writeFailures.length,
              readFailures: diagnostics.readFailures.length,
              utilizationFailures: diagnostics.utilizationFailures.length,
              totalMemories: entries.length,
              avgConfidence,
            };
          },
        });

        // Tool: Update Memory
        const updateTool = api.runtime.tools.defineTool({
          name: "amem_update",
          description: "Update an existing memory entry",
          parameters: Type.Object({
            id: Type.String(),
            content: Type.Optional(Type.String()),
            confidence: Type.Optional(Type.Number()),
          }),
          returns: Type.Object({ success: Type.Boolean() }),
          async execute(params) {
            const entry = memoryStore.get(params.id);
            if (!entry) {
              throw new Error(`Memory not found: ${params.id}`);
            }

            if (params.content) {
              entry.content = params.content;
            }
            if (params.confidence !== undefined) {
              entry.confidence = params.confidence;
            }
            entry.updatedAt = Date.now();

            return { success: true };
          },
        });

        // Tool: Delete Memory
        const deleteTool = api.runtime.tools.defineTool({
          name: "amem_delete",
          description: "Delete a memory entry",
          parameters: Type.Object({
            id: Type.String(),
            reason: Type.Optional(Type.String()),
          }),
          returns: Type.Object({ success: Type.Boolean() }),
          async execute(params) {
            const deleted = memoryStore.delete(params.id);
            if (deleted) {
              logger.info(`Memory deleted: ${params.id} (${params.reason || "no reason"})`);
            }
            return { success: deleted };
          },
        });

        return [writeTool, queryTool, diagnosticsTool, updateTool, deleteTool];
      },
      { names: ["amem_write", "amem_query", "amem_diagnostics", "amem_update", "amem_delete"] }
    );

    // Register CLI
    api.registerCli(
      ({ program }) => {
        const amemCmd = program
          .command("memory-amem")
          .description("AMemGym memory management");

        amemCmd
          .command("stats")
          .description("Show memory statistics")
          .action(async () => {
            const entries = Array.from(memoryStore.values());
            const avgConfidence =
              entries.length > 0
                ? entries.reduce((sum, e) => sum + e.confidence, 0) / entries.length
                : 0;
            const avgImportance =
              entries.length > 0
                ? entries.reduce((sum, e) => sum + e.importance, 0) / entries.length
                : 0;

            console.log("\nAMemGym Memory Statistics:");
            console.log("=" .repeat(40));
            console.log(`Total memories:     ${entries.length}`);
            console.log(`Avg confidence:     ${avgConfidence.toFixed(2)}`);
            console.log(`Avg importance:     ${avgImportance.toFixed(2)}`);
            console.log(`Write failures:     ${diagnostics.writeFailures.length}`);
            console.log(`Read failures:      ${diagnostics.readFailures.length}`);
            console.log(`Utilization fails:  ${diagnostics.utilizationFailures.length}`);

            // Type distribution
            const typeCounts: Record<string, number> = {};
            for (const entry of entries) {
              typeCounts[entry.type] = (typeCounts[entry.type] || 0) + 1;
            }
            console.log("\nBy type:");
            for (const [type, count] of Object.entries(typeCounts)) {
              console.log(`  ${type}: ${count}`);
            }
          });

        amemCmd
          .command("list")
          .description("List all memories")
          .option("-t, --type <type>", "Filter by type")
          .action(async (options: { type?: string }) => {
            let entries = Array.from(memoryStore.values());
            if (options.type) {
              entries = entries.filter((e) => e.type === options.type);
            }

            console.log(`\n${entries.length} memories:`);
            console.log("=" .repeat(60));

            for (const entry of entries.slice(0, 20)) {
              console.log(`\n[${entry.type}] ${entry.content.substring(0, 50)}...`);
              console.log(`  ID: ${entry.id}`);
              console.log(`  Confidence: ${entry.confidence.toFixed(2)}`);
              console.log(`  Entities: ${entry.entityRefs.join(", ") || "none"}`);
            }

            if (entries.length > 20) {
              console.log(`\n... and ${entries.length - 20} more`);
            }
          });

        amemCmd
          .command("diagnostics")
          .description("Show detailed diagnostics")
          .action(async () => {
            console.log("\nWrite Failures:");
            console.log("=" .repeat(40));
            for (const failure of diagnostics.writeFailures.slice(-10)) {
              console.log(`\n${failure.reason}: ${failure.content.substring(0, 50)}...`);
              console.log(`  Confidence: ${failure.confidence.toFixed(2)}`);
            }
          });
      },
      { commands: ["memory-amem"] }
    );

    logger.info("AMemGym memory plugin registered");
  },
};

export default amemPlugin;
