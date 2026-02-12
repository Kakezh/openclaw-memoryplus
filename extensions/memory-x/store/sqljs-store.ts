/**
 * SQLite Store using sql.js (Pure JavaScript, No Native Dependencies)
 * Enables true hot-pluggable plugin installation
 */

import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
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
  embedding: Uint8Array | null;
  metadata: string;
  created_at: number;
  updated_at: number;
  access_count: number;
  last_accessed: number;
  retention_score: number;
}

export class SqlJsMemoryStore {
  private db: Database | null = null;
  private SQL: SqlJsStatic | null = null;
  private dbPath: string;
  private initialized = false;

  constructor(workspacePath: string) {
    this.dbPath = `${workspacePath}/.memory/memory.db`;
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    this.SQL = await initSqlJs({
      locateFile: (file) => `https://sql.js.org/dist/${file}`,
    });

    this.db = new this.SQL.Database();
    this.initializeSchema();
    this.initialized = true;
  }

  private initializeSchema(): void {
    if (!this.db) return;

    this.db.run(`
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
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_memories_level ON memories(level)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at)`);
  }

  save(memory: AnyMemory): void {
    if (!this.db) return;

    const level = this.getLevel(memory);
    const content = this.extractContent(memory);
    const metadata = JSON.stringify(this.extractMetadata(memory));
    const now = Date.now();

    this.db.run(
      `INSERT OR REPLACE INTO memories 
       (id, level, content, metadata, created_at, updated_at, access_count, last_accessed, retention_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [memory.id, level, content, metadata, now, now, 0, now, 1.0]
    );
  }

  get<T extends AnyMemory>(id: string, level: MemoryLevel): T | null {
    if (!this.db) return null;

    const results = this.db.exec(
      "SELECT * FROM memories WHERE id = ? AND level = ?",
      [id, level]
    );

    if (results.length === 0 || results[0].values.length === 0) {
      return null;
    }

    return this.rowToMemory(results[0].values[0]) as T;
  }

  search(query: string, options: { level?: MemoryLevel; limit?: number } = {}): AnyMemory[] {
    if (!this.db) return [];

    const { level, limit = 10 } = options;
    const searchPattern = `%${query}%`;

    let sql = "SELECT * FROM memories WHERE content LIKE ?";
    const params: (string | number)[] = [searchPattern];

    if (level) {
      sql += " AND level = ?";
      params.push(level);
    }

    sql += " ORDER BY retention_score DESC LIMIT ?";
    params.push(limit);

    const results = this.db.exec(sql, params);
    if (results.length === 0) return [];

    return results[0].values.map((row) => this.rowToMemory(row));
  }

  delete(id: string): boolean {
    if (!this.db) return false;

    this.db.run("DELETE FROM memories WHERE id = ?", [id]);
    return true;
  }

  count(level?: MemoryLevel): number {
    if (!this.db) return 0;

    if (level) {
      const results = this.db.exec(
        "SELECT COUNT(*) as count FROM memories WHERE level = ?",
        [level]
      );
      return results[0]?.values[0]?.[0] as number || 0;
    }

    const results = this.db.exec("SELECT COUNT(*) as count FROM memories");
    return results[0]?.values[0]?.[0] as number || 0;
  }

  stats(): {
    total: number;
    byLevel: Record<MemoryLevel, number>;
    avgAccessCount: number;
    avgRetentionScore: number;
  } {
    return {
      total: this.count(),
      byLevel: {
        original: this.count("original"),
        episode: this.count("episode"),
        semantic: this.count("semantic"),
        theme: this.count("theme"),
      },
      avgAccessCount: 0,
      avgRetentionScore: 1.0,
    };
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
    if ("type" in memory) meta.type = memory.type;
    if ("confidence" in memory) meta.confidence = memory.confidence;
    if ("entityRefs" in memory) meta.entityRefs = memory.entityRefs;
    if ("name" in memory) meta.name = memory.name;
    return meta;
  }

  private rowToMemory(row: any[]): AnyMemory {
    const [id, level, content, , metadataStr, createdAt] = row;
    const metadata = JSON.parse(metadataStr as string);

    switch (level as MemoryLevel) {
      case "original":
        return {
          id: id as string,
          content: content as string,
          timestamp: metadata.timestamp || (createdAt as number),
          sessionId: metadata.sessionId || "default",
          speaker: metadata.speaker || "user",
        } as OriginalMemory;

      case "semantic":
        return {
          id: id as string,
          content: content as string,
          type: metadata.type || "fact",
          confidence: metadata.confidence || 0.5,
          sourceEpisodes: [],
          entityRefs: metadata.entityRefs || [],
        } as SemanticMemory;

      case "theme":
        return {
          id: id as string,
          name: metadata.name || id,
          description: content as string,
          semanticIds: [],
          coherenceScore: 0.5,
          createdAt: createdAt as number,
          updatedAt: createdAt as number,
        } as ThemeMemory;

      default:
        return {
          id: id as string,
          content: content as string,
        } as AnyMemory;
    }
  }

  async saveToFile(): Promise<void> {
    if (!this.db) return;

    const data = this.db.export();
    const buffer = Buffer.from(data);

    const fs = await import("fs/promises");
    const path = await import("path");

    const dir = path.dirname(this.dbPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.dbPath, buffer);
  }

  async loadFromFile(): Promise<void> {
    if (!this.SQL) return;

    try {
      const fs = await import("fs/promises");
      const buffer = await fs.readFile(this.dbPath);
      this.db = new this.SQL.Database(buffer);
    } catch {
      // File doesn't exist, create new database
      this.db = new this.SQL.Database();
      this.initializeSchema();
    }
  }

  close(): void {
    this.db?.close();
    this.db = null;
    this.initialized = false;
  }
}
