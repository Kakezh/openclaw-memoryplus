/**
 * Memory-X Core Engine
 * Framework-agnostic memory engine that can be used with any agent framework
 */

import type {
  MemoryConfig,
  MemoryTool,
  MemoryToolResult,
  RememberOptions,
  RememberResult,
  RecallOptions,
  RecallResult,
  ReflectResult,
  MemoryStats,
  IMemoryStore,
  IEmbeddingProvider,
  AnyMemory,
  SemanticMemory,
  ThemeMemory,
  EpisodeMemory,
  OriginalMemory,
  MemoryLevel,
  MemoryEventHandler,
  MemoryEvent,
} from "./types.js";

const DEFAULT_CONFIG: Required<MemoryConfig> = {
  workspacePath: "./memory-data",
  storage: "sqlite",
  hierarchy: {
    maxThemeSize: 50,
    minThemeCoherence: 0.7,
    autoReorganize: true,
  },
  retrieval: {
    themeTopK: 3,
    semanticTopK: 5,
    maxTokens: 4000,
  },
  skills: {
    autoMineFromThemes: true,
    minThemeFrequency: 3,
  },
};

export class MemoryEngine {
  private config: Required<MemoryConfig>;
  private store: IMemoryStore | null = null;
  private embeddingProvider: IEmbeddingProvider | null = null;
  private eventHandlers: Map<string, MemoryEventHandler[]> = new Map();
  private initialized = false;

