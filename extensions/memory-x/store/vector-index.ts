/**
 * Vector Index for Memory Search
 * Provides semantic similarity search using embeddings
 */

import type { SQLiteMemoryStore } from "./sqlite-store.js";
import type { AnyMemory, SemanticMemory, ThemeMemory } from "../types.js";

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface VectorSearchResult {
  memory: AnyMemory;
  score: number;
}

export class VectorIndex {
  private store: SQLiteMemoryStore;
  private embeddingProvider: EmbeddingProvider | null = null;
  private cache: Map<string, number[]> = new Map();

  constructor(store: SQLiteMemoryStore, embeddingProvider?: EmbeddingProvider) {
    this.store = store;
    this.embeddingProvider = embeddingProvider || null;
  }

  setEmbeddingProvider(provider: EmbeddingProvider): void {
    this.embeddingProvider = provider;
  }

  async indexMemory(id: string, content: string): Promise<void> {
    if (!this.embeddingProvider) return;

    const embedding = await this.embeddingProvider.embed(content);
    this.store.updateEmbedding(id, embedding);
    this.cache.set(id, embedding);
  }

  async indexBatch(items: { id: string; content: string }[]): Promise<void> {
    if (!this.embeddingProvider || items.length === 0) return;

    const contents = items.map((i) => i.content);
    const embeddings = await this.embeddingProvider.embedBatch(contents);

    for (let i = 0; i < items.length; i++) {
      this.store.updateEmbedding(items[i].id, embeddings[i]);
      this.cache.set(items[i].id, embeddings[i]);
    }
  }

  getEmbedding(id: string): number[] | null {
    if (this.cache.has(id)) {
      return this.cache.get(id)!;
    }
    const embedding = this.store.getEmbedding(id);
    if (embedding) {
      this.cache.set(id, embedding);
    }
    return embedding;
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async search(
    query: string,
    options: {
      level?: "original" | "episode" | "semantic" | "theme";
      limit?: number;
      minScore?: number;
    } = {}
  ): Promise<VectorSearchResult[]> {
    const { level, limit = 10, minScore = 0.5 } = options;

    if (!this.embeddingProvider) {
      return this.fallbackSearch(query, { level, limit, minScore });
    }

    const queryEmbedding = await this.embeddingProvider.embed(query);
    return this.searchByEmbedding(queryEmbedding, { level, limit, minScore });
  }

  searchByEmbedding(
    queryEmbedding: number[],
    options: {
      level?: "original" | "episode" | "semantic" | "theme";
      limit?: number;
      minScore?: number;
    } = {}
  ): VectorSearchResult[] {
    const { level, limit = 10, minScore = 0.5 } = options;

    const memories = this.store.search("", { level, limit: 1000 });
    const results: VectorSearchResult[] = [];

    for (const memory of memories) {
      const embedding = this.getEmbedding(memory.id);
      if (!embedding) continue;

      const score = this.cosineSimilarity(queryEmbedding, embedding);
      if (score >= minScore) {
        results.push({ memory, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  private fallbackSearch(
    query: string,
    options: {
      level?: "original" | "episode" | "semantic" | "theme";
      limit?: number;
      minScore?: number;
    }
  ): VectorSearchResult[] {
    const { level, limit = 10 } = options;
    const keywords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

    const memories = this.store.searchByKeywords(keywords, { level, limit: limit * 2 });

    return memories.slice(0, limit).map((memory) => ({
      memory,
      score: this.keywordMatchScore(query, memory),
    }));
  }

  private keywordMatchScore(query: string, memory: AnyMemory): number {
    const queryWords = new Set(query.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
    let content = "";
    
    if ("content" in memory) content = memory.content.toLowerCase();
    else if ("summary" in memory) content = memory.summary.toLowerCase();
    else if ("description" in memory) content = memory.description.toLowerCase();

    const contentWords = new Set(content.split(/\s+/).filter((w) => w.length > 2));
    
    let matchCount = 0;
    for (const word of queryWords) {
      if (contentWords.has(word)) matchCount++;
    }

    return queryWords.size > 0 ? matchCount / queryWords.size : 0;
  }

  async findSimilar(
    memoryId: string,
    options: {
      level?: "original" | "episode" | "semantic" | "theme";
      limit?: number;
      minScore?: number;
      excludeSelf?: boolean;
    } = {}
  ): Promise<VectorSearchResult[]> {
    const { level, limit = 5, minScore = 0.7, excludeSelf = true } = options;

    const embedding = this.getEmbedding(memoryId);
    if (!embedding) return [];

    const results = this.searchByEmbedding(embedding, { level, limit: limit + 1, minScore });

    return results.filter((r) => !excludeSelf || r.memory.id !== memoryId).slice(0, limit);
  }

  async findDuplicates(
    memoryId: string,
    threshold: number = 0.95
  ): Promise<AnyMemory[]> {
    const similar = await this.findSimilar(memoryId, { limit: 10, minScore: threshold });
    return similar.map((r) => r.memory);
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export class SimpleEmbeddingProvider implements EmbeddingProvider {
  private dimension: number;

  constructor(dimension: number = 384) {
    this.dimension = dimension;
  }

  async embed(text: string): Promise<number[]> {
    const hash = this.simpleHash(text);
    const embedding: number[] = [];
    
    for (let i = 0; i < this.dimension; i++) {
      const seed = hash + i;
      embedding.push(this.seededRandom(seed));
    }

    const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    return embedding.map((v) => v / norm);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  private simpleHash(text: string): number {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private seededRandom(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }
}
