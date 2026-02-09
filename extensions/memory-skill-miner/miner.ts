/**
 * Skill Mining Engine
 * Discovers potential skills from conversation patterns
 */

import fs from "node:fs/promises";
import path from "node:path";
import type {
  SkillMinerConfig,
  PotentialSkill,
  SessionAnalysis,
  PatternMatch,
} from "./types.js";

// Common stop words to filter out
const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "must", "shall", "can", "need", "dare",
  "ought", "used", "to", "of", "in", "for", "on", "with", "at", "by",
  "from", "as", "into", "through", "during", "before", "after", "above",
  "below", "between", "under", "again", "further", "then", "once", "here",
  "there", "when", "where", "why", "how", "all", "each", "few", "more",
  "most", "other", "some", "such", "no", "nor", "not", "only", "own",
  "same", "so", "than", "too", "very", "just", "and", "but", "if", "or",
  "because", "until", "while", "this", "that", "these", "those", "i",
  "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your",
  "yours", "yourself", "yourselves", "he", "him", "his", "himself", "she",
  "her", "hers", "herself", "it", "its", "itself", "they", "them", "their",
  "theirs", "themselves", "what", "which", "who", "whom", "whose",
]);

// Common task indicators
const TASK_INDICATORS = [
  "help me",
  "can you",
  "please",
  "i want",
  "i need",
  "how to",
  "how do",
  "what is",
  "tell me",
  "show me",
  "create",
  "generate",
  "make",
  "build",
  "write",
  "summarize",
  "analyze",
  "search",
  "find",
  "get",
  "fetch",
  "download",
  "upload",
  "convert",
  "transform",
  "process",
  "handle",
  "manage",
  "organize",
  "sort",
  "filter",
  "update",
  "edit",
  "modify",
  "change",
  "delete",
  "remove",
  "add",
  "insert",
  "append",
];

export class SkillMiner {
  private config: SkillMinerConfig;
  private sessionsDir: string;

  constructor(config: SkillMinerConfig, sessionsDir: string) {
    this.config = config;
    this.sessionsDir = sessionsDir;
  }

  /**
   * Scan session logs for potential skills
   */
  async scan(sinceDays: number = this.config.observationWindow): Promise<PotentialSkill[]> {
    const cutoffTime = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
    const sessions = await this.loadRecentSessions(cutoffTime);
    
    if (sessions.length === 0) {
      return [];
    }

    // Analyze each session
    const analyses = await Promise.all(
      sessions.map((s) => this.analyzeSession(s))
    );

    // Find similar patterns
    const patterns = this.extractPatterns(analyses);
    
    // Group similar patterns into potential skills
    const potentialSkills = this.groupIntoSkills(patterns, analyses);
    
    // Filter by minimum occurrences
    return potentialSkills.filter(
      (s) => s.occurrenceCount >= this.config.minOccurrences
    );
  }

  /**
   * Load recent session files
   */
  private async loadRecentSessions(cutoffTime: number): Promise<string[]> {
    try {
      const files = await fs.readdir(this.sessionsDir);
      const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
      
      const sessions: string[] = [];
      for (const file of jsonlFiles) {
        const filePath = path.join(this.sessionsDir, file);
        const stat = await fs.stat(filePath);
        if (stat.mtimeMs >= cutoffTime) {
          const content = await fs.readFile(filePath, "utf-8");
          sessions.push(content);
        }
      }
      
      return sessions;
    } catch {
      return [];
    }
  }

