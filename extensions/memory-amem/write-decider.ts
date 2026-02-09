/**
 * Intelligent Memory Write Decider
 * AMemGym-style AWE (Agentic Write External) implementation
 */

import { randomUUID } from "node:crypto";
import type {
  AMemEntry,
  AMemEntryType,
  WriteDecision,
  AMemConfig,
} from "./types.js";

// Default importance assessment prompt
const IMPORTANCE_ASSESSMENT_PROMPT = `
Assess the importance of the following information for long-term memory.

Information: "{content}"
Context: {context}

Rate on a scale of 0-1:
- 0.0-0.3: Trivial, transient, or easily recoverable
- 0.3-0.5: Minor preference or temporary state
- 0.5-0.7: Useful context, recurring topic
- 0.7-0.9: Important fact, goal, or constraint
- 0.9-1.0: Critical information, core identity

Also classify the type:
- fact: Objective truth about world/user
- preference: Likes, dislikes, style choices
- goal: Objectives, targets, aspirations
- constraint: Rules, limitations, requirements
- relationship: Connections between entities
- event: Specific occurrence with time/place

Extract entities mentioned (people, places, projects, etc.)

Respond in JSON:
{
  "importance": 0.0-1.0,
  "type": "fact|preference|goal|constraint|relationship|event",
  "confidence": 0.0-1.0,
  "entities": ["entity1", "entity2"],
  "reasoning": "brief explanation"
}
`;

export class MemoryWriteDecider {
  private config: AMemConfig;
  private llmProvider: any; // Will be injected

  constructor(config: AMemConfig, llmProvider?: any) {
    this.config = config;
    this.llmProvider = llmProvider;
  }

  /**
   * Decide whether to write a memory entry
   * Implements AWE (Agentic Write External) logic
   */
  async decide(
    content: string,
    context: string,
    existingEntries: AMemEntry[]
  ): Promise<WriteDecision> {
    // 1. Assess importance and classify
    const assessment = await this.assessContent(content, context);

    // 2. Check for duplicates/similar entries
    const similar = this.findSimilarEntry(content, existingEntries);

    // 3. Make decision
    const shouldWrite = this.shouldWrite(assessment, similar);

    // 4. Generate suggested tags
    const suggestedTags = this.generateTags(content, assessment.type);

    return {
      shouldWrite,
      type: assessment.type,
      confidence: assessment.confidence,
      importance: assessment.importance,
      reason: shouldWrite
        ? similar
          ? "Update existing with higher confidence"
          : "New important information"
        : this.getRejectionReason(assessment, similar),
      consolidationTarget: similar?.id,
      suggestedTags,
      suggestedEntities: assessment.entities,
    };
  }

  /**
   * Assess content importance using LLM or heuristics
   */
  private async assessContent(
    content: string,
    context: string
  ): Promise<{
    importance: number;
    type: AMemEntryType;
    confidence: number;
    entities: string[];
    reasoning: string;
  }> {
    // If LLM provider available, use it
    if (this.llmProvider) {
      try {
        const prompt = IMPORTANCE_ASSESSMENT_PROMPT
          .replace("{content}", content)
          .replace("{context}", context);

        const response = await this.llmProvider.generate(prompt);
        const parsed = JSON.parse(response);

        return {
          importance: Math.max(0, Math.min(1, parsed.importance)),
          type: parsed.type,
          confidence: Math.max(0, Math.min(1, parsed.confidence)),
          entities: parsed.entities || [],
          reasoning: parsed.reasoning,
        };
      } catch (error) {
        // Fall back to heuristic
        console.warn("LLM assessment failed, using heuristic:", error);
      }
    }

    // Heuristic assessment (no LLM)
    return this.heuristicAssessment(content);
  }

