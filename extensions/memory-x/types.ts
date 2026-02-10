/**
 * Unified Memory-X Types
 * Based on xMemory (Four-level Hierarchy) and Memory Taxonomy (3D Classification)
 */

// ============================================================================
// xMemory: Four-Level Hierarchy
// ============================================================================

/** Level 1: Original - Raw messages with timestamps and coreference chains */
export interface OriginalMemory {
  id: string;
  content: string;
  timestamp: number;
  sessionId: string;
  speaker: 'user' | 'agent';
  metadata?: {
    sentiment?: number;
    importance?: number;
  };
}

/** Level 2: Episode - Contiguous message blocks with boundary detection */
export interface EpisodeMemory {
  id: string;
  summary: string;
  originalIds: string[];
  startTime: number;
  endTime: number;
  boundaryType: 'time' | 'topic' | 'intent';
  coherenceScore: number;
}

/** Level 3: Semantic - Reusable facts, decoupled from similar histories */
export interface SemanticMemory {
  id: string;
  content: string;
  type: 'fact' | 'preference' | 'goal' | 'constraint' | 'event';
  confidence: number;
  sourceEpisodes: string[];
  entityRefs: string[];
  validityPeriod?: { start: number; end?: number };
  // For conflict detection
  conflictingWith?: string[];
}

/** Level 4: Theme - High-level concepts like "career planning" */
export interface ThemeMemory {
  id: string;
  name: string;
  description: string;
  semanticIds: string[];
  parentTheme?: string;
  childThemes?: string[];
  coherenceScore: number;  // Intra-theme coherence
  createdAt: number;
  updatedAt: number;
}

/** Complete hierarchy structure */
export interface MemoryHierarchy {
  originals: Map<string, OriginalMemory>;
  episodes: Map<string, EpisodeMemory>;
  semantics: Map<string, SemanticMemory>;
  themes: Map<string, ThemeMemory>;
}

// ============================================================================
// Memory Taxonomy: 3D Classification
// ============================================================================

/** Form Dimension: Where does memory exist? */
export type MemoryForm = 
  | 'token'        // Text tokens in context or via RAG
  | 'parametric'   // Model weights via fine-tuning/LoRA
  | 'latent';      // Hidden states/activations

/** Function Dimension: What is memory used for? */
export type MemoryFunction =
  | 'factual'      // World objective truth (Paris is capital of France)
  | 'experiential' // Specific event records (User said likes coffee yesterday)
  | 'working';     // Temporary buffer, cleared after task

/** Dynamics Dimension: How does memory evolve? */
export interface MemoryDynamics {
  // Forgetting curve
  calculateRetention(memory: AnyMemory, currentTime: number): number;
  
  // Memory consolidation
  consolidate(memories: AnyMemory[]): AnyMemory;
  
  // Conflict resolution
  resolveConflict(memories: AnyMemory[]): AnyMemory;
  
  // Memory reconstruction with new evidence
  reconstruct(memory: AnyMemory, newEvidence: AnyMemory): AnyMemory;
}

export type AnyMemory = OriginalMemory | EpisodeMemory | SemanticMemory | ThemeMemory;

// ============================================================================
// xMemory: Sparsity-Semantics Objective
// ============================================================================

export interface SparsitySemanticsObjective {
  // Sparsity score: balanced theme sizes
  calculateSparsity(themes: ThemeMemory[]): number;
  
  // Semantics score: similar semantics close, different themes apart
  calculateSemantics(semantics: SemanticMemory[], themes: ThemeMemory[]): number;
  
  // Combined objective: f(P) = SparsityScore + SemScore
  evaluatePartition(semantics: SemanticMemory[], themes: ThemeMemory[]): number;
  
  // Decision thresholds
  shouldSplit(theme: ThemeMemory, maxSize: number): boolean;
  shouldMerge(theme1: ThemeMemory, theme2: ThemeMemory, minCoherence: number): boolean;
}

// ============================================================================
// xMemory: Top-Down Retrieval
// ============================================================================

export interface TopDownRetrievalConfig {
  themeTopK: number;
  semanticTopK: number;
  uncertaintyThreshold: number;
  maxTokens: number;
  evidenceDensityThreshold: number;
}

export interface RetrievedEvidence {
  themes: ThemeMemory[];
  semantics: SemanticMemory[];
  episodes: EpisodeMemory[];
  originals: OriginalMemory[];
  
  // Metrics
  totalTokens: number;
  evidenceDensity: number;
  coverageScore: number;
}

// ============================================================================
// Memory Store Configuration
// ============================================================================

export interface MemoryStoreConfig {
  // Factual memory: long-term stable, can be parametric
  factual: {
    form: 'parametric' | 'token';
    updateStrategy: 'overwrite' | 'version';
    confidenceThreshold: number;
  };
  
  // Experiential memory: temporal, full context preserved
  experiential: {
    form: 'token' | 'latent';
    hierarchyEnabled: boolean;
    autoReorganize: boolean;
  };
  
  // Working memory: temporary
  working: {
    maxTurns: number;
    maxTokens: number;
    evictionPolicy: 'lru' | 'priority';
  };
}

// ============================================================================
// Unified Memory-X Configuration
// ============================================================================

export interface MemorySkillsConfig {
  autoMineFromThemes: boolean;
  minThemeFrequency: number;
}

export interface MemoryXConfig {
  enabled: boolean;
  workspacePath: string;
  dbPath: string;
  
  // Hierarchy management
  hierarchy: {
    maxThemeSize: number;
    minThemeCoherence: number;
    autoReorganize: boolean;
    reorganizeInterval: number;  // Hours
  };
  
  // Retrieval
  retrieval: TopDownRetrievalConfig;
  
  // Taxonomy
  taxonomy: {
    separateFactualExperiential: boolean;
    parametricFactualThreshold: number;
  };
  
  // Store
  store: MemoryStoreConfig;
  
  // Skills
  skills: MemorySkillsConfig;
}

// ============================================================================
// Skill Mining (Integrated)
// ============================================================================

export interface PotentialSkill {
  id: string;
  name: string;
  description: string;
  sourceThemeId: string;
  triggerPatterns: string[];
  workflowSteps: string[];
  toolsUsed: string[];
  occurrenceCount: number;
  confidence: number;
}

// ============================================================================
// Diagnostics
// ============================================================================

export interface MemoryDiagnostics {
  hierarchyStats: {
    originalCount: number;
    episodeCount: number;
    semanticCount: number;
    themeCount: number;
    avgThemeCoherence: number;
  };
  
  retrievalStats: {
    avgTokensUsed: number;
    avgEvidenceDensity: number;
    cacheHitRate: number;
  };
  
  taxonomyStats: {
    factualCount: number;
    experientialCount: number;
    workingCount: number;
  };
}
