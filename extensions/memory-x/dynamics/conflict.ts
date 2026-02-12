/**
 * Conflict Detection
 * Detects and resolves conflicts between memories
 */

import type { SQLiteMemoryStore } from "../store/sqlite-store.js";
import type { VectorIndex } from "../store/vector-index.js";
import type { SemanticMemory, AnyMemory } from "../types.js";

export interface Conflict {
  id: string;
  type: "factual" | "temporal" | "preference";
  memory1: AnyMemory;
  memory2: AnyMemory;
  reason: string;
  severity: "low" | "medium" | "high";
}

export interface ConflictResolution {
  strategy: "keep_newest" | "keep_highest_confidence" | "merge" | "ask_user";
  winner: string;
  reason: string;
}

export class ConflictDetector {
  private store: SQLiteMemoryStore;
  private vectorIndex: VectorIndex;

  // Similarity threshold for detecting conflicts
  private readonly SIMILARITY_THRESHOLD = 0.85;
  // Confidence difference threshold
  private readonly CONFIDENCE_DIFF_THRESHOLD = 0.1;

  constructor(store: SQLiteMemoryStore, vectorIndex: VectorIndex) {
    this.store = store;
    this.vectorIndex = vectorIndex;
  }

  /**
   * Detect conflicts for a new memory
   */
  async detect(newMemory: SemanticMemory): Promise<Conflict[]> {
    const conflicts: Conflict[] = [];

    // Find similar memories
    const similar = await this.findSimilarMemories(newMemory);

    for (const result of similar) {
      const existingMemory = result.memory as SemanticMemory;
      const conflict = this.analyzeConflict(newMemory, existingMemory, result.score);
      if (conflict) {
        conflicts.push(conflict);
      }
    }

    return conflicts;
  }

  /**
   * Find similar memories using vector search
   */
  private async findSimilarMemories(memory: SemanticMemory): Promise<{ memory: AnyMemory; score: number }[]> {
    // Search for similar content
    const results = await this.vectorIndex.search(memory.content, {
      level: "semantic",
      limit: 10,
      minScore: this.SIMILARITY_THRESHOLD,
    });

    // Filter out the memory itself
    return results.filter((r) => r.memory.id !== memory.id);
  }

