/**
 * SQLite-based Memory Store
 * Replaces file-system storage with SQLite + vector extension
 */

import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import path from "path";
import fs from "fs";
import type {
  OriginalMemory,
  EpisodeMemory,
  SemanticMemory,
  ThemeMemory,
  AnyMemory,
} from "../types.js";

type MemoryLevel = "original" | "episode" | "semantic" | "theme";

interface MemoryRow {
  id: string;
  level: MemoryLevel;
  content: string;
  embedding: Buffer | null;
  metadata: string;
  created_at: number;
  updated_at: number;
  access_count: number;
  last_accessed: number;
  retention_score: number;
}

interface ThemeRelationRow {
  id: string;
  theme_id: string;
  semantic_id: string;
  created_at: number;
}

export class SQLiteMemoryStore {
  private db: DatabaseType;
  private dbPath: string;

  constructor(workspacePath: string) {
    const memoryDir = path.join(workspacePath, ".memory");
    if (!fs.existsSync(memoryDir)) {
      fs.mkdirSync(memoryDir, { recursive: true });
    }
    this.dbPath = path.join(memoryDir, "memory.db");
    this.db = new Database(this.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.initializeSchema();
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        level TEXT NOT NULL CHECK(level IN ('original', 'episode', 'semantic', 'theme')),
        content TEXT NOT NULL,
        embedding BLOB,
        metadata TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        access_count INTEGER DEFAULT 0,
        last_accessed INTEGER DEFAULT 0,
        retention_score REAL DEFAULT 1.0
      );

      CREATE INDEX IF NOT EXISTS idx_memories_level ON memories(level);
      CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);
      CREATE INDEX IF NOT EXISTS idx_memories_retention ON memories(retention_score);
      CREATE INDEX IF NOT EXISTS idx_memories_access ON memories(access_count);

