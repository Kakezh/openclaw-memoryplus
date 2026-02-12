/**
 * Memory-X Core Types
 * Framework-agnostic type definitions
 */

// ============================================================================
// Memory Hierarchy Types
// ============================================================================

export interface OriginalMemory {
  id: string;
  content: string;
  timestamp: number;
  sessionId: string;
  speaker: "user" | "agent";
  metadata?: {
    sentiment?: number;
    importance?: number;
  };
}

export interface EpisodeMemory {
  id: string;
  summary: string;
  originalIds: string[];
  startTime: number;
  endTime: number;
  boundaryType: "time" | "topic" | "intent";
  coherenceScore: number;
}

export interface SemanticMemory {
  id: string;
  content: string;
  type: "fact" | "preference" | "goal" | "constraint" | "event";
  confidence: number;
  sourceEpisodes: string[];
  entityRefs: string[];
  validityPeriod?: { start: number; end?: number };
  conflictingWith?: string[];
}

export interface ThemeMemory {
  id: string;
  name: string;
  description: string;
  semanticIds: string[];
  parentTheme?: string;
  childThemes?: string[];
  coherenceScore: number;
  createdAt: number;
  updatedAt: number;
}

export type AnyMemory = OriginalMemory | EpisodeMemory | SemanticMemory | ThemeMemory;
export type MemoryLevel = "original" | "episode" | "semantic" | "theme";

// ============================================================================
// Tool Types (Framework-agnostic)
// ============================================================================

export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JSONSchema;
  enum?: string[];
  description?: string;
  default?: any;
  minimum?: number;
  maximum?: number;
}

export interface MemoryTool<TParams = any, TResult = any> {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute(params: TParams): Promise<MemoryToolResult<TResult>>;
}

export interface MemoryToolResult<T> {
  success: boolean;
  data: T;
  error?: string;
}

// ============================================================================
// Engine Types
// ============================================================================

export interface MemoryConfig {
  workspacePath?: string;
  storage?: "sqlite" | "memory";
  hierarchy?: {
    maxThemeSize?: number;
    minThemeCoherence?: number;
    autoReorganize?: boolean;
  };
  retrieval?: {
    themeTopK?: number;
    semanticTopK?: number;
    maxTokens?: number;
  };
  skills?: {
    autoMineFromThemes?: boolean;
    minThemeFrequency?: number;
  };
}

export interface RememberOptions {
  type?: "fact" | "preference" | "goal" | "constraint" | "event";
  confidence?: number;
  entities?: string[];
}

export interface RememberResult {
  success: boolean;
  ids: {
    original: string;
    episode: string;
    semantic: string;
    theme: string;
  };
}

export interface RecallOptions {
  maxTokens?: number;
}

export interface RecallResult {
  evidence: {
    themes: { id: string; name: string }[];
    semantics: { id: string; content: string; score?: number }[];
    episodes: { id: string; summary: string }[];
  };
  metrics: {
    totalTokens: number;
    evidenceDensity: number;
  };
}

export interface ReflectResult {
  patterns: {
    themeId: string;
    themeName: string;
    occurrenceCount: number;
    suggestedSkill: string;
  }[];
  evolutionSuggestions?: {
    type: "prompt_update" | "new_rule";
    content: string;
    reason: string;
  }[];
}

export interface MemoryStats {
  total: number;
  byLevel: Record<MemoryLevel, number>;
  avgAccessCount: number;
  avgRetentionScore: number;
}

// ============================================================================
// Store Interface
// ============================================================================

export interface IMemoryStore {
  save(memory: AnyMemory): void;
  get<T extends AnyMemory>(id: string, level: MemoryLevel): T | null;
  search(query: string, options?: { level?: MemoryLevel; limit?: number }): AnyMemory[];
  delete(id: string): boolean;
  count(level?: MemoryLevel): number;
  stats(): MemoryStats;
  close(): void;
}

// ============================================================================
// Embedding Interface
// ============================================================================

export interface IEmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

// ============================================================================
// Event Types
// ============================================================================

export type MemoryEventType =
  | "memory:created"
  | "memory:updated"
  | "memory:deleted"
  | "memory:conflict"
  | "memory:forget";

export interface MemoryEvent {
  type: MemoryEventType;
  payload: any;
  timestamp: number;
}

export type MemoryEventHandler = (event: MemoryEvent) => void;