  /**
   * Heuristic importance assessment (offline mode)
   */
  private heuristicAssessment(content: string): {
    importance: number;
    type: AMemEntryType;
    confidence: number;
    entities: string[];
    reasoning: string;
  } {
    const lower = content.toLowerCase();
    let importance = 0.5;
    let type: AMemEntryType = "fact";

    // Importance indicators
    const highImportance = [
      "always", "never", "must", "critical", "essential",
      "important", "key", "main", "primary", "crucial"
    ];
    const preferenceIndicators = [
      "prefer", "like", "love", "hate", "dislike",
      "want", "need", "rather", "instead"
    ];
    const goalIndicators = [
      "goal", "target", "aim", "objective", "plan",
      "want to", "need to", "trying to"
    ];
    const constraintIndicators = [
      "cannot", "can't", "must not", "restricted",
      "limited", "only", "never", "always"
    ];

    // Calculate importance
    for (const word of highImportance) {
      if (lower.includes(word)) importance += 0.1;
    }

    // Determine type
    for (const word of preferenceIndicators) {
      if (lower.includes(word)) {
        type = "preference";
        importance += 0.05;
        break;
      }
    }

    for (const word of goalIndicators) {
      if (lower.includes(word)) {
        type = "goal";
        importance += 0.1;
        break;
      }
    }

    for (const word of constraintIndicators) {
      if (lower.includes(word)) {
        type = "constraint";
        importance += 0.1;
        break;
      }
    }

    // Extract simple entities (capitalized words)
    const entityRegex = /\b[A-Z][a-z]+\b/g;
    const entities = [...content.matchAll(entityRegex)].map(m => m[0]);
    const uniqueEntities = [...new Set(entities)];

    // Confidence based on content length and clarity
    const confidence = Math.min(0.9, 0.5 + content.length / 200);

    importance = Math.min(1, importance);

    return {
      importance,
      type,
      confidence,
      entities: uniqueEntities.slice(0, 5), // Top 5 entities
      reasoning: `Heuristic: ${type} detected with importance ${importance.toFixed(2)}`,
    };
  }

  /**
   * Find similar existing entry
   */
  private findSimilarEntry(
    content: string,
    existingEntries: AMemEntry[]
  ): AMemEntry | null {
    // Simple text similarity (can be enhanced with embeddings)
    const contentWords = new Set(content.toLowerCase().split(/\s+/));

    let bestMatch: AMemEntry | null = null;
    let bestScore = 0;

    for (const entry of existingEntries) {
      const entryWords = new Set(entry.content.toLowerCase().split(/\s+/));
      
      // Jaccard similarity
      const intersection = new Set([...contentWords].filter(w => entryWords.has(w)));
      const union = new Set([...contentWords, ...entryWords]);
      const similarity = intersection.size / union.size;

      if (similarity > this.config.similarityThreshold && similarity > bestScore) {
        bestScore = similarity;
        bestMatch = entry;
      }
    }

    return bestMatch;
  }

  /**
   * Decide if content should be written
   */
  private shouldWrite(
    assessment: { importance: number; confidence: number },
    similar: AMemEntry | null
  ): boolean {
    // Must meet minimum thresholds
    if (assessment.importance < this.config.writeThreshold) {
      return false;
    }

    if (assessment.confidence < this.config.minConfidence) {
      return false;
    }

    // If similar exists, only write if higher confidence
    if (similar && assessment.confidence <= similar.confidence) {
      return false;
    }

    return true;
  }

  /**
   * Get rejection reason
   */
  private getRejectionReason(
    assessment: { importance: number; confidence: number },
    similar: AMemEntry | null
  ): string {
    if (assessment.importance < this.config.writeThreshold) {
      return `Low importance (${assessment.importance.toFixed(2)} < ${this.config.writeThreshold})`;
    }

    if (assessment.confidence < this.config.minConfidence) {
      return `Low confidence (${assessment.confidence.toFixed(2)} < ${this.config.minConfidence})`;
    }

    if (similar) {
      return `Duplicate with lower confidence than existing (${assessment.confidence.toFixed(2)} <= ${similar.confidence.toFixed(2)})`;
    }

    return "Unknown reason";
  }

  /**
   * Generate tags from content
   */
  private generateTags(content: string, type: AMemEntryType): string[] {
    const tags: string[] = [type];

    // Add topic tags based on keywords
    const topicKeywords: Record<string, string[]> = {
      work: ["work", "job", "project", "task", "meeting"],
      personal: ["family", "home", "hobby", "interest"],
      tech: ["code", "software", "api", "database", "server"],
      health: ["health", "exercise", "diet", "sleep"],
      travel: ["travel", "trip", "visit", "hotel", "flight"],
    };

    const lower = content.toLowerCase();
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      for (const keyword of keywords) {
        if (lower.includes(keyword)) {
          tags.push(topic);
          break;
        }
      }
    }

    return [...new Set(tags)];
  }

  /**
   * Merge new content with existing entry
   */
  async mergeEntries(
    existing: AMemEntry,
    newContent: string,
    newConfidence: number
  ): Promise<string> {
    // Simple merge: take the more confident version
    if (newConfidence > existing.confidence) {
      return newContent;
    }

    // If similar confidence, append as clarification
    return `${existing.content}\n\n(Updated: ${newContent})`;
  }
}
