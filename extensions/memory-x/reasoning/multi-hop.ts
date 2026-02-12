/**
 * Multi-Hop Reasoning Engine
 * Enables complex inference across memory hierarchy
 */

import type { SQLiteMemoryStore } from "../store/sqlite-store.js";
import type { VectorIndex } from "../store/vector-index.js";
import { KnowledgeGraph, type Entity, type Relation, type GraphPath } from "./knowledge-graph.js";
import type { SemanticMemory, ThemeMemory, EpisodeMemory, AnyMemory } from "../types.js";

export interface ReasoningStep {
  type: "entity_lookup" | "relation_traversal" | "semantic_search" | "theme_expansion" | "inference";
  input: string;
  output: string;
  confidence: number;
  evidence: string[];
}

export interface ReasoningResult {
  query: string;
  answer: string;
  steps: ReasoningStep[];
  confidence: number;
  evidence: AnyMemory[];
  paths: GraphPath[];
}

export interface InferenceRule {
  name: string;
  pattern: {
    sourceType: string;
    relationType: string;
    targetType: string;
  };
  inference: string;
  confidence: number;
}

const DEFAULT_RULES: InferenceRule[] = [
  {
    name: "preference_inheritance",
    pattern: { sourceType: "person", relationType: "prefers", targetType: "topic" },
    inference: "If {source} prefers {target}, they may prefer related topics",
    confidence: 0.7,
  },
  {
    name: "location_context",
    pattern: { sourceType: "event", relationType: "located_in", targetType: "location" },
    inference: "Events at {target} location share context",
    confidence: 0.8,
  },
  {
    name: "temporal_sequence",
    pattern: { sourceType: "event", relationType: "follows", targetType: "event" },
    inference: "{source} happened after {target}",
    confidence: 0.9,
  },
];

export class MultiHopReasoning {
  private store: SQLiteMemoryStore;
  private vectorIndex: VectorIndex;
  private graph: KnowledgeGraph;
  private rules: InferenceRule[];

  constructor(store: SQLiteMemoryStore, vectorIndex: VectorIndex, graph: KnowledgeGraph) {
    this.store = store;
    this.vectorIndex = vectorIndex;
    this.graph = graph;
    this.rules = DEFAULT_RULES;
  }

  /**
   * Execute multi-hop reasoning
   */
  async reason(query: string, maxHops: number = 3): Promise<ReasoningResult> {
    const steps: ReasoningStep[] = [];
    const evidence: AnyMemory[] = [];
    const paths: GraphPath[] = [];
    let overallConfidence = 1.0;

    // Step 1: Extract entities from query
    const entities = this.extractQueryEntities(query);
    steps.push({
      type: "entity_lookup",
      input: query,
      output: `Found ${entities.length} entities: ${entities.map((e) => e.name).join(", ")}`,
      confidence: 0.9,
      evidence: [],
    });

    // Step 2: Find relevant themes
    const themes = await this.findRelevantThemes(query);
    steps.push({
      type: "theme_expansion",
      input: entities.map((e) => e.name).join(", "),
      output: `Found ${themes.length} relevant themes`,
      confidence: 0.8,
      evidence: themes.map((t) => t.id),
    });
    evidence.push(...themes);

    // Step 3: Multi-hop traversal
    for (let hop = 0; hop < maxHops; hop++) {
      const hopResult = await this.executeHop(entities, themes, hop);
      if (hopResult.memories.length === 0) break;

      steps.push(hopResult.step);
      evidence.push(...hopResult.memories);
      overallConfidence *= hopResult.step.confidence;

      if (hopResult.paths.length > 0) {
        paths.push(...hopResult.paths);
      }
    }

    // Step 4: Apply inference rules
    const inferences = this.applyInferenceRules(entities, paths);
    for (const inference of inferences) {
      steps.push(inference.step);
      overallConfidence *= inference.confidence;
    }

    // Step 5: Synthesize answer
    const answer = this.synthesizeAnswer(query, evidence, paths, inferences);

    return {
      query,
      answer,
      steps,
      confidence: overallConfidence,
      evidence: this.deduplicateMemories(evidence),
      paths,
    };
  }

