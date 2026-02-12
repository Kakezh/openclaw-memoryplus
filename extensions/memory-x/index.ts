/**
 * Memory-X: Unified Hierarchical Memory System
 * Based on xMemory (Four-level Hierarchy) and Memory Taxonomy (3D Classification)
 * 
 * V2 Improvements:
 * - SQLite storage for better performance
 * - Vector index for semantic search
 * - Forgetting mechanism
 * - Conflict detection
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import path from "path";
import fs from "fs";
import type {
  MemoryXConfig,
  OriginalMemory,
  EpisodeMemory,
  SemanticMemory,
  ThemeMemory,
  AnyMemory,
} from "./types.js";
import { SQLiteMemoryStore } from "./store/sqlite-store.js";
import { VectorIndex, SimpleEmbeddingProvider } from "./store/vector-index.js";
import { ForgettingMechanism } from "./dynamics/forgetting.js";
import { ConflictDetector } from "./dynamics/conflict.js";
import { KnowledgeGraph } from "./reasoning/knowledge-graph.js";
import { MultiHopReasoning } from "./reasoning/multi-hop.js";

type TextContent = { type: "text"; text: string };

const DEFAULT_CONFIG: MemoryXConfig = {
  enabled: true,
  workspacePath: "",
  dbPath: ".memory/memory.db",
  hierarchy: {
    maxThemeSize: 50,
    minThemeCoherence: 0.7,
    autoReorganize: true,
    reorganizeInterval: 24,
  },
  retrieval: {
    themeTopK: 3,
    semanticTopK: 5,
    uncertaintyThreshold: 0.3,
    maxTokens: 4000,
    evidenceDensityThreshold: 0.6,
  },
  taxonomy: {
    separateFactualExperiential: true,
    parametricFactualThreshold: 0.9,
  },
  store: {
    factual: { form: "token", updateStrategy: "version", confidenceThreshold: 0.9 },
    experiential: { form: "token", hierarchyEnabled: true, autoReorganize: true },
    working: { maxTurns: 5, maxTokens: 2000, evictionPolicy: "lru" },
  },
  skills: {
    autoMineFromThemes: true,
    minThemeFrequency: 3,
  },
  autoReflection: {
    enabled: true,
    intervalMinutes: 60,
  },
};

function createTextContent(text: string): TextContent[] {
  return [{ type: "text", text }];
}

function createToolResult<T>(details: T): AgentToolResult<T> {
  return {
    content: createTextContent(JSON.stringify(details, null, 2)),
    details,
  };
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

const memoryXPlugin = {
  id: "memory-x",
  name: "Memory-X",
  description: "Unified hierarchical memory system based on xMemory and Memory Taxonomy",
  kind: "memory" as const,

  register(api: OpenClawPluginApi) {
    const logger = api.logger;

    api.registerTool(
      (ctx) => {
        const config: MemoryXConfig = {
          ...DEFAULT_CONFIG,
          workspacePath: ctx.workspaceDir || DEFAULT_CONFIG.workspacePath,
          ...(api.pluginConfig as unknown as Partial<MemoryXConfig>),
        };

        const memoryDir = path.join(config.workspacePath, "memory");
        if (!fs.existsSync(memoryDir)) {
          fs.mkdirSync(memoryDir, { recursive: true });
        }

        const store = new SQLiteMemoryStore(config.workspacePath);
        const vectorIndex = new VectorIndex(store, new SimpleEmbeddingProvider());
        const forgetting = new ForgettingMechanism(store);
        const conflictDetector = new ConflictDetector(store, vectorIndex);
        const knowledgeGraph = new KnowledgeGraph(store);
        const reasoning = new MultiHopReasoning(store, vectorIndex, knowledgeGraph);

        logger.info(`[Memory-X] SQLite store initialized at: ${store.getPath()}`);

        // Tool 1: memory_remember
        const rememberParamsSchema = Type.Object({
          content: Type.String(),
          type: Type.Enum({
            fact: "fact",
            preference: "preference",
            goal: "goal",
            constraint: "constraint",
            event: "event",
          }),
          confidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
          entities: Type.Optional(Type.Array(Type.String())),
          isFactual: Type.Optional(Type.Boolean()),
        });

        type RememberParams = Static<typeof rememberParamsSchema>;
        type RememberResult = {
          success: boolean;
          ids: { original: string; episode: string; semantic: string; theme: string };
          conflicts?: { id: string; reason: string }[];
        };

        const rememberTool: AgentTool<typeof rememberParamsSchema, RememberResult> = {
          name: "memory_remember",
          label: "Remember",
          description: "Store a memory with automatic hierarchy classification",
          parameters: rememberParamsSchema,
          async execute(_toolCallId: string, params: RememberParams): Promise<AgentToolResult<RememberResult>> {
            try {
              const timestamp = Date.now();
              const sessionId = ctx.sessionKey || "default";
              const conflicts: { id: string; reason: string }[] = [];

              // Level 1: Original
              const original: OriginalMemory = {
                id: `orig-${timestamp}`,
                content: params.content,
                timestamp,
                sessionId,
                speaker: "user",
                metadata: { importance: params.confidence || 0.5 },
              };

              // Level 2: Episode
              const episode: EpisodeMemory = {
                id: `ep-${timestamp}`,
                summary: params.content.substring(0, 100),
                originalIds: [original.id],
                startTime: timestamp,
                endTime: timestamp,
                boundaryType: "topic",
                coherenceScore: params.confidence || 0.5,
              };

              // Level 3: Semantic
              const semantic: SemanticMemory = {
                id: `sem-${timestamp}`,
                content: params.content,
                type: params.type,
                confidence: params.confidence || 0.5,
                sourceEpisodes: [episode.id],
                entityRefs: params.entities || [],
              };

              // Check for conflicts
              const detectedConflicts = await conflictDetector.detect(semantic);
              if (detectedConflicts.length > 0) {
                conflicts.push(...detectedConflicts.map((c) => ({ id: c.id, reason: c.reason })));
              }

              // Level 4: Find or create theme
              const theme = findOrCreateTheme(semantic, store);

              // Save all levels in transaction
              store.transaction(() => {
                store.save(original);
                store.save(episode);
                store.save(semantic);
                store.save(theme);
              });

              // Index for vector search
              await vectorIndex.indexMemory(semantic.id, semantic.content);

              logger.info(`[Memory-X] Memory stored: ${original.id}`);

              return createToolResult({
                success: true,
                ids: {
                  original: original.id,
                  episode: episode.id,
                  semantic: semantic.id,
                  theme: theme.id,
                },
                conflicts: conflicts.length > 0 ? conflicts : undefined,
              });
            } catch (error) {
              logger.error(`[Memory-X] Failed to remember: ${error}`);
              throw error;
            }
          },
        };

        // Tool 2: memory_recall
        const recallParamsSchema = Type.Object({
          query: Type.String(),
          maxTokens: Type.Optional(Type.Number({ default: 4000 })),
        });

        type RecallParams = Static<typeof recallParamsSchema>;
        type RecallResult = {
          evidence: {
            themes: { id: string; name: string }[];
            semantics: { id: string; content: string; score?: number }[];
            episodes: { id: string; summary: string }[];
          };
          metrics: { totalTokens: number; evidenceDensity: number };
        };

        const recallTool: AgentTool<typeof recallParamsSchema, RecallResult> = {
          name: "memory_recall",
          label: "Recall",
          description: "Retrieve memories using top-down hierarchy traversal with vector search",
          parameters: recallParamsSchema,
          async execute(_toolCallId: string, params: RecallParams): Promise<AgentToolResult<RecallResult>> {
            try {
              const { query } = params;

              // Vector search for semantics
              const semanticResults = await vectorIndex.search(query, { level: "semantic", limit: 10 });
              const semantics = semanticResults.map((r) => ({
                id: r.memory.id,
                content: (r.memory as SemanticMemory).content,
                score: r.score,
              }));

              // Get themes from semantics
              const themeIds = new Set<string>();
              for (const result of semanticResults) {
                const semantic = result.memory as SemanticMemory;
                const themes = store.search(semantic.content, { level: "theme", limit: 1 });
                themes.forEach((t) => themeIds.add(t.id));
              }

              const themes = Array.from(themeIds)
                .map((id) => store.get<ThemeMemory>(id, "theme"))
                .filter((t): t is ThemeMemory => t !== null)
                .map((t) => ({ id: t.id, name: t.name }));

              // Expand to episodes
              const episodeIds = new Set<string>();
              for (const result of semanticResults) {
                const semantic = result.memory as SemanticMemory;
                semantic.sourceEpisodes.forEach((eid) => episodeIds.add(eid));
              }

              const episodes = Array.from(episodeIds)
                .map((id) => store.get<EpisodeMemory>(id, "episode"))
                .filter((e): e is EpisodeMemory => e !== null)
                .map((e) => ({ id: e.id, summary: e.summary }));

              const totalTokens = estimateTokens(
                themes.map((t) => t.name).join(" ") +
                semantics.map((s) => s.content).join(" ") +
                episodes.map((e) => e.summary).join(" ")
              );

              return createToolResult({
                evidence: { themes, semantics, episodes },
                metrics: {
                  totalTokens,
                  evidenceDensity: semantics.length / Math.max(1, totalTokens / 100),
                },
              });
            } catch (error) {
              logger.error(`[Memory-X] Failed to recall: ${error}`);
              throw error;
            }
          },
        };

        // Tool 3: memory_reflect
        const reflectParamsSchema = Type.Object({
          focus: Type.Optional(Type.Enum({ skills: "skills", evolution: "evolution", general: "general" })),
        });

        type ReflectResult = {
          patterns: { themeId: string; themeName: string; occurrenceCount: number; suggestedSkill: string }[];
          evolutionSuggestions?: { type: "prompt_update" | "new_rule"; content: string; reason: string }[];
        };

        const reflectTool: AgentTool<typeof reflectParamsSchema, ReflectResult> = {
          name: "memory_reflect",
          label: "Reflect",
          description: "Scan memory hierarchy to discover patterns and suggest self-evolution",
          parameters: reflectParamsSchema,
          async execute(_toolCallId: string, params: Static<typeof reflectParamsSchema>): Promise<AgentToolResult<ReflectResult>> {
            const patterns: ReflectResult["patterns"] = [];
            const evolutionSuggestions: ReflectResult["evolutionSuggestions"] = [];

            const themes = store.search("", { level: "theme", limit: 100 });

            for (const theme of themes) {
              const t = theme as ThemeMemory;
              if (t.semanticIds.length >= config.skills.minThemeFrequency) {
                patterns.push({
                  themeId: t.id,
                  themeName: t.name,
                  occurrenceCount: t.semanticIds.length,
                  suggestedSkill: `SOP for ${t.name}`,
                });

                if (t.semanticIds.length > 5) {
                  evolutionSuggestions.push({
                    type: "prompt_update",
                    content: `Add rule for ${t.name}`,
                    reason: `High frequency (${t.semanticIds.length} occurrences)`,
                  });
                }
              }
            }

            return createToolResult({ patterns, evolutionSuggestions });
          },
        };

        // Tool 4: memory_introspect
        const introspectParamsSchema = Type.Object({});
        type IntrospectResult = {
          hierarchy: { originals: number; episodes: number; semantics: number; themes: number };
          health: string;
          avgRetentionScore: number;
        };

        const introspectTool: AgentTool<typeof introspectParamsSchema, IntrospectResult> = {
          name: "memory_introspect",
          label: "Introspect",
          description: "Get memory system diagnostics",
          parameters: introspectParamsSchema,
          async execute(): Promise<AgentToolResult<IntrospectResult>> {
            const stats = store.stats();
            return createToolResult({
              hierarchy: stats.byLevel,
              health: "healthy",
              avgRetentionScore: stats.avgRetentionScore,
            });
          },
        };

        // Tool 5: memory_consolidate
        const consolidateParamsSchema = Type.Object({
          action: Type.Enum({ merge: "merge", split: "split", resolve: "resolve" }),
          targetIds: Type.Array(Type.String()),
        });

        type ConsolidateResult = { success: boolean; message: string };

        const consolidateTool: AgentTool<typeof consolidateParamsSchema, ConsolidateResult> = {
          name: "memory_consolidate",
          label: "Consolidate",
          description: "Consolidate memories: merge themes, resolve conflicts",
          parameters: consolidateParamsSchema,
          async execute(_toolCallId: string, params: Static<typeof consolidateParamsSchema>): Promise<AgentToolResult<ConsolidateResult>> {
            const { action, targetIds } = params;

            if (action === "merge" && targetIds.length >= 2) {
              const targetTheme = store.get<ThemeMemory>(targetIds[0], "theme");
              if (!targetTheme) {
                return createToolResult({ success: false, message: "Target theme not found" });
              }

              store.transaction(() => {
                for (let i = 1; i < targetIds.length; i++) {
                  const sourceTheme = store.get<ThemeMemory>(targetIds[i], "theme");
                  if (sourceTheme) {
                    targetTheme.semanticIds.push(...sourceTheme.semanticIds);
                    store.delete(sourceTheme.id);
                  }
                }
                store.save(targetTheme);
              });

              return createToolResult({ success: true, message: `Merged ${targetIds.length - 1} themes` });
            }

            return createToolResult({ success: false, message: "Action not implemented" });
          },
        };

        // Tool 6: memory_status
        const statusParamsSchema = Type.Object({});
        type StatusResult = {
          stats: { totalMemories: number; themeDistribution: Record<string, number> };
          forgetting: { nextRun: string; candidatesForArchive: number };
        };

        const statusTool: AgentTool<typeof statusParamsSchema, StatusResult> = {
          name: "memory_status",
          label: "Status",
          description: "Get memory system statistics",
          parameters: statusParamsSchema,
          async execute(): Promise<AgentToolResult<StatusResult>> {
            const stats = store.stats();
            const themeDistribution: Record<string, number> = {};

            const themes = store.search("", { level: "theme", limit: 100 });
            for (const theme of themes) {
              const t = theme as ThemeMemory;
              themeDistribution[t.name] = t.semanticIds.length;
            }

            const forgettingStats = forgetting.getStats();

            return createToolResult({
              stats: { totalMemories: stats.total, themeDistribution },
              forgetting: {
                nextRun: new Date(Date.now() + 3600000).toISOString(),
                candidatesForArchive: forgettingStats.candidatesForArchive,
              },
            });
          },
        };

        // Tool 7: memory_evolve
        const evolveParamsSchema = Type.Object({
          action: Type.Enum({ add_rule: "add_rule", add_sop: "add_sop" }),
          content: Type.String(),
          reason: Type.String(),
        });

        type EvolveResult = { success: boolean; path: string };

        const evolveTool: AgentTool<typeof evolveParamsSchema, EvolveResult> = {
          name: "memory_evolve",
          label: "Evolve",
          description: "Self-modify behavior by updating META.md",
          parameters: evolveParamsSchema,
          async execute(_toolCallId: string, params: Static<typeof evolveParamsSchema>): Promise<AgentToolResult<EvolveResult>> {
            const metaPath = path.join(memoryDir, "META.md");
            if (!fs.existsSync(metaPath)) {
              fs.writeFileSync(metaPath, "# META.md - Self-Evolution\n\n## Rules\n\n## SOPs\n\n");
            }

            const timestamp = new Date().toISOString();
            let entry = "";

            if (params.action === "add_rule") {
              entry = `\n- [${timestamp}] ${params.content} <!-- ${params.reason} -->`;
            } else {
              entry = `\n### SOP: ${params.reason}\n${params.content}\n`;
            }

            fs.appendFileSync(metaPath, entry);
            logger.info(`[Memory-X] Memory evolved: ${params.action}`);

            return createToolResult({ success: true, path: metaPath });
          },
        };

        // Tool 8: memory_forget (New)
        const forgetParamsSchema = Type.Object({
          action: Type.Enum({ archive: "archive", cleanup: "cleanup", stats: "stats" }),
          threshold: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
        });

        type ForgetResult = { archived: number; deleted: number; retained: number };

        const forgetTool: AgentTool<typeof forgetParamsSchema, ForgetResult> = {
          name: "memory_forget",
          label: "Forget",
          description: "Manage memory lifecycle: archive low-value memories",
          parameters: forgetParamsSchema,
          async execute(_toolCallId: string, params: Static<typeof forgetParamsSchema>): Promise<AgentToolResult<ForgetResult>> {
            const { action, threshold = 0.3 } = params;

            if (action === "archive") {
              const result = forgetting.archiveLowValue(threshold);
              return createToolResult(result);
            } else if (action === "cleanup") {
              const result = forgetting.cleanup();
              return createToolResult(result);
            } else {
              const stats = forgetting.getStats();
              return createToolResult({ archived: stats.archived, deleted: stats.deleted, retained: stats.retained });
            }
          },
        };

        // Background auto-forgetting
        setInterval(() => {
          const result = forgetting.archiveLowValue(0.2);
          if (result.archived > 0 || result.deleted > 0) {
            logger.info(`[Memory-X] Auto-forget: archived ${result.archived}, deleted ${result.deleted}`);
          }
        }, 24 * 60 * 60 * 1000); // Daily

        // Tool 9: memory_reason (P2 - Multi-hop reasoning)
        const reasonParamsSchema = Type.Object({
          query: Type.String(),
          maxHops: Type.Optional(Type.Number({ minimum: 1, maximum: 5, default: 3 })),
        });

        type ReasonResult = {
          query: string;
          answer: string;
          steps: { type: string; input: string; output: string; confidence: number }[];
          confidence: number;
          entityCount: number;
          pathCount: number;
        };

        const reasonTool: AgentTool<typeof reasonParamsSchema, ReasonResult> = {
          name: "memory_reason",
          label: "Reason",
          description: "Multi-hop reasoning across memory hierarchy with knowledge graph",
          parameters: reasonParamsSchema,
          async execute(_toolCallId: string, params: Static<typeof reasonParamsSchema>): Promise<AgentToolResult<ReasonResult>> {
            try {
              const result = await reasoning.reason(params.query, params.maxHops || 3);
              
              return createToolResult({
                query: result.query,
                answer: result.answer,
                steps: result.steps.map((s) => ({
                  type: s.type,
                  input: s.input,
                  output: s.output,
                  confidence: s.confidence,
                })),
                confidence: result.confidence,
                entityCount: knowledgeGraph.getAllEntities().length,
                pathCount: result.paths.length,
              });
            } catch (error) {
              logger.error(`[Memory-X] Reasoning failed: ${error}`);
              throw error;
            }
          },
        };

        // Tool 10: memory_graph (P2 - Knowledge graph operations)
        const graphParamsSchema = Type.Object({
          action: Type.Enum({ stats: "stats", entity: "entity", path: "path", related: "related" }),
          entity: Type.Optional(Type.String()),
          target: Type.Optional(Type.String()),
        });

        type GraphResult = {
          action: string;
          result: Record<string, any>;
        };

        const graphTool: AgentTool<typeof graphParamsSchema, GraphResult> = {
          name: "memory_graph",
          label: "Graph",
          description: "Query and explore the knowledge graph",
          parameters: graphParamsSchema,
          async execute(_toolCallId: string, params: Static<typeof graphParamsSchema>): Promise<AgentToolResult<GraphResult>> {
            const { action, entity, target } = params;

            switch (action) {
              case "stats":
                return createToolResult({
                  action: "stats",
                  result: knowledgeGraph.getStats(),
                });

              case "entity":
                if (!entity) {
                  return createToolResult({
                    action: "entity",
                    result: { error: "Entity name required" },
                  });
                }
                const foundEntity = knowledgeGraph.getEntity(entity);
                const relations = foundEntity ? knowledgeGraph.getEntityRelations(foundEntity.id) : [];
                return createToolResult({
                  action: "entity",
                  result: { entity: foundEntity, relations: relations.length },
                });

              case "path":
                if (!entity || !target) {
                  return createToolResult({
                    action: "path",
                    result: { error: "Source and target entity names required" },
                  });
                }
                const path = knowledgeGraph.findPath(entity, target);
                return createToolResult({
                  action: "path",
                  result: path ? {
                    nodes: path.nodes.map((n) => n.name),
                    edges: path.edges.map((e) => e.type),
                    weight: path.totalWeight,
                  } : null,
                });

              case "related":
                if (!entity) {
                  return createToolResult({
                    action: "related",
                    result: { error: "Entity name required" },
                  });
                }
                const sourceEntity = knowledgeGraph.getEntity(entity);
                const related = sourceEntity ? knowledgeGraph.getRelatedEntities(sourceEntity.id) : [];
                return createToolResult({
                  action: "related",
                  result: { entities: related.map((e) => e.name) },
                });

              default:
                return createToolResult({
                  action: "unknown",
                  result: { error: "Unknown action" },
                });
            }
          },
        };

        return [
          rememberTool,
          recallTool,
          reflectTool,
          introspectTool,
          consolidateTool,
          statusTool,
          evolveTool,
          forgetTool,
          reasonTool,
          graphTool,
        ];
      },
      { names: ["memory_remember", "memory_recall", "memory_reflect", "memory_introspect", "memory_consolidate", "memory_status", "memory_evolve", "memory_forget", "memory_reason", "memory_graph"] }
    );

    logger.info("[Memory-X] Plugin registered with SQLite storage");
  },
};

function findOrCreateTheme(semantic: SemanticMemory, store: SQLiteMemoryStore): ThemeMemory {
  for (const entity of semantic.entityRefs) {
    const themes = store.search(entity, { level: "theme", limit: 1 });
    if (themes.length > 0) {
      const theme = themes[0] as ThemeMemory;
      theme.semanticIds.push(semantic.id);
      theme.updatedAt = Date.now();
      store.save(theme);
      return theme;
    }
  }

  const themeName = semantic.entityRefs[0] || `Theme-${Date.now()}`;
  const theme: ThemeMemory = {
    id: `theme-${Date.now()}`,
    name: themeName,
    description: `Theme for ${themeName}`,
    semanticIds: [semantic.id],
    coherenceScore: semantic.confidence,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  store.save(theme);
  return theme;
}

export default memoryXPlugin;
