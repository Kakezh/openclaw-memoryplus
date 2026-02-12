/**
 * Knowledge Graph for Memory System
 * Represents entities and their relationships
 */

import type { SQLiteMemoryStore } from "../store/sqlite-store.js";
import type { SemanticMemory, ThemeMemory, AnyMemory } from "../types.js";

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  aliases: string[];
  firstSeen: number;
  lastSeen: number;
  mentionCount: number;
}

export type EntityType = 
  | "person"
  | "organization"
  | "location"
  | "concept"
  | "event"
  | "object"
  | "topic";

export interface Relation {
  id: string;
  source: string;  // Entity ID
  target: string;  // Entity ID
  type: RelationType;
  weight: number;
  evidence: string[];  // Memory IDs that support this relation
  createdAt: number;
}

export type RelationType =
  | "related_to"
  | "part_of"
  | "has_property"
  | "prefers"
  | "dislikes"
  | "works_at"
  | "located_in"
  | "occurred_at"
  | "caused_by"
  | "follows"
  | "contradicts";

export interface GraphPath {
  nodes: Entity[];
  edges: Relation[];
  totalWeight: number;
}

export class KnowledgeGraph {
  private store: SQLiteMemoryStore;
  private entities: Map<string, Entity> = new Map();
  private relations: Map<string, Relation> = new Map();
  private entityNameIndex: Map<string, string> = new Map(); // name -> id

  constructor(store: SQLiteMemoryStore) {
    this.store = store;
    this.loadFromMemories();
  }

  /**
   * Load entities and relations from existing memories
   */
  private loadFromMemories(): void {
    const semantics = this.store.search("", { level: "semantic", limit: 10000 });
    
    for (const memory of semantics) {
      const semantic = memory as SemanticMemory;
      this.extractEntities(semantic);
      this.extractRelations(semantic);
    }
  }

