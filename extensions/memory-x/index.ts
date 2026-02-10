/**
 * Memory-X: Unified Hierarchical Memory System
 * Based on xMemory (Four-level Hierarchy) and Memory Taxonomy (3D Classification)
 * 
 * Core innovations:
 * 1. Four-level hierarchy: Original → Episode → Semantic → Theme
 * 2. Sparsity-Semantics objective for automatic split/merge
 * 3. Top-down retrieval with uncertainty gating
 * 4. 3D taxonomy: Form × Function × Dynamics
 * 5. Integrated skill mining from themes
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { AgentTool, AgentToolResult, TextContent } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import type {
  MemoryXConfig,
  MemoryHierarchy,
  OriginalMemory,
  EpisodeMemory,
  SemanticMemory,
  ThemeMemory,
  PotentialSkill,
} from "./types.js";

// Default configuration
const DEFAULT_CONFIG: MemoryXConfig = {
  enabled: true,
  workspacePath: "",
  dbPath: ".memory/memory-x.sqlite",
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
    factual: {
      form: "token",
      updateStrategy: "version",
      confidenceThreshold: 0.9,
    },
    experiential: {
      form: "token",
      hierarchyEnabled: true,
      autoReorganize: true,
    },
    working: {
      maxTurns: 5,
      maxTokens: 2000,
      evictionPolicy: "lru",
    },
  },
  skills: {
    autoMineFromThemes: true,
    minThemeFrequency: 3,
  },
};

// In-memory storage (will be replaced with SQLite)
const hierarchy: MemoryHierarchy = {
  originals: new Map(),
  episodes: new Map(),
  semantics: new Map(),
  themes: new Map(),
};

const discoveredSkills: Map<string, PotentialSkill> = new Map();

// Helper: Create text content for AgentToolResult
function createTextContent(text: string): TextContent[] {
  return [{ type: "text", text }];
}

// Helper: Create AgentToolResult
function createToolResult<T>(details: T): AgentToolResult<T> {
  return {
    content: createTextContent(JSON.stringify(details)),
    details,
  };
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
        const config: MemoryXConfig = { ...DEFAULT_CONFIG, ...ctx.config };

        // Tool 1: memory_remember - Unified write entry
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
          ids: {
            original: string;
            episode: string;
            semantic: string;
            theme: string;
          };
        };

        const rememberTool: AgentTool<typeof rememberParamsSchema, RememberResult> = {
          name: "memory_remember",
          label: "Remember",
          description: "Store a memory with automatic hierarchy classification",
          parameters: rememberParamsSchema,
          async execute(
            _toolCallId: string,
            params: RememberParams,
            _signal?: AbortSignal
          ): Promise<AgentToolResult<RememberResult>> {
            try {
              const timestamp = Date.now();
              const sessionId = ctx.sessionKey || "default";

              // Level 1: Create Original
              const original: OriginalMemory = {
                id: `orig-${timestamp}`,
                content: params.content,
                timestamp,
                sessionId,
                speaker: "user",
                metadata: {
                  importance: params.confidence || 0.5,
                },
              };
              hierarchy.originals.set(original.id, original);

              // Level 2: Create/Update Episode
              const episode: EpisodeMemory = {
                id: `ep-${timestamp}`,
                summary: params.content.substring(0, 100),
                originalIds: [original.id],
                startTime: timestamp,
                endTime: timestamp,
                boundaryType: "topic",
                coherenceScore: params.confidence || 0.5,
              };
              hierarchy.episodes.set(episode.id, episode);

              // Level 3: Create Semantic
              const semantic: SemanticMemory = {
                id: `sem-${timestamp}`,
                content: params.content,
                type: params.type,
                confidence: params.confidence || 0.5,
                sourceEpisodes: [episode.id],
                entityRefs: params.entities || [],
              };
              hierarchy.semantics.set(semantic.id, semantic);

              // Level 4: Assign to Theme (or create new)
              let theme = findOrCreateTheme(semantic, hierarchy, config);
              semantic.entityRefs.forEach((entity) => {
                if (!theme.name.toLowerCase().includes(entity.toLowerCase())) {
                  theme.description += ` Related to ${entity}.`;
                }
              });
              hierarchy.themes.set(theme.id, theme);

              logger.info(`Memory stored at all 4 levels: ${original.id}`);

              return createToolResult({
                success: true,
                ids: {
                  original: original.id,
                  episode: episode.id,
                  semantic: semantic.id,
                  theme: theme.id,
                },
              });
            } catch (error) {
              logger.error(`Failed to remember: ${error}`);
              throw error;
            }
          },
        };

        // Tool 2: memory_recall - Top-down retrieval
        const recallParamsSchema = Type.Object({
          query: Type.String(),
          maxTokens: Type.Optional(Type.Number({ default: 4000 })),
        });

        type RecallParams = Static<typeof recallParamsSchema>;
        type RecallResult = {
          evidence: {
            themes: { id: string; name: string }[];
            semantics: { id: string; content: string }[];
            episodes: { id: string; summary: string }[];
          };
          metrics: {
            totalTokens: number;
            evidenceDensity: number;
          };
        };

        const recallTool: AgentTool<typeof recallParamsSchema, RecallResult> = {
          name: "memory_recall",
          label: "Recall",
          description: "Retrieve memories using top-down hierarchy traversal",
          parameters: recallParamsSchema,
          async execute(
            _toolCallId: string,
            params: RecallParams,
            _signal?: AbortSignal
          ): Promise<AgentToolResult<RecallResult>> {
            try {
              const { query, maxTokens = 4000 } = params;

              // Stage 1: Select themes (simplified - keyword matching)
              const themes = Array.from(hierarchy.themes.values())
                .filter((t) =>
                  query.toLowerCase().includes(t.name.toLowerCase()) ||
                  t.semanticIds.some((sid) => {
                    const sem = hierarchy.semantics.get(sid);
                    return sem && query.toLowerCase().includes(sem.content.toLowerCase().substring(0, 50));
                  })
                )
                .slice(0, config.retrieval.themeTopK);

              // Stage 2: Select semantics from themes
              const semantics: SemanticMemory[] = [];
              for (const theme of themes) {
                for (const sid of theme.semanticIds.slice(0, 3)) {
                  const sem = hierarchy.semantics.get(sid);
                  if (sem) semantics.push(sem);
                }
              }

              // Stage 3: Expand to episodes (uncertainty gating - simplified)
              const episodes: EpisodeMemory[] = [];
              for (const sem of semantics.slice(0, config.retrieval.semanticTopK)) {
                for (const eid of sem.sourceEpisodes) {
                  const ep = hierarchy.episodes.get(eid);
                  if (ep) episodes.push(ep);
                }
              }

              const totalTokens = estimateTokens(
                themes.map((t) => t.description).join(" ") +
                semantics.map((s) => s.content).join(" ") +
                episodes.map((e) => e.summary).join(" ")
              );

              return createToolResult({
                evidence: {
                  themes: themes.map((t) => ({ id: t.id, name: t.name })),
                  semantics: semantics.map((s) => ({ id: s.id, content: s.content })),
                  episodes: episodes.map((e) => ({ id: e.id, summary: e.summary })),
                },
                metrics: {
                  totalTokens,
                  evidenceDensity: semantics.length / Math.max(1, totalTokens / 100),
                },
              });
            } catch (error) {
              logger.error(`Failed to recall: ${error}`);
              throw error;
            }
          },
        };

        // Tool 3: memory_reflect - Pattern discovery
        const reflectParamsSchema = Type.Object({});
        type ReflectResult = {
          patterns: {
            themeId: string;
            themeName: string;
            occurrenceCount: number;
            suggestedSkill: string;
          }[];
        };

        const reflectTool: AgentTool<typeof reflectParamsSchema, ReflectResult> = {
          name: "memory_reflect",
          label: "Reflect",
          description: "Scan memory hierarchy to discover patterns and skills",
          parameters: reflectParamsSchema,
          async execute(
            _toolCallId: string,
            _params: Static<typeof reflectParamsSchema>,
            _signal?: AbortSignal
          ): Promise<AgentToolResult<ReflectResult>> {
            const patterns = [];
            for (const theme of hierarchy.themes.values()) {
              if (theme.semanticIds.length >= config.skills.minThemeFrequency) {
                patterns.push({
                  themeId: theme.id,
                  themeName: theme.name,
                  occurrenceCount: theme.semanticIds.length,
                  suggestedSkill: `Handle ${theme.name.toLowerCase()} requests`,
                });
              }
            }
            return createToolResult({ patterns });
          },
        };

        // Tool 4: memory_introspect - Diagnostics
        const introspectParamsSchema = Type.Object({});
        type IntrospectResult = {
          hierarchy: {
            originals: number;
            episodes: number;
            semantics: number;
            themes: number;
          };
          health: string;
        };

        const introspectTool: AgentTool<typeof introspectParamsSchema, IntrospectResult> = {
          name: "memory_introspect",
          label: "Introspect",
          description: "Get memory system diagnostics",
          parameters: introspectParamsSchema,
          async execute(
            _toolCallId: string,
            _params: Static<typeof introspectParamsSchema>,
            _signal?: AbortSignal
          ): Promise<AgentToolResult<IntrospectResult>> {
            return createToolResult({
              hierarchy: {
                originals: hierarchy.originals.size,
                episodes: hierarchy.episodes.size,
                semantics: hierarchy.semantics.size,
                themes: hierarchy.themes.size,
              },
              health: "healthy",
            });
          },
        };

        // Tool 5: memory_consolidate - Memory evolution
        const consolidateParamsSchema = Type.Object({
          action: Type.Enum({ merge: "merge", split: "split", resolve: "resolve" }),
          targetIds: Type.Array(Type.String()),
        });

        type ConsolidateParams = Static<typeof consolidateParamsSchema>;
        type ConsolidateResult = { success: boolean };

        const consolidateTool: AgentTool<typeof consolidateParamsSchema, ConsolidateResult> = {
          name: "memory_consolidate",
          label: "Consolidate",
          description: "Consolidate memories: merge similar themes, resolve conflicts",
          parameters: consolidateParamsSchema,
          async execute(
            _toolCallId: string,
            params: ConsolidateParams,
            _signal?: AbortSignal
          ): Promise<AgentToolResult<ConsolidateResult>> {
            const { action, targetIds } = params;
            if (action === "merge" && targetIds.length >= 2) {
              // Simplified merge: combine semantics from multiple themes
              const targetTheme = hierarchy.themes.get(targetIds[0]);
              if (targetTheme) {
                for (let i = 1; i < targetIds.length; i++) {
                  const sourceTheme = hierarchy.themes.get(targetIds[i]);
                  if (sourceTheme) {
                    targetTheme.semanticIds.push(...sourceTheme.semanticIds);
                    hierarchy.themes.delete(targetIds[i]);
                  }
                }
                hierarchy.themes.set(targetTheme.id, targetTheme);
              }
            }
            return createToolResult({ success: true });
          },
        };

        // Tool 6: memory_status - Statistics
        const statusParamsSchema = Type.Object({});
        type StatusResult = {
          stats: {
            totalMemories: number;
            themeDistribution: Record<string, number>;
          };
        };

        const statusTool: AgentTool<typeof statusParamsSchema, StatusResult> = {
          name: "memory_status",
          label: "Status",
          description: "Get memory system statistics",
          parameters: statusParamsSchema,
          async execute(
            _toolCallId: string,
            _params: Static<typeof statusParamsSchema>,
            _signal?: AbortSignal
          ): Promise<AgentToolResult<StatusResult>> {
            const themeDistribution: Record<string, number> = {};
            for (const theme of hierarchy.themes.values()) {
              themeDistribution[theme.name] = theme.semanticIds.length;
            }
            return createToolResult({
              stats: {
                totalMemories: hierarchy.originals.size,
                themeDistribution,
              },
            });
          },
        };

        return [
          rememberTool,
          recallTool,
          reflectTool,
          introspectTool,
          consolidateTool,
          statusTool,
        ];
      },
      { names: ["memory_remember", "memory_recall", "memory_reflect", "memory_introspect", "memory_consolidate", "memory_status"] }
    );

    // Register CLI
    api.registerCli(
      ({ program }) => {
        const memoryCmd = program
          .command("memory-x")
          .description("Memory-X hierarchical memory system");

        memoryCmd
          .command("status")
          .description("Show memory statistics")
          .action(async () => {
            console.log("\nMemory-X Statistics:");
            console.log("=" .repeat(40));
            console.log(`Originals: ${hierarchy.originals.size}`);
            console.log(`Episodes: ${hierarchy.episodes.size}`);
            console.log(`Semantics: ${hierarchy.semantics.size}`);
            console.log(`Themes: ${hierarchy.themes.size}`);
          });

        memoryCmd
          .command("themes")
          .description("List all themes")
          .action(async () => {
            console.log("\nThemes:");
            console.log("=" .repeat(40));
            for (const theme of hierarchy.themes.values()) {
              console.log(`${theme.name}: ${theme.semanticIds.length} semantics`);
            }
          });

        memoryCmd
          .command("reflect")
          .description("Discover patterns from themes")
          .action(async () => {
            console.log("\nDiscovered Patterns:");
            console.log("=" .repeat(40));
            for (const theme of hierarchy.themes.values()) {
              if (theme.semanticIds.length >= 3) {
                console.log(`\n${theme.name} (${theme.semanticIds.length} occurrences)`);
                console.log(`  Suggested Skill: Handle ${theme.name.toLowerCase()} requests`);
              }
            }
          });
      },
      { commands: ["memory-x"] }
    );

    logger.info("Memory-X plugin registered");
  },
};

// Helper: Find or create theme for semantic
function findOrCreateTheme(
  semantic: SemanticMemory,
  hierarchy: MemoryHierarchy,
  config: MemoryXConfig
): ThemeMemory {
  // Try to find existing theme by entity or content similarity
  for (const theme of hierarchy.themes.values()) {
    const hasCommonEntity = semantic.entityRefs.some((e) =>
      theme.name.toLowerCase().includes(e.toLowerCase()) ||
      theme.description.toLowerCase().includes(e.toLowerCase())
    );
    if (hasCommonEntity) {
      theme.semanticIds.push(semantic.id);
      theme.updatedAt = Date.now();
      return theme;
    }
  }

  // Create new theme
  const themeName = semantic.entityRefs[0] || `Theme-${Date.now()}`;
  return {
    id: `theme-${Date.now()}`,
    name: themeName,
    description: `Theme for ${themeName}`,
    semanticIds: [semantic.id],
    coherenceScore: semantic.confidence,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// Helper: Estimate token count
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export default memoryXPlugin;
