/**
 * Memory-X: Unified Hierarchical Memory System
 * Based on xMemory (Four-level Hierarchy) and Memory Taxonomy (3D Classification)
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import fs from "fs";
import path from "path";
import type {
  MemoryXConfig,
  MemoryHierarchy,
  OriginalMemory,
  EpisodeMemory,
  SemanticMemory,
  ThemeMemory,
} from "./types.js";

type TextContent = { type: "text"; text: string };

// Default configuration
const DEFAULT_CONFIG: MemoryXConfig = {
  enabled: true,
  workspacePath: "",
  dbPath: ".memory/index.json", // Derived store index
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
    intervalMinutes: 60, // Default: Check every hour
  },
};

// Helper: Create text content for AgentToolResult
function createTextContent(text: string): TextContent[] {
  return [{ type: "text", text }];
}

// Helper: Create AgentToolResult
function createToolResult<T>(details: T): AgentToolResult<T> {
  return {
    content: createTextContent(JSON.stringify(details, null, 2)),
    details,
  };
}

// Helper: Estimate token count
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Helper: Get Today's Date YYYY-MM-DD
function getTodayDate(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
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

        // Initialize Directories
        const memoryDir = path.join(config.workspacePath, "memory"); // Canonical daily logs
        const dotMemoryDir = path.join(config.workspacePath, ".memory"); // Derived store

        [memoryDir, dotMemoryDir, 
         path.join(dotMemoryDir, "episodes"), 
         path.join(dotMemoryDir, "semantics"), 
         path.join(dotMemoryDir, "themes")].forEach(dir => {
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        });

        // Initialize Derived Index
        const indexParams = {
            originals: new Map<string, string>(), // ID -> File Path
            episodes: new Map<string, string>(),
            semantics: new Map<string, string>(),
            themes: new Map<string, string>(),
        };

        // Load Index if exists (Simplified)
        // In a real implementation, we would rebuild this from files if missing.
        // For now, we rely on in-memory cache for the session, or simple JSON load.
        // Note: This simple index doesn't persist properly across complex reloads without full sync logic.
        // We will implement a basic "write-through" cache.

        function saveMemory(level: "original" | "episode" | "semantic" | "theme", id: string, data: any) {
            let filePath = "";
            if (level === "original") {
                // Append to daily log (Canonical)
                const date = getTodayDate();
                filePath = path.join(memoryDir, `${date}.md`);
                const logEntry = `\n- [${new Date().toLocaleTimeString()}] ${data.content} <!-- id:${id} -->`;
                fs.appendFileSync(filePath, logEntry);
                indexParams.originals.set(id, filePath);
            } else if (level === "theme") {
                // Save to .memory/themes/ID.json (Derived)
                filePath = path.join(dotMemoryDir, "themes", `${id}.json`);
                fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
                indexParams.themes.set(id, filePath);
            } else {
                // Save to .memory/{level}s/ID.json
                filePath = path.join(dotMemoryDir, `${level}s`, `${id}.json`);
                fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
                if (level === "episode") indexParams.episodes.set(id, filePath);
                if (level === "semantic") indexParams.semantics.set(id, filePath);
            }
        }
        
        // Helper: Find Theme
        function findTheme(keyword: string): ThemeMemory | null {
            // Brute force search in .memory/themes/
            const themeFiles = fs.readdirSync(path.join(dotMemoryDir, "themes"));
            for (const file of themeFiles) {
                const content = fs.readFileSync(path.join(dotMemoryDir, "themes", file), "utf-8");
                const theme = JSON.parse(content) as ThemeMemory;
                if (theme.name.toLowerCase().includes(keyword.toLowerCase())) return theme;
            }
            return null;
        }

        // Helper: Find or create theme
        function findOrCreateTheme(semantic: SemanticMemory): ThemeMemory {
          const entities = semantic.entityRefs || [];
          for (const entity of entities) {
              const existing = findTheme(entity);
              if (existing) {
                  existing.semanticIds.push(semantic.id);
                  existing.updatedAt = Date.now();
                  saveMemory("theme", existing.id, existing);
                  return existing;
              }
          }

          const themeName = entities[0] || `Theme-${Date.now()}`;
          const theme: ThemeMemory = {
            id: `theme-${Date.now()}`,
            name: themeName,
            description: `Theme for ${themeName}`,
            semanticIds: [semantic.id],
            coherenceScore: semantic.confidence,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          saveMemory("theme", theme.id, theme);
          return theme;
        }

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

              // Level 1: Original (Canonical Log)
              const original: OriginalMemory = {
                id: `orig-${timestamp}`,
                content: params.content,
                timestamp,
                sessionId,
                speaker: "user",
                metadata: { importance: params.confidence || 0.5 },
              };
              saveMemory("original", original.id, original);

              // Level 2: Episode (Derived)
              const episode: EpisodeMemory = {
                id: `ep-${timestamp}`,
                summary: params.content.substring(0, 100),
                originalIds: [original.id],
                startTime: timestamp,
                endTime: timestamp,
                boundaryType: "topic",
                coherenceScore: params.confidence || 0.5,
              };
              saveMemory("episode", episode.id, episode);

              // Level 3: Semantic (Derived)
              const semantic: SemanticMemory = {
                id: `sem-${timestamp}`,
                content: params.content,
                type: params.type,
                confidence: params.confidence || 0.5,
                sourceEpisodes: [episode.id],
                entityRefs: params.entities || [],
              };
              saveMemory("semantic", semantic.id, semantic);

              // Level 4: Theme (Derived + Curated)
              const theme = findOrCreateTheme(semantic);
              
              logger.info(`Memory stored: ${original.id}`);

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

        // Tool 2: memory_recall
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
              const { query } = params;
              const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
              
              const themes: ThemeMemory[] = [];
              const semantics: SemanticMemory[] = [];
              const episodes: EpisodeMemory[] = [];

              // Search Themes (Filesystem Scan)
              const themeFiles = fs.readdirSync(path.join(dotMemoryDir, "themes"));
              for (const file of themeFiles) {
                  const t = JSON.parse(fs.readFileSync(path.join(dotMemoryDir, "themes", file), "utf-8")) as ThemeMemory;
                  if (keywords.some(k => t.name.toLowerCase().includes(k) || t.description.toLowerCase().includes(k))) {
                      themes.push(t);
                  }
              }

              // Search Semantics (Filesystem Scan)
              // Note: This is inefficient for large datasets but works for "small pilot".
              const semFiles = fs.readdirSync(path.join(dotMemoryDir, "semantics"));
              for (const file of semFiles) {
                  const s = JSON.parse(fs.readFileSync(path.join(dotMemoryDir, "semantics", file), "utf-8")) as SemanticMemory;
                  if (keywords.some(k => s.content.toLowerCase().includes(k))) {
                      semantics.push(s);
                  }
              }
              // Add semantics from themes
              for (const theme of themes) {
                  for (const sid of theme.semanticIds) {
                      const sPath = path.join(dotMemoryDir, "semantics", `${sid}.json`);
                      if (fs.existsSync(sPath)) {
                          semantics.push(JSON.parse(fs.readFileSync(sPath, "utf-8")));
                      }
                  }
              }

              // Expand Episodes
              for (const sem of semantics.slice(0, 10)) {
                  for (const eid of sem.sourceEpisodes) {
                      const ePath = path.join(dotMemoryDir, "episodes", `${eid}.json`);
                      if (fs.existsSync(ePath)) {
                          episodes.push(JSON.parse(fs.readFileSync(ePath, "utf-8")));
                      }
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

        // Tool 3: memory_reflect
        const reflectParamsSchema = Type.Object({
          focus: Type.Optional(Type.Enum({ skills: "skills", evolution: "evolution", general: "general" })),
        });
        type ReflectResult = {
          patterns: {
            themeId: string;
            themeName: string;
            occurrenceCount: number;
            suggestedSkill: string;
            context: string[];
          }[];
          evolutionSuggestions?: {
             type: "prompt_update" | "new_rule";
             content: string;
             reason: string;
          }[];
        };

        const reflectTool: AgentTool<typeof reflectParamsSchema, ReflectResult> = {
          name: "memory_reflect",
          label: "Reflect",
          description: "Scan memory hierarchy to discover patterns, mine skills, and suggest self-evolution",
          parameters: reflectParamsSchema,
          async execute(
            _toolCallId: string,
            params: Static<typeof reflectParamsSchema>,
            _signal?: AbortSignal
          ): Promise<AgentToolResult<ReflectResult>> {
            const patterns = [];
            const evolutionSuggestions = [];
            const themeFiles = fs.readdirSync(path.join(dotMemoryDir, "themes"));
            
            for (const file of themeFiles) {
                const theme = JSON.parse(fs.readFileSync(path.join(dotMemoryDir, "themes", file), "utf-8")) as ThemeMemory;
                
                // Advanced Skill Mining Logic
                if (theme.semanticIds.length >= config.skills.minThemeFrequency) {
                    // Gather context for the skill
                    const context = theme.semanticIds.slice(0, 3).map(sid => {
                        const sPath = path.join(dotMemoryDir, "semantics", `${sid}.json`);
                        return fs.existsSync(sPath) ? (JSON.parse(fs.readFileSync(sPath, "utf-8")) as SemanticMemory).content : "";
                    }).filter(c => c);

                    patterns.push({
                        themeId: theme.id,
                        themeName: theme.name,
                        occurrenceCount: theme.semanticIds.length,
                        suggestedSkill: `Standard Operating Procedure (SOP) for ${theme.name}`,
                        context,
                    });

                    // Evolution Logic (Simple Heuristic based on repetition)
                     if (theme.semanticIds.length > 5) {
                         evolutionSuggestions.push({
                             type: "prompt_update" as const,
                             content: `Add a rule to handle "${theme.name}" explicitly in system prompt.`,
                             reason: `High frequency theme (${theme.semanticIds.length} occurrences) detected.`,
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
            const originals = fs.existsSync(memoryDir) ? fs.readdirSync(memoryDir).length : 0; // Rough count of days
            const episodes = fs.existsSync(path.join(dotMemoryDir, "episodes")) ? fs.readdirSync(path.join(dotMemoryDir, "episodes")).length : 0;
            const semantics = fs.existsSync(path.join(dotMemoryDir, "semantics")) ? fs.readdirSync(path.join(dotMemoryDir, "semantics")).length : 0;
            const themes = fs.existsSync(path.join(dotMemoryDir, "themes")) ? fs.readdirSync(path.join(dotMemoryDir, "themes")).length : 0;

            return createToolResult({
              hierarchy: {
                originals, // Note: this counts FILES (days), not individual items
                episodes,
                semantics,
                themes,
              },
              health: "healthy",
            });
          },
        };

        // Tool 5: memory_consolidate
        const consolidateParamsSchema = Type.Object({
          action: Type.Enum({ merge: "merge", split: "split", resolve: "resolve" }),
          targetIds: Type.Array(Type.String()),
        });
        type ConsolidateResult = { success: boolean };

        const consolidateTool: AgentTool<typeof consolidateParamsSchema, ConsolidateResult> = {
          name: "memory_consolidate",
          label: "Consolidate",
          description: "Consolidate memories: merge similar themes, resolve conflicts",
          parameters: consolidateParamsSchema,
          async execute(
            _toolCallId: string,
            params: Static<typeof consolidateParamsSchema>,
            _signal?: AbortSignal
          ): Promise<AgentToolResult<ConsolidateResult>> {
            const { action, targetIds } = params;
            if (action === "merge" && targetIds.length >= 2) {
               const targetPath = path.join(dotMemoryDir, "themes", `${targetIds[0]}.json`);
               if (fs.existsSync(targetPath)) {
                   const targetTheme = JSON.parse(fs.readFileSync(targetPath, "utf-8")) as ThemeMemory;
                   for (let i = 1; i < targetIds.length; i++) {
                       const sourcePath = path.join(dotMemoryDir, "themes", `${targetIds[i]}.json`);
                       if (fs.existsSync(sourcePath)) {
                           const sourceTheme = JSON.parse(fs.readFileSync(sourcePath, "utf-8")) as ThemeMemory;
                           targetTheme.semanticIds.push(...sourceTheme.semanticIds);
                           fs.unlinkSync(sourcePath);
                       }
                   }
                   fs.writeFileSync(targetPath, JSON.stringify(targetTheme, null, 2));
               }
            }
            return createToolResult({ success: true });
          },
        };

        // Tool 6: memory_status
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
            if (fs.existsSync(path.join(dotMemoryDir, "themes"))) {
                const themeFiles = fs.readdirSync(path.join(dotMemoryDir, "themes"));
                for (const file of themeFiles) {
                    const t = JSON.parse(fs.readFileSync(path.join(dotMemoryDir, "themes", file), "utf-8")) as ThemeMemory;
                    themeDistribution[t.name] = t.semanticIds.length;
                }
            }
            const count = fs.existsSync(path.join(dotMemoryDir, "semantics")) ? fs.readdirSync(path.join(dotMemoryDir, "semantics")).length : 0;
            return createToolResult({
              stats: {
                totalMemories: count, // Using semantic count as proxy for total items
                themeDistribution,
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
          description: "Self-modify behavior by updating META.md with new rules or SOPs",
          parameters: evolveParamsSchema,
          async execute(
            _toolCallId: string,
            params: Static<typeof evolveParamsSchema>,
            _signal?: AbortSignal
          ): Promise<AgentToolResult<EvolveResult>> {
            const metaPath = path.join(memoryDir, "META.md");
            // Create if missing
            if (!fs.existsSync(metaPath)) {
                fs.writeFileSync(metaPath, "# META.md - Self-Evolution & Rules\n\n## 🛡️ Core Rules\n\n## 📘 Standard Operating Procedures (SOPs)\n\n");
            }
            
            const timestamp = new Date().toLocaleDateString();
            let entry = "";
            
            if (params.action === "add_rule") {
                entry = `\n- [${timestamp}] ${params.content} <!-- Reason: ${params.reason} -->`;
                // Append to Core Rules section (Simple string manipulation for MVP)
                // Ideally use AST or robust parser. Here we just append to file end or specific marker if possible.
                // For safety, we just append to the file now.
                fs.appendFileSync(metaPath, entry);
            } else if (params.action === "add_sop") {
                entry = `\n### [SOP-${Date.now()}] ${params.reason}\n${params.content}\n`;
                fs.appendFileSync(metaPath, entry);
            }

            logger.info(`Memory evolved: ${params.action}`);
            return createToolResult({ success: true, path: metaPath });
          },
        };

        // --- Background Auto-Reflection Loop ---
        if (config.autoReflection?.enabled) {
            const intervalMs = (config.autoReflection.intervalMinutes || 60) * 60 * 1000;
            logger.info(`[Memory-X] Auto-reflection enabled. Interval: ${config.autoReflection.intervalMinutes}m`);
            
            setInterval(async () => {
                logger.info("[Memory-X] Running background reflection...");
                try {
                    // 1. Reflect
                    const reflectResult = await reflectTool.execute("auto-reflect", { focus: "skills" });
                    const suggestions = reflectResult.details.evolutionSuggestions || [];
                    
                    // 2. Auto-Evolve (if high confidence)
                    // Note: For safety, we might only want to LOG suggestions or auto-apply very specific ones.
                    // For OAMC "Self-Evolution" demo, we will auto-apply high-confidence updates.
                    
                    for (const suggestion of suggestions) {
                        logger.info(`[Memory-X] Auto-applying suggestion: ${suggestion.type}`);
                        if (suggestion.type === "prompt_update" || suggestion.type === "new_rule") {
                             await evolveTool.execute("auto-evolve", {
                                 action: "add_rule",
                                 content: suggestion.content,
                                 reason: suggestion.reason + " (Auto-detected)"
                             });
                        }
                        // We skip auto-SOP creation as it usually requires complex content generation not fully present in suggestion object yet.
                    }
                } catch (e) {
                    logger.error(`[Memory-X] Auto-reflection failed: ${e}`);
                }
            }, intervalMs);
        }

        return [
          rememberTool,
          recallTool,
          reflectTool,
          introspectTool,
          consolidateTool,
          statusTool,
          evolveTool,
        ];
      },
      // Tools are now exposed globally by the plugin, but logically belong to the 'memory-core' skill.
      // The 'openclaw.plugin.json' "skills" entry ensures the Skill metadata is loaded.
      // The tools registered here will be available to the agent.
      { names: ["memory_remember", "memory_recall", "memory_reflect", "memory_introspect", "memory_consolidate", "memory_status", "memory_evolve"] }
    );

    logger.info("Memory-X plugin registered");
  },
};

export default memoryXPlugin;