  /**
   * Extract entities from a semantic memory
   */
  private extractEntities(memory: SemanticMemory): void {
    const entityRefs = memory.entityRefs || [];
    
    for (const name of entityRefs) {
      const normalizedName = name.toLowerCase().trim();
      
      if (this.entityNameIndex.has(normalizedName)) {
        // Update existing entity
        const entityId = this.entityNameIndex.get(normalizedName)!;
        const entity = this.entities.get(entityId)!;
        entity.lastSeen = Date.now();
        entity.mentionCount++;
        this.entities.set(entityId, entity);
      } else {
        // Create new entity
        const entity: Entity = {
          id: `entity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: name,
          type: this.inferEntityType(name, memory.content),
          aliases: [normalizedName],
          firstSeen: Date.now(),
          lastSeen: Date.now(),
          mentionCount: 1,
        };
        
        this.entities.set(entity.id, entity);
        this.entityNameIndex.set(normalizedName, entity.id);
      }
    }
  }

  /**
   * Infer entity type from context
   */
  private inferEntityType(name: string, context: string): EntityType {
    const lowerContext = context.toLowerCase();
    const lowerName = name.toLowerCase();

    // Person indicators
    if (lowerContext.includes("user") || lowerContext.includes("he ") || lowerContext.includes("she ")) {
      return "person";
    }

    // Organization indicators
    if (lowerContext.includes("company") || lowerContext.includes("team") || lowerContext.includes("organization")) {
      return "organization";
    }

    // Location indicators
    if (lowerContext.includes("located") || lowerContext.includes("at ") || lowerContext.includes("in ")) {
      return "location";
    }

    // Event indicators
    if (lowerContext.includes("happened") || lowerContext.includes("occurred") || lowerContext.includes("event")) {
      return "event";
    }

    // Preference indicators
    if (lowerContext.includes("prefer") || lowerContext.includes("like") || lowerContext.includes("want")) {
      return "topic";
    }

    return "concept";
  }

  /**
   * Extract relations from a semantic memory
   */
  private extractRelations(memory: SemanticMemory): void {
    const entityRefs = memory.entityRefs || [];
    
    if (entityRefs.length < 2) return;

    // Create relations between co-occurring entities
    for (let i = 0; i < entityRefs.length; i++) {
      for (let j = i + 1; j < entityRefs.length; j++) {
        const sourceName = entityRefs[i].toLowerCase().trim();
        const targetName = entityRefs[j].toLowerCase().trim();
        
        const sourceId = this.entityNameIndex.get(sourceName);
        const targetId = this.entityNameIndex.get(targetName);
        
        if (sourceId && targetId) {
          const relationType = this.inferRelationType(memory);
          this.addRelation(sourceId, targetId, relationType, memory.id);
        }
      }
    }
  }

  /**
   * Infer relation type from memory content
   */
  private inferRelationType(memory: SemanticMemory): RelationType {
    const content = memory.content.toLowerCase();

    if (content.includes("prefer") || content.includes("like")) {
      return "prefers";
    }
    if (content.includes("dislike") || content.includes("hate")) {
      return "dislikes";
    }
    if (content.includes("part of") || content.includes("belongs to")) {
      return "part_of";
    }
    if (content.includes("located") || content.includes("in ")) {
      return "located_in";
    }
    if (content.includes("caused") || content.includes("because")) {
      return "caused_by";
    }

    return "related_to";
  }

  /**
   * Add a relation between entities
   */
  addRelation(sourceId: string, targetId: string, type: RelationType, evidence: string): Relation {
    const relationId = `rel-${sourceId}-${targetId}-${type}`;
    
    if (this.relations.has(relationId)) {
      const existing = this.relations.get(relationId)!;
      existing.weight += 0.1;
      if (!existing.evidence.includes(evidence)) {
        existing.evidence.push(evidence);
      }
      this.relations.set(relationId, existing);
      return existing;
    }

    const relation: Relation = {
      id: relationId,
      source: sourceId,
      target: targetId,
      type,
      weight: 1.0,
      evidence: [evidence],
      createdAt: Date.now(),
    };

    this.relations.set(relationId, relation);
    return relation;
  }

  /**
   * Get entity by name
   */
  getEntity(name: string): Entity | null {
    const normalizedName = name.toLowerCase().trim();
    const id = this.entityNameIndex.get(normalizedName);
    return id ? this.entities.get(id) || null : null;
  }

  /**
   * Get all relations for an entity
   */
  getEntityRelations(entityId: string): Relation[] {
    return Array.from(this.relations.values()).filter(
      (r) => r.source === entityId || r.target === entityId
    );
  }

  /**
   * Find path between two entities (BFS)
   */
  findPath(sourceName: string, targetName: string, maxHops: number = 3): GraphPath | null {
    const source = this.getEntity(sourceName);
    const target = this.getEntity(targetName);
    
    if (!source || !target) return null;

    // BFS to find shortest path
    const queue: { entityId: string; path: string[]; edges: Relation[] }[] = [
      { entityId: source.id, path: [source.id], edges: [] },
    ];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      
      if (current.entityId === target.id) {
        const nodes = current.path.map((id) => this.entities.get(id)!);
        const totalWeight = current.edges.reduce((sum, e) => sum + e.weight, 0);
        return { nodes, edges: current.edges, totalWeight };
      }

      if (current.path.length > maxHops) continue;
      if (visited.has(current.entityId)) continue;
      visited.add(current.entityId);

      const relations = this.getEntityRelations(current.entityId);
      for (const relation of relations) {
        const nextEntityId = relation.source === current.entityId ? relation.target : relation.source;
        if (!visited.has(nextEntityId)) {
          queue.push({
            entityId: nextEntityId,
            path: [...current.path, nextEntityId],
            edges: [...current.edges, relation],
          });
        }
      }
    }

    return null;
  }

  /**
   * Get related entities (neighbors)
   */
  getRelatedEntities(entityId: string, maxDepth: number = 1): Entity[] {
    const result: Entity[] = [];
    const visited = new Set<string>();
    const queue: { id: string; depth: number }[] = [{ id: entityId, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      
      if (visited.has(current.id)) continue;
      visited.add(current.id);

      if (current.depth > 0) {
        const entity = this.entities.get(current.id);
        if (entity) result.push(entity);
      }

      if (current.depth < maxDepth) {
        const relations = this.getEntityRelations(current.id);
        for (const relation of relations) {
          const nextId = relation.source === current.id ? relation.target : relation.source;
          if (!visited.has(nextId)) {
            queue.push({ id: nextId, depth: current.depth + 1 });
          }
        }
      }
    }

    return result;
  }

  /**
   * Get all entities
   */
  getAllEntities(): Entity[] {
    return Array.from(this.entities.values());
  }

  /**
   * Get all relations
   */
  getAllRelations(): Relation[] {
    return Array.from(this.relations.values());
  }

  /**
   * Get graph statistics
   */
  getStats(): {
    entityCount: number;
    relationCount: number;
    avgConnections: number;
    entityTypes: Record<EntityType, number>;
  } {
    const entityTypes: Record<EntityType, number> = {
      person: 0,
      organization: 0,
      location: 0,
      concept: 0,
      event: 0,
      object: 0,
      topic: 0,
    };

    for (const entity of this.entities.values()) {
      entityTypes[entity.type]++;
    }

    const totalConnections = Array.from(this.entities.values()).reduce(
      (sum, e) => sum + this.getEntityRelations(e.id).length,
      0
    );

    return {
      entityCount: this.entities.size,
      relationCount: this.relations.size,
      avgConnections: this.entities.size > 0 ? totalConnections / this.entities.size : 0,
      entityTypes,
    };
  }

  /**
   * Update graph with new memory
   */
  update(memory: SemanticMemory): void {
    this.extractEntities(memory);
    this.extractRelations(memory);
  }
}