  /**
   * Extract entities from query text
   */
  private extractQueryEntities(query: string): Entity[] {
    const entities: Entity[] = [];
    const words = query.split(/\s+/);

    for (const word of words) {
      const entity = this.graph.getEntity(word);
      if (entity) {
        entities.push(entity);
      }
    }

    // Also check for multi-word entities
    for (let i = 0; i < words.length - 1; i++) {
      const phrase = `${words[i]} ${words[i + 1]}`;
      const entity = this.graph.getEntity(phrase);
      if (entity) {
        entities.push(entity);
      }
    }

    return entities;
  }

  /**
   * Find relevant themes using vector search
   */
  private async findRelevantThemes(query: string): Promise<ThemeMemory[]> {
    const results = await this.vectorIndex.search(query, { level: "theme", limit: 5 });
    return results.map((r) => r.memory as ThemeMemory);
  }

  /**
   * Execute a single hop in the reasoning chain
   */
  private async executeHop(
    entities: Entity[],
    themes: ThemeMemory[],
    hopNumber: number
  ): Promise<{
    step: ReasoningStep;
    memories: AnyMemory[];
    paths: GraphPath[];
  }> {
    const memories: AnyMemory[] = [];
    const paths: GraphPath[] = [];

    // Traverse relations from entities
    for (const entity of entities) {
      const relations = this.graph.getEntityRelations(entity.id);
      
      for (const relation of relations) {
        const targetId = relation.source === entity.id ? relation.target : relation.source;
        const relatedMemories = this.findMemoriesByEntityId(targetId);
        memories.push(...relatedMemories);

        // Find paths between entities
        for (const otherEntity of entities) {
          if (otherEntity.id !== entity.id) {
            const path = this.graph.findPath(entity.name, otherEntity.name, 2);
            if (path) {
              paths.push(path);
            }
          }
        }
      }
    }

    // Expand from themes
    for (const theme of themes) {
      const semanticIds = theme.semanticIds || [];
      for (const semanticId of semanticIds.slice(0, 3)) {
        const semantic = this.store.get<SemanticMemory>(semanticId, "semantic");
        if (semantic) {
          memories.push(semantic);
        }
      }
    }

    const confidence = Math.max(0.5, 1.0 - hopNumber * 0.2);

    return {
      step: {
        type: "relation_traversal",
        input: `Hop ${hopNumber + 1}`,
        output: `Found ${memories.length} memories via ${paths.length} paths`,
        confidence,
        evidence: memories.map((m) => m.id),
      },
      memories,
      paths,
    };
  }

  /**
   * Find memories containing an entity
   */
  private findMemoriesByEntityId(entityId: string): AnyMemory[] {
    const entity = this.graph.getEntity(
      Array.from(this.graph.getAllEntities()).find((e) => e.id === entityId)?.name || ""
    );
    if (!entity) return [];

    return this.store.searchByKeywords([entity.name], { level: "semantic", limit: 5 });
  }

  /**
   * Apply inference rules to generate new insights
   */
  private applyInferenceRules(
    entities: Entity[],
    paths: GraphPath[]
  ): { step: ReasoningStep; confidence: number }[] {
    const results: { step: ReasoningStep; confidence: number }[] = [];

    for (const rule of this.rules) {
      for (const path of paths) {
        for (const edge of path.edges) {
          const source = this.graph.getEntity(
            Array.from(this.graph.getAllEntities()).find((e) => e.id === edge.source)?.name || ""
          );
          const target = this.graph.getEntity(
            Array.from(this.graph.getAllEntities()).find((e) => e.id === edge.target)?.name || ""
          );

          if (source && target) {
            if (
              source.type === rule.pattern.sourceType &&
              edge.type === rule.pattern.relationType &&
              target.type === rule.pattern.targetType
            ) {
              const inference = rule.inference
                .replace("{source}", source.name)
                .replace("{target}", target.name);

              results.push({
                step: {
                  type: "inference",
                  input: `${source.name} -${edge.type}-> ${target.name}`,
                  output: inference,
                  confidence: rule.confidence,
                  evidence: edge.evidence,
                },
                confidence: rule.confidence,
              });
            }
          }
        }
      }
    }

    return results;
  }

