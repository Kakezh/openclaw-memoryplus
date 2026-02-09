/**
 * Bank Directory Manager
 * Manages the bank/ directory structure for Workspace Memory v2
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { BankStructure, BankFileType, MemoryBankConfig } from "./types.js";

const DEFAULT_BANK_FILES: Record<BankFileType, string> = {
  world: "world.md",
  experience: "experience.md",
  opinions: "opinions.md",
};

const BANK_FILE_TEMPLATES: Record<BankFileType, string> = {
  world: `# World

Objective facts about the world, external systems, and shared context.

## Facts

<!-- Add facts here -->
`,
  experience: `# Experience

What the agent did, learned, and experienced (first-person).

## Experiences

<!-- Add experiences here -->
`,
  opinions: `# Opinions

Subjective preferences, judgments, and beliefs with confidence tracking.

## Opinions

<!-- Format: - Statement (c=0.95) [evidence: fact-id] -->
`,
};

export class BankManager {
  private config: MemoryBankConfig;
  private bankPath: string;
  private entitiesPath: string;

  constructor(config: MemoryBankConfig) {
    this.config = config;
    this.bankPath = path.join(config.workspacePath, "bank");
    this.entitiesPath = path.join(this.bankPath, "entities");
  }

  /**
   * Initialize bank directory structure
   */
  async initialize(): Promise<BankStructure> {
    // Create bank directory
    await fs.mkdir(this.bankPath, { recursive: true });
    
    // Create entities subdirectory
    await fs.mkdir(this.entitiesPath, { recursive: true });

    // Create default bank files if they don't exist
    for (const [type, filename] of Object.entries(DEFAULT_BANK_FILES)) {
      const filePath = path.join(this.bankPath, filename);
      try {
        await fs.access(filePath);
      } catch {
        // File doesn't exist, create it
        const template = BANK_FILE_TEMPLATES[type as BankFileType];
        await fs.writeFile(filePath, template, "utf-8");
      }
    }

    return {
      world: path.join(this.bankPath, DEFAULT_BANK_FILES.world),
      experience: path.join(this.bankPath, DEFAULT_BANK_FILES.experience),
      opinions: path.join(this.bankPath, DEFAULT_BANK_FILES.opinions),
      entities: this.entitiesPath,
    };
  }

  /**
   * Get bank structure paths
   */
  getStructure(): BankStructure {
    return {
      world: path.join(this.bankPath, DEFAULT_BANK_FILES.world),
      experience: path.join(this.bankPath, DEFAULT_BANK_FILES.experience),
      opinions: path.join(this.bankPath, DEFAULT_BANK_FILES.opinions),
      entities: this.entitiesPath,
    };
  }

  /**
   * Check if bank is initialized
   */
  async isInitialized(): Promise<boolean> {
    try {
      await fs.access(this.bankPath);
      await fs.access(this.entitiesPath);
      
      // Check if default files exist
      for (const filename of Object.values(DEFAULT_BANK_FILES)) {
        await fs.access(path.join(this.bankPath, filename));
      }
      
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read a bank file
   */
  async readBankFile(type: BankFileType): Promise<string> {
    const filePath = path.join(this.bankPath, DEFAULT_BANK_FILES[type]);
    try {
      return await fs.readFile(filePath, "utf-8");
    } catch (error) {
      throw new Error(`Failed to read ${type} bank file: ${error}`);
    }
  }

  /**
   * Write to a bank file
   */
  async writeBankFile(type: BankFileType, content: string): Promise<void> {
    const filePath = path.join(this.bankPath, DEFAULT_BANK_FILES[type]);
    await fs.writeFile(filePath, content, "utf-8");
  }

  /**
   * Append an entry to a bank file
   */
  async appendToBankFile(type: BankFileType, entry: string): Promise<void> {
    const filePath = path.join(this.bankPath, DEFAULT_BANK_FILES[type]);
    const content = await this.readBankFile(type);
    const updated = content + "\n" + entry + "\n";
    await fs.writeFile(filePath, updated, "utf-8");
  }

  /**
   * List all entity pages
   */
  async listEntities(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.entitiesPath);
      return files
        .filter(f => f.endsWith(".md"))
        .map(f => f.replace(".md", ""));
    } catch {
      return [];
    }
  }

  /**
   * Read an entity page
   */
  async readEntity(entityId: string): Promise<string | null> {
    const filePath = path.join(this.entitiesPath, `${entityId}.md`);
    try {
      return await fs.readFile(filePath, "utf-8");
    } catch {
      return null;
    }
  }

  /**
   * Write an entity page
   */
  async writeEntity(entityId: string, content: string): Promise<void> {
    const filePath = path.join(this.entitiesPath, `${entityId}.md`);
    await fs.writeFile(filePath, content, "utf-8");
  }

  /**
   * Create or update an entity page
   */
  async upsertEntity(
    entityId: string,
    name: string,
    summary: string,
    facts: string[] = []
  ): Promise<void> {
    const existing = await this.readEntity(entityId);
    
    let content: string;
    if (existing) {
      // Update existing
      content = this.updateEntityContent(existing, name, summary, facts);
    } else {
      // Create new
      content = this.createEntityContent(entityId, name, summary, facts);
    }
    
    await this.writeEntity(entityId, content);
  }

  /**
   * Create entity page content
   */
  private createEntityContent(
    entityId: string,
    name: string,
    summary: string,
    facts: string[]
  ): string {
    const lines = [
      `# ${name}`,
      "",
      summary,
      "",
      "## Facts",
      "",
    ];
    
    for (const fact of facts) {
      lines.push(`- ${fact}`);
    }
    
    lines.push("");
    return lines.join("\n");
  }

  /**
   * Update existing entity page content
   */
  private updateEntityContent(
    existing: string,
    name: string,
    summary: string,
    newFacts: string[]
  ): string {
    // Simple update: replace header and summary, append new facts
    const lines = existing.split("\n");
    
    // Update title
    if (lines[0]?.startsWith("# ")) {
      lines[0] = `# ${name}`;
    }
    
    // Find and update summary (between title and ## Facts)
    const factsIndex = lines.findIndex(l => l.startsWith("## Facts"));
    if (factsIndex > 0) {
      // Replace summary section
      const newLines = [
        lines[0],
        "",
        summary,
        "",
        "## Facts",
        "",
      ];
      
      // Add existing facts
      const existingFacts = lines
        .slice(factsIndex + 2)
        .filter(l => l.startsWith("- "));
      
      // Merge and deduplicate facts
      const allFacts = [...new Set([...existingFacts, ...newFacts.map(f => `- ${f}`)])];
      newLines.push(...allFacts);
      newLines.push("");
      
      return newLines.join("\n");
    }
    
    return existing;
  }

  /**
   * Get bank statistics
   */
  async getStats(): Promise<{
    worldEntries: number;
    experienceEntries: number;
    opinionEntries: number;
    entityCount: number;
  }> {
    const stats = {
      worldEntries: 0,
      experienceEntries: 0,
      opinionEntries: 0,
      entityCount: 0,
    };

    // Count entries in each bank file
    for (const type of ["world", "experience", "opinions"] as BankFileType[]) {
      try {
        const content = await this.readBankFile(type);
        const entries = content.split("\n").filter(l => l.startsWith("- ")).length;
        stats[`${type}Entries` as keyof typeof stats] = entries;
      } catch {
        // File doesn't exist
      }
    }

    // Count entities
    stats.entityCount = (await this.listEntities()).length;

    return stats;
  }
}