  /**
   * Analyze a single session
   */
  private async analyzeSession(sessionContent: string): Promise<SessionAnalysis> {
    const lines = sessionContent.trim().split("\n");
    const messages: Array<{
      role: string;
      content: string;
      type?: string;
      name?: string;
    }> = [];

    for (const line of lines) {
      try {
        const record = JSON.parse(line);
        if (record.type === "message" && record.message) {
          const content = this.extractTextContent(record.message.content);
          messages.push({
            role: record.message.role,
            content,
            type: record.message.content?.[0]?.type,
            name: record.message.content?.[0]?.name,
          });
        }
      } catch {
        // Skip invalid lines
      }
    }

    // Extract user intent from first user message
    const firstUserMsg = messages.find((m) => m.role === "user");
    const userIntent = firstUserMsg?.content || "unknown";

    // Extract workflow (assistant messages + tool calls)
    const workflow: string[] = [];
    const toolsUsed: string[] = [];
    
    for (const msg of messages) {
      if (msg.role === "assistant") {
        workflow.push(msg.content.substring(0, 100));
      }
      if (msg.type === "toolCall" && msg.name) {
        toolsUsed.push(msg.name);
      }
    }

    // Determine outcome
    const lastMsg = messages[messages.length - 1];
    const outcome: SessionAnalysis["outcome"] =
      lastMsg?.role === "assistant" && !lastMsg.content.includes("error")
        ? "success"
        : "partial";

    // Extract entities (capitalized words)
    const entities = this.extractEntities(sessionContent);

    return {
      sessionId: "", // Will be filled later
      timestamp: Date.now(),
      userIntent,
      workflow,
      toolsUsed: [...new Set(toolsUsed)],
      outcome,
      entities,
    };
  }

  /**
   * Extract text content from message content array
   */
  private extractTextContent(content: unknown): string {
    if (!Array.isArray(content)) {
      return String(content || "");
    }
    
    const texts: string[] = [];
    for (const item of content) {
      if (item?.type === "text" && item.text) {
        texts.push(item.text);
      }
    }
    
    return texts.join(" ");
  }

  /**
   * Extract entities (capitalized words) from text
   */
  private extractEntities(text: string): string[] {
    const entityRegex = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
    const matches = text.match(entityRegex) || [];
    return [...new Set(matches)].filter((e) => e.length > 2);
  }

  /**
   * Extract patterns from session analyses
   */
  private extractPatterns(analyses: SessionAnalysis[]): PatternMatch[] {
    const patterns: Map<string, string[]> = new Map();

    for (const analysis of analyses) {
      // Normalize user intent
      const normalized = this.normalizeIntent(analysis.userIntent);
      
      // Find similar existing pattern
      let matched = false;
      for (const [existingPattern, sessionIds] of patterns) {
        const similarity = this.calculateSimilarity(normalized, existingPattern);
        if (similarity >= this.config.similarityThreshold) {
          sessionIds.push(analysis.sessionId);
          matched = true;
          break;
        }
      }
      
      if (!matched) {
        patterns.set(normalized, [analysis.sessionId]);
      }
    }

    return Array.from(patterns.entries()).map(([pattern, sessionIds]) => ({
      pattern,
      similarity: 1.0,
      sessionIds,
    }));
  }

  /**
   * Normalize user intent for comparison
   */
  private normalizeIntent(intent: string): string {
    // Convert to lowercase
    let normalized = intent.toLowerCase();
    
    // Remove punctuation
    normalized = normalized.replace(/[.,!?;:]/g, "");
    
    // Remove stop words
    const words = normalized.split(/\s+/);
    const filtered = words.filter((w) => !STOP_WORDS.has(w) && w.length > 2);
    
    return filtered.join(" ");
  }