  /**
   * Analyze if two memories conflict
   */
  private analyzeConflict(
    newMemory: SemanticMemory,
    existingMemory: SemanticMemory,
    similarity: number
  ): Conflict | null {
    // Check for factual conflicts
    if (newMemory.type === "fact" && existingMemory.type === "fact") {
      if (this.isFactualConflict(newMemory, existingMemory)) {
        return {
          id: `conflict-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: "factual",
          memory1: newMemory,
          memory2: existingMemory,
          reason: `Similar facts with different content (similarity: ${similarity.toFixed(2)})`,
          severity: this.calculateSeverity(newMemory, existingMemory),
        };
      }
    }

    // Check for preference conflicts
    if (newMemory.type === "preference" && existingMemory.type === "preference") {
      if (this.isPreferenceConflict(newMemory, existingMemory)) {
        return {
          id: `conflict-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: "preference",
          memory1: newMemory,
          memory2: existingMemory,
          reason: `Conflicting preferences detected`,
          severity: "medium",
        };
      }
    }

    // Check for temporal conflicts
    if (this.hasTemporalConflict(newMemory, existingMemory)) {
      return {
        id: `conflict-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: "temporal",
        memory1: newMemory,
        memory2: existingMemory,
        reason: `Temporal conflict: overlapping validity periods`,
        severity: "low",
      };
    }

    return null;
  }

  /**
   * Check if two facts conflict
   */
  private isFactualConflict(mem1: SemanticMemory, mem2: SemanticMemory): boolean {
    // Simple heuristic: if content is similar but not identical
    const content1 = mem1.content.toLowerCase().trim();
    const content2 = mem2.content.toLowerCase().trim();

    // If exactly the same, not a conflict
    if (content1 === content2) return false;

    // If same entity but different facts
    const entities1 = new Set(mem1.entityRefs || []);
    const entities2 = new Set(mem2.entityRefs || []);

    const hasCommonEntity = [...entities1].some((e) => entities2.has(e));
    if (hasCommonEntity && content1 !== content2) {
      return true;
    }

    return false;
  }

  /**
   * Check if two preferences conflict
   */
  private isPreferenceConflict(mem1: SemanticMemory, mem2: SemanticMemory): boolean {
    // Check for negation patterns
    const negationPatterns = ["not", "don't", "doesn't", "never", "no"];

    const content1 = mem1.content.toLowerCase();
    const content2 = mem2.content.toLowerCase();

    const hasNegation1 = negationPatterns.some((n) => content1.includes(n));
    const hasNegation2 = negationPatterns.some((n) => content2.includes(n));

    // If one has negation and the other doesn't, potential conflict
    return hasNegation1 !== hasNegation2;
  }

  /**
   * Check for temporal conflicts
   */
  private hasTemporalConflict(mem1: SemanticMemory, mem2: SemanticMemory): boolean {
    const period1 = mem1.validityPeriod;
    const period2 = mem2.validityPeriod;

    if (!period1 || !period2) return false;

    // Check for overlapping periods
    const start1 = period1.start;
    const end1 = period1.end || Infinity;
    const start2 = period2.start;
    const end2 = period2.end || Infinity;

    return !(end1 < start2 || end2 < start1);
  }

  /**
   * Calculate conflict severity
   */
  private calculateSeverity(mem1: SemanticMemory, mem2: SemanticMemory): "low" | "medium" | "high" {
    const confDiff = Math.abs((mem1.confidence || 0.5) - (mem2.confidence || 0.5));

    if (confDiff > this.CONFIDENCE_DIFF_THRESHOLD) {
      return "low"; // One is clearly more confident
    }

    if (confDiff > 0.05) {
      return "medium";
    }

    return "high"; // Similar confidence, hard to resolve
  }

  /**
   * Resolve a conflict
   */
  resolve(conflict: Conflict): ConflictResolution {
    const mem1 = conflict.memory1 as SemanticMemory;
    const mem2 = conflict.memory2 as SemanticMemory;

    // Strategy 1: Keep highest confidence
    const conf1 = mem1.confidence || 0.5;
    const conf2 = mem2.confidence || 0.5;

    if (Math.abs(conf1 - conf2) > this.CONFIDENCE_DIFF_THRESHOLD) {
      return {
        strategy: "keep_highest_confidence",
        winner: conf1 > conf2 ? mem1.id : mem2.id,
        reason: `Confidence difference: ${Math.abs(conf1 - conf2).toFixed(2)}`,
      };
    }

    // Strategy 2: Keep newest
    const time1 = (mem1 as any).createdAt || 0;
    const time2 = (mem2 as any).createdAt || 0;

    if (Math.abs(time1 - time2) > 1000 * 60 * 60) {
      // More than 1 hour difference
      return {
        strategy: "keep_newest",
        winner: time1 > time2 ? mem1.id : mem2.id,
        reason: `Time difference: ${Math.abs(time1 - time2) / 1000 / 60} minutes`,
      };
    }

    // Strategy 3: Ask user (default for high severity)
    if (conflict.severity === "high") {
      return {
        strategy: "ask_user",
        winner: "",
        reason: "High severity conflict requires user decision",
      };
    }

    // Strategy 4: Merge (for low severity)
    return {
      strategy: "merge",
      winner: mem1.id,
      reason: "Low severity conflict, merging memories",
    };
  }

  /**
   * Auto-resolve all conflicts
   */
  async autoResolve(conflicts: Conflict[]): Promise<Map<string, ConflictResolution>> {
    const resolutions = new Map<string, ConflictResolution>();

    for (const conflict of conflicts) {
      const resolution = this.resolve(conflict);
      resolutions.set(conflict.id, resolution);

      // Apply resolution
      if (resolution.strategy === "keep_highest_confidence" || resolution.strategy === "keep_newest") {
        const loser = resolution.winner === conflict.memory1.id ? conflict.memory2.id : conflict.memory1.id;
        this.store.delete(loser);
      }
    }

    return resolutions;
  }

  /**
   * Get all conflicts in the system
   */
  async getAllConflicts(): Promise<Conflict[]> {
    const conflicts: Conflict[] = [];
    const memories = this.store.search("", { level: "semantic", limit: 1000 });

    for (let i = 0; i < memories.length; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        const mem1 = memories[i] as SemanticMemory;
        const mem2 = memories[j] as SemanticMemory;

        const conflict = this.analyzeConflict(mem1, mem2, 0.9);
        if (conflict) {
          conflicts.push(conflict);
        }
      }
    }

    return conflicts;
  }
}
