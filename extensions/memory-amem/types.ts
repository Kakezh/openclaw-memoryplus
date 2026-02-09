/**
 * AMemGym-style Memory Types
 * Based on AMemGym: Interactive Memory Benchmarking for Assistants
 */

// Memory entry types
export type AMemEntryType = 
  | "fact"           // Objective facts
  | "preference"     // User preferences
  | "goal"          // User goals
  | "constraint"    // Constraints/rules
  | "relationship"  // Relationship info
  | "event";        // Event records

// AMemGym-style memory entry
export interface AMemEntry {
  id: string;
  type: AMemEntryType;
  content: string;
  confidence: number;        // 0-1, LLM self-assessment
  importance: number;        // 0-1, calculated
  source: string;            // Session ID or file
  createdAt: number;
  updatedAt: number;
  accessCount: number;
  lastAccessedAt?: number;
  entityRefs: string[];      // @entity references
  tags: string[];
  expirationAt?: number;
  // For evolution tracking
  generation: number;        // Evolution generation
  parentId?: string;         // Parent entry if evolved
}

// Write decision result
export interface WriteDecision {
  shouldWrite: boolean;
  type: AMemEntryType;
  confidence: number;
  importance: number;
  reason: string;
  consolidationTarget?: string;  // Similar entry to merge with
  suggestedTags: string[];
  suggestedEntities: string[];
}

// Memory operation diagnostics (AMemGym 3-failure model)
export interface MemoryDiagnostics {
  // Write failures
  writeFailures: Array<{
    id: string;
    content: string;
    reason: "low_confidence" | "duplicate" | "incomplete_info" | "low_importance" | "other";
    confidence: number;
    timestamp: number;
    context: string;
  }>;
  
  // Read failures
  readFailures: Array<{
    query: string;
    expected: string;
    retrieved: string[];
    reason: "query_mismatch" | "retrieval_error" | "ranking_error" | "missing_index";
    timestamp: number;
  }>;
  
  // Utilization failures
  utilizationFailures: Array<{
    memoryId: string;
    memoryContent: string;
    context: string;
    error: string;
    reason: "context_interference" | "reasoning_error" | "irrelevant_info" | "conflicting_info";
    timestamp: number;
  }>;
}

// Performance metrics (AMemGym-style)
export interface AMemMetrics {
  // Write metrics
  writeSuccessRate: number;
  avgWriteConfidence: number;
  writeDecisionAccuracy: number;
  
  // Read metrics
  readPrecision: number;
  readRecall: number;
  avgRetrievalLatency: number;
  
  // Utilization metrics
  utilizationRate: number;
  contextEfficiency: number;  // Useful memories / total memories provided
  
  // Overall (AMemGym normalized score)
  overallScore: number;
  
  // Trends
  trend: {
    writeSuccess: "up" | "down" | "stable";
    readRecall: "up" | "down" | "stable";
    utilization: "up" | "down" | "stable";
  };
}

// Evolution state
export interface EvolutionState {
  generation: number;
  writePrompt: string;
  readPrompt: string;
  strategy: EvolutionStrategy;
  metrics: AMemMetrics;
  improvements: Array<{
    generation: number;
    metric: string;
    delta: number;
  }>;
}

export interface EvolutionStrategy {
  writeThreshold: number;           // Importance threshold for writing
  confidenceCalibration: "strict" | "balanced" | "lenient";
  retrievalStrategy: "vector" | "hybrid" | "keyword";
  vectorWeight: number;
  keywordWeight: number;
  maxContextMemories: number;
}

// Search result with diagnostic info
export interface AMemSearchResult {
  entry: AMemEntry;
  score: number;
  matchType: "vector" | "keyword" | "hybrid";
  diagnostic?: {
    expectedRank?: number;
    actualRank: number;
    querySimilarity: number;
  };
}

// Configuration
export interface AMemConfig {
  enabled: boolean;
  workspacePath: string;
  dbPath: string;
  
  // Write settings
  writeThreshold: number;           // 0-1, default 0.7
  minConfidence: number;            // 0-1, default 0.5
  autoMergeDuplicates: boolean;
  similarityThreshold: number;      // 0-1, default 0.85
  
  // Read settings
  retrievalStrategy: "vector" | "hybrid" | "keyword";
  vectorWeight: number;
  keywordWeight: number;
  maxResults: number;
  minScore: number;
  
  // Diagnostics
  diagnosticsEnabled: boolean;
  logLevel: "none" | "error" | "warn" | "info" | "verbose";
  
  // Evolution
  evolutionEnabled: boolean;
  evolutionInterval: number;        // Sessions between evolutions
  feedbackLoop: "open" | "closed";  // Closed = self-correcting
}

// Tool interfaces for Agent
export interface AMemWriteToolParams {
  content: string;
  type: AMemEntryType;
  confidence?: number;
  entityRefs?: string[];
  tags?: string[];
}

export interface AMemUpdateToolParams {
  id: string;
  content?: string;
  confidence?: number;
  mergeStrategy?: "replace" | "append" | "incremental";
}

export interface AMemQueryToolParams {
  query: string;
  type?: AMemEntryType;
  entityRef?: string;
  timeRange?: { start: number; end: number };
  minConfidence?: number;
  limit?: number;
}

export interface AMemDeleteToolParams {
  id: string;
  reason?: string;
}
