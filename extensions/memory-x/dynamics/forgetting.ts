/**
 * Forgetting Mechanism
 * Implements Ebbinghaus forgetting curve and automatic memory lifecycle management
 */

import type { SQLiteMemoryStore } from "../store/sqlite-store.js";
import type { AnyMemory, SemanticMemory } from "../types.js";

interface MemoryScore {
  id: string;
  retentionScore: number;
  importanceScore: number;
  accessFrequency: number;
  recency: number;
  age: number;
}

interface ForgettingStats {
  total: number;
  archived: number;
  deleted: number;
  retained: number;
  candidatesForArchive: number;
}

export class ForgettingMechanism {
  private store: SQLiteMemoryStore;
  private archivedCount: number = 0;
  private deletedCount: number = 0;

  // Ebbinghaus curve parameters
  private readonly FORGETTING_RATE = 0.3; // R = e^(-t/S), S = stability
  private readonly MIN_RETENTION = 0.1;
  private readonly ARCHIVE_THRESHOLD = 0.3;
  private readonly DELETE_THRESHOLD = 0.1;

  constructor(store: SQLiteMemoryStore) {
    this.store = store;
  }

  /**
   * Calculate retention score using Ebbinghaus curve
   * R = e^(-t/S) where t = time elapsed, S = stability
   */
  calculateRetention(memory: AnyMemory, currentTime: number = Date.now()): number {
    const createdAt = (memory as any).createdAt || (memory as any).timestamp || currentTime;
    const ageInDays = (currentTime - createdAt) / (1000 * 60 * 60 * 24);
    
    // Stability increases with access count
    const accessCount = this.getAccessCount(memory.id);
    const stability = 1 + accessCount * 0.5;
    
    // Ebbinghaus formula
    const retention = Math.exp(-ageInDays / stability);
    
    return Math.max(this.MIN_RETENTION, Math.min(1, retention));
  }

  private getAccessCount(id: string): number {
    // This would query the store for access count
    // For now, return 0 as placeholder
    return 0;
  }

  /**
   * Calculate importance score based on multiple factors
   */
  calculateImportance(memory: AnyMemory): number {
    let score = 0.5; // Base score

    // Factor 1: Confidence (if available)
    if ("confidence" in memory && typeof memory.confidence === "number") {
      score += memory.confidence * 0.2;
    }

    // Factor 2: Type importance
    if ("type" in memory) {
      const typeWeights: Record<string, number> = {
        fact: 0.3,
        preference: 0.25,
        goal: 0.35,
        constraint: 0.3,
        event: 0.2,
      };
      score += typeWeights[memory.type] || 0.2;
    }

    // Factor 3: Entity references (more entities = more connected = more important)
    if ("entityRefs" in memory && Array.isArray(memory.entityRefs)) {
      score += Math.min(0.2, memory.entityRefs.length * 0.05);
    }

    // Factor 4: Theme membership
    if ("semanticIds" in memory && Array.isArray(memory.semanticIds)) {
      score += Math.min(0.15, memory.semanticIds.length * 0.03);
    }

    return Math.min(1, score);
  }

  /**
   * Get all memory scores for lifecycle decisions
   */
  getMemoryScores(): MemoryScore[] {
    const memories = this.store.search("", { limit: 10000 });
    const currentTime = Date.now();

    return memories.map((memory) => ({
      id: memory.id,
      retentionScore: this.calculateRetention(memory, currentTime),
      importanceScore: this.calculateImportance(memory),
      accessFrequency: this.getAccessCount(memory.id),
      recency: currentTime - ((memory as any).createdAt || currentTime),
      age: (currentTime - ((memory as any).createdAt || currentTime)) / (1000 * 60 * 60 * 24),
    }));
  }

  /**
   * Archive low-value memories
   */
  archiveLowValue(threshold: number = this.ARCHIVE_THRESHOLD): {
    archived: number;
    deleted: number;
    retained: number;
  } {
    const scores = this.getMemoryScores();
    let archived = 0;
    let deleted = 0;
    let retained = 0;

    for (const score of scores) {
      // Combined score: retention * importance * access factor
      const accessFactor = Math.log10(1 + score.accessFrequency) / 2;
      const combinedScore = score.retentionScore * score.importanceScore * (1 + accessFactor);

      if (combinedScore < this.DELETE_THRESHOLD) {
        // Delete very low value memories
        this.store.delete(score.id);
        deleted++;
        this.deletedCount++;
      } else if (combinedScore < threshold) {
        // Archive low value memories (reduce retention score)
        this.updateRetentionScore(score.id, score.retentionScore * 0.5);
        archived++;
        this.archivedCount++;
      } else {
        retained++;
      }
    }

    return { archived, deleted, retained };
  }

  /**
   * Update retention score in store
   */
  private updateRetentionScore(id: string, newScore: number): void {
    // This would update the retention_score column in SQLite
    // For now, we'll use a direct approach
    // In a real implementation, we'd add a method to SQLiteMemoryStore
  }

  /**
   * Cleanup archived memories older than threshold
   */
  cleanup(): { archived: number; deleted: number; retained: number } {
    return this.archiveLowValue(this.DELETE_THRESHOLD);
  }

  /**
   * Get forgetting statistics
   */
  getStats(): ForgettingStats {
    const scores = this.getMemoryScores();
    const candidatesForArchive = scores.filter(
      (s) => s.retentionScore < this.ARCHIVE_THRESHOLD && s.retentionScore >= this.DELETE_THRESHOLD
    ).length;

    return {
      total: scores.length,
      archived: this.archivedCount,
      deleted: this.deletedCount,
      retained: scores.length - this.archivedCount - this.deletedCount,
      candidatesForArchive,
    };
  }

  /**
   * Predict when a memory will be forgotten
   */
  predictForgetTime(memory: AnyMemory, threshold: number = 0.3): number {
    const importance = this.calculateImportance(memory);
    const accessCount = this.getAccessCount(memory.id);
    const stability = 1 + accessCount * 0.5;

    // Solve for t in R = e^(-t/S) = threshold
    // t = -S * ln(threshold)
    const forgetTime = -stability * Math.log(threshold / importance);

    return forgetTime; // Days until forgotten
  }

  /**
   * Boost memory importance (e.g., when accessed)
   */
  boostMemory(id: string): void {
    // This would increment access_count in SQLite
    // In a real implementation, we'd add a method to SQLiteMemoryStore
  }

  /**
   * Get memories at risk of being forgotten
   */
  getAtRiskMemories(threshold: number = 0.4): MemoryScore[] {
    const scores = this.getMemoryScores();
    return scores.filter((s) => s.retentionScore < threshold).sort((a, b) => a.retentionScore - b.retentionScore);
  }
}
