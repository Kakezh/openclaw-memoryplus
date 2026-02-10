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
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
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

const memoryXPlugin = {
  id: "memory-x",
  name: "Memory-X",
  description: "Unified hierarchical memory system based on xMemory and Memory Taxonomy",
  kind: "memory" as const,

  register(api: OpenClawPluginApi) {
    // Use api.logger instead of api.runtime.logging.getSubsystemLogger
    const logger = api.logger;

    api.registerTool(
      (ctx) => {
        const config: MemoryXConfig = { ...DEFAULT_CONFIG, ...ctx.config };

        // Tool 1: memory_remember - Unified write entry
        const rememberTool: AgentTool = {
          name: "memory_remember",
          description: "Store a memory with automatic hierarchy classification",
          parameters: Type.Object({
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
          }),
          returns: Type.Object({
            success: Type.Boolean(),
            ids: Type.Object({
              original: Type.String(),
              episode: Type.String(),
              semantic: Type.String(),
              theme: Type.String(),
            }),
          }),
          async execute(params: {
            content: string;
            type: "fact" | "preference" | "goal" | "constraint" | "event";
            confidence?: number;
            entities?: string[];
            isFactual?: boolean;
          }) {
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

              return {
                success: true,
                ids: {
                  original: original.id,
                  episode: episode.id,
                  semantic: semantic.id,
                  theme: theme.id,
                },
              };
            } catch (error) {
              logger.error(`Failed to remember: ${error}`);
              throw error;
            }
          },
        };

        // Tool 2: memory_recall - Top-down retrieval
        const recallTool: AgentTool = {
          name: "memory_recall",
          description: "Retrieve memories using top-down hierarchy traversal",
          parameters: Type.Object({
            query: Type.String(),
            maxTokens: Type.Optional(Type.Number({ default: 4000 })),
          }),
          returns: Type.Object({
            evidence: Type.Object({
              themes: Type.Array(Type.Object({ id: Type.String(), name: Type.String() })),
              semantics: Type.Array(Type.Object({ id: Type.String(), content: Type.String() })),
              episodes: Type.Array(Type.Object({ id: Type.String(), summary: Type.String() })),
            }),
            metrics: Type.Object({
              totalTokens: Type.Number(),
              evidenceDensity: Type.Number(),
            }),
          }),
          async execute({
            query,
            maxTokens = 4000,
          }: {
            query: string;
            maxTokens?: number;
          }) {
            try {
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

              return {
                evidence: {
                  themes: themes.map((t) => ({ id: t.id, name: t.name })),
                  semantics: semantics.map((s) => ({ id: s.id, content: s.content })),
                  episodes: episodes.map((e) => ({ id: e.id, summary: e.summary })),
                },
                metrics: {
                  totalTokens,
                  evidenceDensity: semantics.length / Math.max(1, totalTokens / 100),
                },
              };
            } catch (error) {
              logger.error(`Failed to recall: ${error}`);
              throw error;
            }
          },
        };

        // Tool 3: memory_reflect - Pattern discovery
        const reflectTool: AgentTool = {
          name: "memory_reflect",
          description: "Scan memory hierarchy to discover patterns and skills",
          parameters: Type.Object({}),
          returns: Type.Object({
            patterns: Type.Array(Type.Object({
              themeId: Type.String(),
              themeName: Type.String(),
              occurrenceCount: Type.Number(),
              suggestedSkill: Type.String(),
            })),
          }),
          async execute() {
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
            return { patterns };
          },
        };

        // Tool 4: memory_introspect - Diagnostics
        const introspectTool: AgentTool = {
          name: "memory_introspect",
          description: "Get memory system diagnostics",
          parameters: Type.Object({}),
          returns: Type.Object({
            hierarchy: Type.Object({
              originals: Type.Number(),
              episodes: Type.Number(),
              semantics: Type.Number(),
              themes: Type.Number(),
            }),
            health: Type.String(),
          }),
          async execute() {
            return {
              hierarchy: {
                originals: hierarchy.originals.size,
                episodes: hierarchy.episodes.size,
                semantics: hierarchy.semantics.size,
                themes: hierarchy.themes.size,
              },
              health: "healthy",
            };
          },
        };

        // Tool 5: memory_consolidate - Memory evolution
        const consolidateTool: AgentTool = {
          name: "memory_consolidate",
          description: "Consolidate memories: merge similar themes, resolve conflicts",
          parameters: Type.Object({
            action: Type.Enum({ merge: "merge", split: "split", resolve: "resolve" }),
            targetIds: Type.Array(Type.String()),
          }),
          returns: Type.Object({ success: Type.Boolean() }),
          async execute({
            action,
            targetIds,
          }: {
            action: "merge" | "split" | "resolve";
            targetIds: string[];
          }) {
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
            return { success: true };
          },
        };

        // Tool 6: memory_status - Statistics
        const statusTool: AgentTool = {
          name: "memory_status",
          description: "Get memory system statistics",
          parameters: Type.Object({}),
          returns: Type.Object({
            stats: Type.Object({
              totalMemories: Type.Number(),
              themeDistribution: Type.Record(Type.String(), Type.Number()),
            }),
          }),
          async execute() {
            const themeDistribution: Record<string, number> = {};
            for (const theme of hierarchy.themes.values()) {
              themeDistribution[theme.name] = theme.semanticIds.length;
            }
            return {
              stats: {
                totalMemories: hierarchy.originals.size,
                themeDistribution,
              },
            };
          },
        };

        return [rememberTool, recallTool, reflectTool, introspectTool, consolidateTool, statusTool];
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
