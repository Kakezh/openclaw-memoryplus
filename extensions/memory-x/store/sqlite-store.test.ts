/**
 * Tests for SQLite Memory Store
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SQLiteMemoryStore } from "./sqlite-store.js";
import type { OriginalMemory, EpisodeMemory, SemanticMemory, ThemeMemory } from "../types.js";
import fs from "fs";
import path from "path";
import os from "os";

describe("SQLiteMemoryStore", () => {
  let store: SQLiteMemoryStore;
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-x-test-"));
    store = new SQLiteMemoryStore(testDir);
  });

  afterEach(() => {
    store.close();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe("save and get", () => {
    it("should save and retrieve an original memory", () => {
      const original: OriginalMemory = {
        id: "orig-test-1",
        content: "Test content",
        timestamp: Date.now(),
        sessionId: "session-1",
        speaker: "user",
      };

      store.save(original);

      const retrieved = store.get<OriginalMemory>("orig-test-1", "original");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.content).toBe("Test content");
      expect(retrieved?.speaker).toBe("user");
    });

    it("should save and retrieve a semantic memory", () => {
      const semantic: SemanticMemory = {
        id: "sem-test-1",
        content: "User prefers dark mode",
        type: "preference",
        confidence: 0.9,
        sourceEpisodes: ["ep-1"],
        entityRefs: ["User"],
      };

      store.save(semantic);

      const retrieved = store.get<SemanticMemory>("sem-test-1", "semantic");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.content).toBe("User prefers dark mode");
      expect(retrieved?.type).toBe("preference");
      expect(retrieved?.confidence).toBe(0.9);
    });

    it("should save and retrieve a theme memory with relations", () => {
      const theme: ThemeMemory = {
        id: "theme-test-1",
        name: "User Preferences",
        description: "Theme for user preferences",
        semanticIds: ["sem-1", "sem-2"],
        coherenceScore: 0.8,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      store.save(theme);

      const retrieved = store.get<ThemeMemory>("theme-test-1", "theme");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe("User Preferences");
      expect(retrieved?.semanticIds).toEqual(["sem-1", "sem-2"]);
    });
  });

  describe("search", () => {
    beforeEach(() => {
      const semantic1: SemanticMemory = {
        id: "sem-1",
        content: "User prefers dark mode for coding",
        type: "preference",
        confidence: 0.9,
        sourceEpisodes: [],
        entityRefs: ["User"],
      };

      const semantic2: SemanticMemory = {
        id: "sem-2",
        content: "User likes coffee in the morning",
        type: "preference",
        confidence: 0.8,
        sourceEpisodes: [],
        entityRefs: ["User"],
      };

      store.save(semantic1);
      store.save(semantic2);
    });

    it("should search by keyword", () => {
      const results = store.search("dark mode");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe("sem-1");
    });

    it("should search by multiple keywords", () => {
      const results = store.searchByKeywords(["user", "coffee"]);
      expect(results.length).toBeGreaterThan(0);
    });

    it("should filter by level", () => {
      const results = store.search("user", { level: "semantic" });
      expect(results.every((r) => "content" in r)).toBe(true);
    });
  });

  describe("count and stats", () => {
    it("should count memories correctly", () => {
      const original: OriginalMemory = {
        id: "orig-1",
        content: "Test",
        timestamp: Date.now(),
        sessionId: "s1",
        speaker: "user",
      };

      const semantic: SemanticMemory = {
        id: "sem-1",
        content: "Test semantic",
        type: "fact",
        confidence: 0.5,
        sourceEpisodes: [],
        entityRefs: [],
      };

      store.save(original);
      store.save(semantic);

      expect(store.count()).toBe(2);
      expect(store.count("original")).toBe(1);
      expect(store.count("semantic")).toBe(1);
    });

    it("should return correct stats", () => {
      const semantic: SemanticMemory = {
        id: "sem-1",
        content: "Test",
        type: "fact",
        confidence: 0.5,
        sourceEpisodes: [],
        entityRefs: [],
      };

      store.save(semantic);

      const stats = store.stats();
      expect(stats.total).toBe(1);
      expect(stats.byLevel.semantic).toBe(1);
    });
  });

  describe("delete", () => {
    it("should delete a memory", () => {
      const semantic: SemanticMemory = {
        id: "sem-del-1",
        content: "To be deleted",
        type: "fact",
        confidence: 0.5,
        sourceEpisodes: [],
        entityRefs: [],
      };

      store.save(semantic);
      expect(store.get("sem-del-1", "semantic")).not.toBeNull();

      const result = store.delete("sem-del-1");
      expect(result).toBe(true);
      expect(store.get("sem-del-1", "semantic")).toBeNull();
    });
  });

  describe("transaction", () => {
    it("should rollback on error", () => {
      const semantic: SemanticMemory = {
        id: "sem-tx-1",
        content: "Transaction test",
        type: "fact",
        confidence: 0.5,
        sourceEpisodes: [],
        entityRefs: [],
      };

      expect(() => {
        store.transaction(() => {
          store.save(semantic);
          throw new Error("Simulated error");
        });
      }).toThrow();

      expect(store.get("sem-tx-1", "semantic")).toBeNull();
    });

    it("should commit on success", () => {
      const semantic: SemanticMemory = {
        id: "sem-tx-2",
        content: "Transaction test 2",
        type: "fact",
        confidence: 0.5,
        sourceEpisodes: [],
        entityRefs: [],
      };

      store.transaction(() => {
        store.save(semantic);
      });

      expect(store.get("sem-tx-2", "semantic")).not.toBeNull();
    });
  });
});