  /**
   * Synthesize final answer from evidence
   */
  private synthesizeAnswer(
    query: string,
    evidence: AnyMemory[],
    paths: GraphPath[],
    inferences: { step: ReasoningStep; confidence: number }[]
  ): string {
    const parts: string[] = [];

    // Summarize evidence
    if (evidence.length > 0) {
      const topEvidence = evidence.slice(0, 3);
      parts.push("Based on the following evidence:");
      
      for (const mem of topEvidence) {
        const content = "content" in mem ? mem.content : "summary" in mem ? mem.summary : "description" in mem ? mem.description : "";
        parts.push(`- ${content.substring(0, 100)}...`);
      }
    }

    // Add inference results
    if (inferences.length > 0) {
      parts.push("\nInferred insights:");
      for (const inf of inferences.slice(0, 2)) {
        parts.push(`- ${inf.step.output}`);
      }
    }

    // Add path information
    if (paths.length > 0) {
      parts.push(`\nFound ${paths.length} connection paths between entities.`);
    }

    return parts.join("\n");
  }

  /**
   * Deduplicate memories
   */
  private deduplicateMemories(memories: AnyMemory[]): AnyMemory[] {
    const seen = new Set<string>();
    return memories.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }

  /**
   * Analogical reasoning: find similar situations
   */
  async analogy(sourceTheme: string): Promise<{
    similarThemes: ThemeMemory[];
    transferableKnowledge: string[];
  }> {
    const source = this.graph.getEntity(sourceTheme);
    if (!source) {
      return { similarThemes: [], transferableKnowledge: [] };
    }

    // Find related entities
    const related = this.graph.getRelatedEntities(source.id, 2);
    
    // Find themes with similar entity patterns
    const similarThemes: ThemeMemory[] = [];
    const allThemes = this.store.search("", { level: "theme", limit: 100 });

    for (const theme of allThemes) {
      const t = theme as ThemeMemory;
      const themeEntities = new Set<string>();
      
      // Get entities from theme's semantics
      for (const semId of t.semanticIds.slice(0, 5)) {
        const sem = this.store.get<SemanticMemory>(semId, "semantic");
        if (sem) {
          sem.entityRefs.forEach((e) => themeEntities.add(e.toLowerCase()));
        }
      }

      // Check overlap
      const overlap = related.filter((e) => themeEntities.has(e.name.toLowerCase()));
      if (overlap.length >= 2) {
        similarThemes.push(t);
      }
    }

    // Extract transferable knowledge
    const transferableKnowledge: string[] = [];
    for (const theme of similarThemes.slice(0, 3)) {
      for (const semId of theme.semanticIds.slice(0, 2)) {
        const sem = this.store.get<SemanticMemory>(semId, "semantic");
        if (sem) {
          transferableKnowledge.push(sem.content);
        }
      }
    }

    return { similarThemes, transferableKnowledge };
  }

  /**
   * Causal inference: find cause-effect chains
   */
  async causalInference(eventDescription: string): Promise<{
    causes: AnyMemory[];
    effects: AnyMemory[];
    chain: string[];
  }> {
    const causes: AnyMemory[] = [];
    const effects: AnyMemory[] = [];
    const chain: string[] = [];

    // Find the event in memories
    const relatedMemories = await this.vectorIndex.search(eventDescription, { level: "semantic", limit: 5 });

    for (const result of relatedMemories) {
      const memory = result.memory as SemanticMemory;
      
      // Look for causal relations
      for (const entityRef of memory.entityRefs) {
        const entity = this.graph.getEntity(entityRef);
        if (entity) {
          const relations = this.graph.getEntityRelations(entity.id);
          
          for (const relation of relations) {
            if (relation.type === "caused_by") {
              const causeMemories = this.findMemoriesByEntityId(relation.target);
              causes.push(...causeMemories);
              chain.push(`${entity.name} was caused by ${relation.target}`);
            }
          }
        }
      }
    }

    return { causes, effects, chain };
  }

  /**
   * Add custom inference rule
   */
  addRule(rule: InferenceRule): void {
    this.rules.push(rule);
  }
}
