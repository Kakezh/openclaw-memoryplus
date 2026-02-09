/**
 * Memory Bank Types
 * Based on Workspace Memory v2 specification
 */

// Memory entry types from ## Retain section
export type MemoryEntryType = "W" | "B" | "O" | "S";

export const MemoryEntryTypeLabels: Record<MemoryEntryType, string> = {
  W: "world",        // Objective facts about the world
  B: "experience",   // Biographical/experience (what agent did)
  O: "opinion",      // Subjective preferences/judgments
  S: "summary",      // Observation/summary (usually generated)
};

// Parsed memory entry from ## Retain
export interface ParsedMemoryEntry {
  id: string;
  type: MemoryEntryType;
  content: string;
  confidence?: number;     // For opinions: O(c=0.95)
  entities: string[];      // @Peter, @warelay
  source: string;          // memory/2025-11-27.md
  lineNumber: number;
  timestamp?: number;      // Parsed from content if present
}

// Bank file types
export type BankFileType = "world" | "experience" | "opinions";

export interface BankFileConfig {
  filename: string;
  type: BankFileType;
  description: string;
}

// Entity page
export interface EntityPage {
  id: string;              // slug: Peter, The-Castle
  name: string;            // Display name
  summary: string;         // Brief description
  facts: string[];         // Related facts
  relatedEntities: string[];
  lastUpdated: number;
}

// Opinion with confidence tracking
export interface OpinionEntry {
  id: string;
  statement: string;
  confidence: number;      // 0-1
  entityRefs: string[];
  lastUpdated: number;
  evidence: {
    supporting: string[];    // Fact IDs that support
    contradicting: string[]; // Fact IDs that contradict
  };
  source: string;
}

// Retain section parse result
export interface RetainSection {
  entries: ParsedMemoryEntry[];
  sourceFile: string;
  date: string;            // YYYY-MM-DD
}

// Bank directory structure
export interface BankStructure {
  world: string;           // Path to world.md
  experience: string;      // Path to experience.md
  opinions: string;        // Path to opinions.md
  entities: string;        // Path to entities/ directory
}

// Memory bank configuration
export interface MemoryBankConfig {
  enabled: boolean;
  workspacePath: string;
  parseRetain: boolean;
  trackOpinions: boolean;
  reflectInterval: "daily" | "weekly" | "manual";
  autoUpdateEntities: boolean;
}

// Search result from bank
export interface BankSearchResult {
  kind: "world" | "experience" | "opinion" | "entity";
  content: string;
  timestamp?: number;
  entities: string[];
  confidence?: number;
  source: string;
  citation: string;
}