  /**
   * Calculate similarity between two strings (Jaccard)
   */
  private calculateSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.split(/\s+/));
    const wordsB = new Set(b.split(/\s+/));
    
    const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);
    
    return intersection.size / union.size;
  }

  /**
   * Group patterns into potential skills
   */
  private groupIntoSkills(
    patterns: PatternMatch[],
    analyses: SessionAnalysis[]
  ): PotentialSkill[] {
    const skills: PotentialSkill[] = [];

    for (const pattern of patterns) {
      if (pattern.sessionIds.length < this.config.minOccurrences) {
        continue;
      }

      // Get analyses for this pattern
      const relevantAnalyses = analyses.filter((a) =>
        pattern.sessionIds.includes(a.sessionId)
      );

      // Extract common tools
      const toolCounts: Map<string, number> = new Map();
      for (const analysis of relevantAnalyses) {
        for (const tool of analysis.toolsUsed) {
          toolCounts.set(tool, (toolCounts.get(tool) || 0) + 1);
        }
      }
      const commonTools = Array.from(toolCounts.entries())
        .filter(([, count]) => count >= relevantAnalyses.length * 0.5)
        .map(([tool]) => tool);

      // Extract common entities
      const entityCounts: Map<string, number> = new Map();
      for (const analysis of relevantAnalyses) {
        for (const entity of analysis.entities) {
          entityCounts.set(entity, (entityCounts.get(entity) || 0) + 1);
        }
      }
      const commonEntities = Array.from(entityCounts.entries())
        .filter(([, count]) => count >= relevantAnalyses.length * 0.3)
        .map(([entity]) => entity)
        .slice(0, 5);

      // Extract workflow steps (common across sessions)
      const workflowSteps = this.extractCommonWorkflow(relevantAnalyses);

      // Generate skill name from pattern
      const skillName = this.generateSkillName(pattern.pattern);

      // Generate description
      const description = this.generateDescription(
        pattern.pattern,
        commonTools,
        workflowSteps
      );

      // Generate trigger patterns
      const triggerPatterns = this.generateTriggerPatterns(
        pattern.pattern,
        relevantAnalyses.map((a) => a.userIntent)
      );

      skills.push({
        id: `potential-${Date.now()}-${skills.length}`,
        name: skillName,
        description,
        triggerPatterns,
        workflowSteps,
        toolsUsed: commonTools,
        entitiesInvolved: commonEntities,
        occurrenceCount: pattern.sessionIds.length,
        confidence: Math.min(1, pattern.sessionIds.length / 10),
        sourceSessions: pattern.sessionIds,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        status: "pending",
      });
    }

    // Sort by confidence
    return skills.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Extract common workflow steps
   */
  private extractCommonWorkflow(analyses: SessionAnalysis[]): string[] {
    // Simple approach: use workflow from most successful session
    const successfulAnalyses = analyses.filter((a) => a.outcome === "success");
    if (successfulAnalyses.length === 0) {
      return analyses[0]?.workflow.slice(0, 5) || [];
    }
    
    // Return workflow from the session with most steps
    const longest = successfulAnalyses.reduce((a, b) =>
      a.workflow.length > b.workflow.length ? a : b
    );
    
    return longest.workflow.slice(0, 5);
  }

  /**
   * Generate skill name from pattern
   */
  private generateSkillName(pattern: string): string {
    const words = pattern.split(/\s+/).filter((w) => w.length > 3);
    
    if (words.length === 0) {
      return "auto-skill";
    }
    
    // Take first 2-3 meaningful words
    const nameWords = words.slice(0, 3);
    return nameWords.join("-");
  }

  /**
   * Generate skill description
   */
  private generateDescription(
    pattern: string,
    tools: string[],
    workflow: string[]
  ): string {
    let description = `Handle requests related to "${pattern}"`;
    
    if (tools.length > 0) {
      description += `. Uses ${tools.join(", ")}`;
    }
    
    if (workflow.length > 0) {
      description += `. Typically involves ${workflow.length} steps`;
    }
    
    return description;
  }

  /**
   * Generate trigger patterns
   */
  private generateTriggerPatterns(pattern: string, intents: string[]): string[] {
    const triggers: string[] = [];
    
    // Add the normalized pattern
    triggers.push(pattern);
    
    // Add variations from actual intents
    for (const intent of intents.slice(0, 3)) {
      const simplified = intent.toLowerCase().replace(/[.,!?;:]/g, "");
      if (!triggers.includes(simplified)) {
        triggers.push(simplified);
      }
    }
    
    return triggers.slice(0, 5);
  }
}