  constructor(config: MemoryConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config } as Required<MemoryConfig>;
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    this.store = await this.createStore();
    this.initialized = true;
  }

  private async createStore(): Promise<IMemoryStore> {
    if (this.config.storage === "memory") {
      return new InMemoryStore();
    }

    const { SqlJsMemoryStore } = await import("../store/sqljs-store.js");
    const store = new SqlJsMemoryStore(this.config.workspacePath);
    await store.init();
    return store;
  }

  setEmbeddingProvider(provider: IEmbeddingProvider): void {
    this.embeddingProvider = provider;
  }

  on(event: string, handler: MemoryEventHandler): void {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
  }

  private emit(type: MemoryEvent["type"], payload: any): void {
    const event: MemoryEvent = { type, payload, timestamp: Date.now() };
    const handlers = this.eventHandlers.get(type) || [];
    handlers.forEach((h) => h(event));
  }

  async remember(content: string, options: RememberOptions = {}): Promise<RememberResult> {
    await this.ensureInit();

    const timestamp = Date.now();
    const sessionId = "default";

    const original: OriginalMemory = {
      id: `orig-${timestamp}`,
      content,
      timestamp,
      sessionId,
      speaker: "user",
    };

    const episode: EpisodeMemory = {
      id: `ep-${timestamp}`,
      summary: content.substring(0, 100),
      originalIds: [original.id],
      startTime: timestamp,
      endTime: timestamp,
      boundaryType: "topic",
      coherenceScore: options.confidence || 0.5,
    };

    const semantic: SemanticMemory = {
      id: `sem-${timestamp}`,
      content,
      type: options.type || "fact",
      confidence: options.confidence || 0.5,
      sourceEpisodes: [episode.id],
      entityRefs: options.entities || [],
    };

    const theme = this.findOrCreateTheme(semantic);

    this.store!.save(original);
    this.store!.save(episode);
    this.store!.save(semantic);
    this.store!.save(theme);

    this.emit("memory:created", { original, episode, semantic, theme });

    return {
      success: true,
      ids: {
        original: original.id,
        episode: episode.id,
        semantic: semantic.id,
        theme: theme.id,
      },
    };
  }

  async recall(query: string, options: RecallOptions = {}): Promise<RecallResult> {
    await this.ensureInit();

    const semantics = this.store!.search(query, { level: "semantic", limit: 10 });

    const themeIds = new Set<string>();
    for (const sem of semantics) {
      const s = sem as SemanticMemory;
      const themes = this.store!.search(s.content, { level: "theme", limit: 1 });
      themes.forEach((t) => themeIds.add(t.id));
    }

    const themes = Array.from(themeIds)
      .map((id) => this.store!.get<ThemeMemory>(id, "theme"))
      .filter((t): t is ThemeMemory => t !== null);

    const episodeIds = new Set<string>();
    for (const sem of semantics) {
      const s = sem as SemanticMemory;
      s.sourceEpisodes.forEach((eid) => episodeIds.add(eid));
    }

    const episodes = Array.from(episodeIds)
      .map((id) => this.store!.get<EpisodeMemory>(id, "episode"))
      .filter((e): e is EpisodeMemory => e !== null);

    const totalTokens = this.estimateTokens(
      themes.map((t) => t.name).join(" ") +
        semantics.map((s) => (s as SemanticMemory).content).join(" ") +
        episodes.map((e) => e.summary).join(" ")
    );

    return {
      evidence: {
        themes: themes.map((t) => ({ id: t.id, name: t.name })),
        semantics: semantics.map((s) => ({
          id: s.id,
          content: (s as SemanticMemory).content,
        })),
        episodes: episodes.map((e) => ({ id: e.id, summary: e.summary })),
      },
      metrics: {
        totalTokens,
        evidenceDensity: semantics.length / Math.max(1, totalTokens / 100),
      },
    };
  }

  async reflect(): Promise<ReflectResult> {
    await this.ensureInit();

    const patterns: ReflectResult["patterns"] = [];
    const themes = this.store!.search("", { level: "theme", limit: 100 });

    for (const theme of themes) {
      const t = theme as ThemeMemory;
      if (t.semanticIds.length >= (this.config.skills?.minThemeFrequency || 3)) {
        patterns.push({
          themeId: t.id,
          themeName: t.name,
          occurrenceCount: t.semanticIds.length,
          suggestedSkill: `SOP for ${t.name}`,
        });
      }
    }

    return { patterns };
  }

  stats(): MemoryStats {
    if (!this.store) {
      return { total: 0, byLevel: { original: 0, episode: 0, semantic: 0, theme: 0 }, avgAccessCount: 0, avgRetentionScore: 1 };
    }
    return this.store.stats();
  }

  getTools(): MemoryTool[] {
    return [
      {
        name: "memory_remember",
        description: "Store a memory with automatic hierarchy classification",
        parameters: {
          type: "object",
          properties: {
            content: { type: "string", description: "The content to remember" },
            type: {
              type: "string",
              enum: ["fact", "preference", "goal", "constraint", "event"],
              description: "Type of memory",
            },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            entities: { type: "array", items: { type: "string" } },
          },
          required: ["content"],
        },
        execute: async (params: any) => {
          const result = await this.remember(params.content, params);
          return { success: true, data: result };
        },
      },
      {
        name: "memory_recall",
        description: "Retrieve memories using semantic search",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            maxTokens: { type: "number", default: 4000 },
          },
          required: ["query"],
        },
        execute: async (params: any) => {
          const result = await this.recall(params.query, params);
          return { success: true, data: result };
        },
      },
      {
        name: "memory_reflect",
        description: "Discover patterns from memory themes",
        parameters: {
          type: "object",
          properties: {},
        },
        execute: async () => {
          const result = await this.reflect();
          return { success: true, data: result };
        },
      },
      {
        name: "memory_status",
        description: "Get memory system statistics",
        parameters: {
          type: "object",
          properties: {},
        },
        execute: async () => {
          const result = this.stats();
          return { success: true, data: result };
        },
      },
    ];
  }

  async executeTool(name: string, params: any): Promise<MemoryToolResult<any>> {
    const tools = this.getTools();
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      return { success: false, data: null, error: `Tool not found: ${name}` };
    }
    return tool.execute(params);
  }

  private findOrCreateTheme(semantic: SemanticMemory): ThemeMemory {
    for (const entity of semantic.entityRefs) {
      const themes = this.store!.search(entity, { level: "theme", limit: 1 });
      if (themes.length > 0) {
        const theme = themes[0] as ThemeMemory;
        theme.semanticIds.push(semantic.id);
        theme.updatedAt = Date.now();
        this.store!.save(theme);
        return theme;
      }
    }

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

  private async ensureInit(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  close(): void {
    this.store?.close();
    this.store = null;
    this.initialized = false;
  }
}

class InMemoryStore implements IMemoryStore {
  private memories: Map<string, Map<string, AnyMemory>> = new Map();

  constructor() {
    this.memories.set("original", new Map());
    this.memories.set("episode", new Map());
    this.memories.set("semantic", new Map());
    this.memories.set("theme", new Map());
  }

  save(memory: AnyMemory): void {
    const level = this.getLevel(memory);
    this.memories.get(level)!.set(memory.id, memory);
  }

  get<T extends AnyMemory>(id: string, level: MemoryLevel): T | null {
    return (this.memories.get(level)?.get(id) as T) || null;
  }

  search(query: string, options: { level?: MemoryLevel; limit?: number } = {}): AnyMemory[] {
    const { level, limit = 10 } = options;
    const results: AnyMemory[] = [];
    const lowerQuery = query.toLowerCase();

    const levels = level ? [level] : (["theme", "semantic", "episode", "original"] as MemoryLevel[]);

    for (const l of levels) {
      for (const memory of this.memories.get(l)!.values()) {
        const content = this.getContent(memory);
        if (content.toLowerCase().includes(lowerQuery)) {
          results.push(memory);
        }
        if (results.length >= limit) break;
      }
      if (results.length >= limit) break;
    }

    return results;
  }

  delete(id: string): boolean {
    for (const [, map] of this.memories) {
      if (map.has(id)) {
        map.delete(id);
        return true;
      }
    }
    return false;
  }

  count(level?: MemoryLevel): number {
    if (level) {
      return this.memories.get(level)?.size || 0;
    }
    let total = 0;
    for (const [, map] of this.memories) {
      total += map.size;
    }
    return total;
  }

  stats(): MemoryStats {
    return {
      total: this.count(),
      byLevel: {
        original: this.count("original"),
        episode: this.count("episode"),
        semantic: this.count("semantic"),
        theme: this.count("theme"),
      },
      avgAccessCount: 0,
      avgRetentionScore: 1,
    };
  }

  close(): void {
    this.memories.clear();
  }

  private getLevel(memory: AnyMemory): MemoryLevel {
    if ("originalIds" in memory) return "episode";
    if ("sourceEpisodes" in memory) return "semantic";
    if ("semanticIds" in memory) return "theme";
    return "original";
  }

  private getContent(memory: AnyMemory): string {
    if ("content" in memory) return memory.content;
    if ("summary" in memory) return memory.summary;
    if ("description" in memory) return memory.description;
    return "";
  }
}