      CREATE TABLE IF NOT EXISTS theme_relations (
        id TEXT PRIMARY KEY,
        theme_id TEXT NOT NULL,
        semantic_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (theme_id) REFERENCES memories(id) ON DELETE CASCADE,
        FOREIGN KEY (semantic_id) REFERENCES memories(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_theme_relations_theme ON theme_relations(theme_id);
      CREATE INDEX IF NOT EXISTS idx_theme_relations_semantic ON theme_relations(semantic_id);

      CREATE TABLE IF NOT EXISTS episode_sources (
        id TEXT PRIMARY KEY,
        episode_id TEXT NOT NULL,
        original_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (episode_id) REFERENCES memories(id) ON DELETE CASCADE,
        FOREIGN KEY (original_id) REFERENCES memories(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_episode_sources_episode ON episode_sources(episode_id);

      CREATE TABLE IF NOT EXISTS semantic_sources (
        id TEXT PRIMARY KEY,
        semantic_id TEXT NOT NULL,
        episode_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (semantic_id) REFERENCES memories(id) ON DELETE CASCADE,
        FOREIGN KEY (episode_id) REFERENCES memories(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_semantic_sources_semantic ON semantic_sources(semantic_id);
    `);
  }

  save(memory: AnyMemory): void {
    const level = this.getLevel(memory);
    const content = this.extractContent(memory);
    const metadata = JSON.stringify(this.extractMetadata(memory));
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO memories (id, level, content, metadata, created_at, updated_at, access_count, last_accessed, retention_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      memory.id,
      level,
      content,
      metadata,
      (memory as any).createdAt || now,
      now,
      0,
      now,
      1.0
    );

    if (level === "theme") {
      this.saveThemeRelations(memory as ThemeMemory);
    } else if (level === "semantic") {
      this.saveSemanticSources(memory as SemanticMemory);
    } else if (level === "episode") {
      this.saveEpisodeSources(memory as EpisodeMemory);
    }
  }

  private getLevel(memory: AnyMemory): MemoryLevel {
    if ("originalIds" in memory) return "episode";
    if ("sourceEpisodes" in memory) return "semantic";
    if ("semanticIds" in memory) return "theme";
    return "original";
  }

  private extractContent(memory: AnyMemory): string {
    if ("content" in memory) return memory.content;
    if ("summary" in memory) return memory.summary;
    if ("description" in memory) return memory.description;
    return "";
  }

  private extractMetadata(memory: AnyMemory): Record<string, any> {
    const meta: Record<string, any> = {};
    if ("timestamp" in memory) meta.timestamp = memory.timestamp;
    if ("sessionId" in memory) meta.sessionId = memory.sessionId;
    if ("speaker" in memory) meta.speaker = memory.speaker;
    if ("metadata" in memory) meta.metadata = memory.metadata;
    if ("type" in memory) meta.type = memory.type;
    if ("confidence" in memory) meta.confidence = memory.confidence;
    if ("entityRefs" in memory) meta.entityRefs = memory.entityRefs;
    if ("validityPeriod" in memory) meta.validityPeriod = memory.validityPeriod;
    if ("name" in memory) meta.name = memory.name;
    if ("coherenceScore" in memory) meta.coherenceScore = memory.coherenceScore;
    if ("parentTheme" in memory) meta.parentTheme = memory.parentTheme;
    if ("childThemes" in memory) meta.childThemes = memory.childThemes;
    if ("boundaryType" in memory) meta.boundaryType = memory.boundaryType;
    if ("startTime" in memory) meta.startTime = memory.startTime;
    if ("endTime" in memory) meta.endTime = memory.endTime;
    return meta;
  }

  private saveThemeRelations(theme: ThemeMemory): void {
    const deleteStmt = this.db.prepare("DELETE FROM theme_relations WHERE theme_id = ?");
    deleteStmt.run(theme.id);

    const insertStmt = this.db.prepare(`
      INSERT INTO theme_relations (id, theme_id, semantic_id, created_at)
      VALUES (?, ?, ?, ?)
    `);

    for (const semanticId of theme.semanticIds) {
      insertStmt.run(`tr-${theme.id}-${semanticId}`, theme.id, semanticId, Date.now());
    }
  }

  private saveSemanticSources(semantic: SemanticMemory): void {
    const deleteStmt = this.db.prepare("DELETE FROM semantic_sources WHERE semantic_id = ?");
    deleteStmt.run(semantic.id);

    const insertStmt = this.db.prepare(`
      INSERT INTO semantic_sources (id, semantic_id, episode_id, created_at)
      VALUES (?, ?, ?, ?)
    `);

    for (const episodeId of semantic.sourceEpisodes) {
      insertStmt.run(`ss-${semantic.id}-${episodeId}`, semantic.id, episodeId, Date.now());
    }
  }

  private saveEpisodeSources(episode: EpisodeMemory): void {
    const deleteStmt = this.db.prepare("DELETE FROM episode_sources WHERE episode_id = ?");
    deleteStmt.run(episode.id);

    const insertStmt = this.db.prepare(`
      INSERT INTO episode_sources (id, episode_id, original_id, created_at)
      VALUES (?, ?, ?, ?)
    `);

    for (const originalId of episode.originalIds) {
      insertStmt.run(`es-${episode.id}-${originalId}`, episode.id, originalId, Date.now());
    }
  }

  get<T extends AnyMemory>(id: string, level: MemoryLevel): T | null {
    const stmt = this.db.prepare("SELECT * FROM memories WHERE id = ? AND level = ?");
    const row = stmt.get(id, level) as MemoryRow | undefined;
    if (!row) return null;

    this.updateAccessCount(id);
    return this.rowToMemory(row) as T;
  }

  private updateAccessCount(id: string): void {
    const stmt = this.db.prepare(`
      UPDATE memories SET access_count = access_count + 1, last_accessed = ? WHERE id = ?
    `);
    stmt.run(Date.now(), id);
  }

  private rowToMemory(row: MemoryRow): AnyMemory {
    const metadata = JSON.parse(row.metadata);
    const base = {
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    switch (row.level) {
      case "original":
        return {
          ...base,
          content: row.content,
          timestamp: metadata.timestamp || row.created_at,
          sessionId: metadata.sessionId || "default",
          speaker: metadata.speaker || "user",
          metadata: metadata.metadata,
        } as OriginalMemory;

      case "episode":
        return {
          ...base,
          summary: row.content,
          originalIds: this.getEpisodeSourceIds(row.id),
          startTime: metadata.startTime || row.created_at,
          endTime: metadata.endTime || row.created_at,
          boundaryType: metadata.boundaryType || "topic",
          coherenceScore: metadata.coherenceScore || 0.5,
        } as EpisodeMemory;

      case "semantic":
        return {
          ...base,
          content: row.content,
          type: metadata.type || "fact",
          confidence: metadata.confidence || 0.5,
          sourceEpisodes: this.getSemanticSourceIds(row.id),
          entityRefs: metadata.entityRefs || [],
          validityPeriod: metadata.validityPeriod,
          conflictingWith: metadata.conflictingWith,
        } as SemanticMemory;

      case "theme":
        return {
          ...base,
          name: metadata.name || row.id,
          description: row.content,
          semanticIds: this.getThemeSemanticIds(row.id),
          coherenceScore: metadata.coherenceScore || 0.5,
          parentTheme: metadata.parentTheme,
          childThemes: metadata.childThemes,
        } as ThemeMemory;
    }
  }

  private getEpisodeSourceIds(episodeId: string): string[] {
    const stmt = this.db.prepare("SELECT original_id FROM episode_sources WHERE episode_id = ?");
    const rows = stmt.all(episodeId) as { original_id: string }[];
    return rows.map((r) => r.original_id);
  }

  private getSemanticSourceIds(semanticId: string): string[] {
    const stmt = this.db.prepare("SELECT episode_id FROM semantic_sources WHERE semantic_id = ?");
    const rows = stmt.all(semanticId) as { episode_id: string }[];
    return rows.map((r) => r.episode_id);
  }

  private getThemeSemanticIds(themeId: string): string[] {
    const stmt = this.db.prepare("SELECT semantic_id FROM theme_relations WHERE theme_id = ?");
    const rows = stmt.all(themeId) as { semantic_id: string }[];
    return rows.map((r) => r.semantic_id);
  }

  search(query: string, options: {
    level?: MemoryLevel;
    limit?: number;
    offset?: number;
  } = {}): AnyMemory[] {
    const { level, limit = 10, offset = 0 } = options;
    
    let sql = "SELECT * FROM memories WHERE content LIKE ?";
    const params: any[] = [`%${query}%`];

    if (level) {
      sql += " AND level = ?";
      params.push(level);
    }

    sql += " ORDER BY retention_score DESC, access_count DESC, created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as MemoryRow[];
    return rows.map((r) => this.rowToMemory(r));
  }

  searchByKeywords(keywords: string[], options: {
    level?: MemoryLevel;
    limit?: number;
  } = {}): AnyMemory[] {
    const { level, limit = 10 } = options;
    
    if (keywords.length === 0) return [];

    let sql = "SELECT * FROM memories WHERE ";
    const conditions: string[] = [];
    const params: any[] = [];

    for (const keyword of keywords) {
      conditions.push("content LIKE ?");
      params.push(`%${keyword}%`);
    }

    sql += conditions.join(" OR ");

    if (level) {
      sql += " AND level = ?";
      params.push(level);
    }

    sql += " ORDER BY retention_score DESC, access_count DESC LIMIT ?";
    params.push(limit);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as MemoryRow[];
    return rows.map((r) => this.rowToMemory(r));
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare("DELETE FROM memories WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }

  count(level?: MemoryLevel): number {
    if (level) {
      const stmt = this.db.prepare("SELECT COUNT(*) as count FROM memories WHERE level = ?");
      const result = stmt.get(level) as { count: number };
      return result.count;
    }
    const stmt = this.db.prepare("SELECT COUNT(*) as count FROM memories");
    const result = stmt.get() as { count: number };
    return result.count;
  }

  stats(): {
    total: number;
    byLevel: Record<MemoryLevel, number>;
    avgAccessCount: number;
    avgRetentionScore: number;
  } {
    const total = this.count();
    const byLevel: Record<MemoryLevel, number> = {
      original: this.count("original"),
      episode: this.count("episode"),
      semantic: this.count("semantic"),
      theme: this.count("theme"),
    };

    const avgStmt = this.db.prepare("SELECT AVG(access_count) as avg_access, AVG(retention_score) as avg_retention FROM memories");
    const avgResult = avgStmt.get() as { avg_access: number; avg_retention: number };

    return {
      total,
      byLevel,
      avgAccessCount: avgResult.avg_access || 0,
      avgRetentionScore: avgResult.avg_retention || 1.0,
    };
  }

  updateEmbedding(id: string, embedding: number[]): void {
    const buffer = Buffer.from(new Float32Array(embedding).buffer);
    const stmt = this.db.prepare("UPDATE memories SET embedding = ? WHERE id = ?");
    stmt.run(buffer, id);
  }

  getEmbedding(id: string): number[] | null {
    const stmt = this.db.prepare("SELECT embedding FROM memories WHERE id = ?");
    const row = stmt.get(id) as { embedding: Buffer } | undefined;
    if (!row || !row.embedding) return null;

    const float32 = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4);
    return Array.from(float32);
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  close(): void {
    this.db.close();
  }

  getPath(): string {
    return this.dbPath;
  }
}
