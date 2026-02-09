/**
 * ## Retain Section Parser
 * Parses Workspace Memory v2 format from daily log files
 */

import type { ParsedMemoryEntry, RetainSection, MemoryEntryType } from "./types.js";

// Regex patterns for parsing Retain entries
const RETAIN_ENTRY_REGEX = /^-\s+([WBOS])(?:\(c=([\d.]+)\))?\s+((?:@[\w-]+\s+)*)?(.+)$/;
const ENTITY_REGEX = /@([\w-]+)/g;
const DATE_REGEX = /(\d{4}-\d{2}-\d{2})/;

/**
 * Parse a single Retain entry line
 * Format: - W @Peter: Content here
 *         - O(c=0.95) @Peter: Opinion here
 */
export function parseRetainEntry(
  line: string,
  lineNumber: number,
  sourceFile: string
): ParsedMemoryEntry | null {
  const match = line.match(RETAIN_ENTRY_REGEX);
  if (!match) {
    return null;
  }

  const [, type, confidenceStr, entityPart, content] = match;
  
  // Extract entities
  const entities: string[] = [];
  if (entityPart) {
    let entityMatch;
    while ((entityMatch = ENTITY_REGEX.exec(entityPart)) !== null) {
      entities.push(entityMatch[1]);
    }
  }

  // Also look for entities in content
  let contentEntityMatch;
  while ((contentEntityMatch = ENTITY_REGEX.exec(content)) !== null) {
    const entity = contentEntityMatch[1];
    if (!entities.includes(entity)) {
      entities.push(entity);
    }
  }

  // Parse confidence for opinions
  let confidence: number | undefined;
  if (type === "O" && confidenceStr) {
    confidence = parseFloat(confidenceStr);
    if (isNaN(confidence) || confidence < 0 || confidence > 1) {
      confidence = 0.5; // Default confidence
    }
  }

  // Try to extract timestamp from content
  let timestamp: number | undefined;
  const dateMatch = content.match(DATE_REGEX);
  if (dateMatch) {
    const parsedDate = new Date(dateMatch[1]);
    if (!isNaN(parsedDate.getTime())) {
      timestamp = parsedDate.getTime();
    }
  }

  return {
    id: `${sourceFile}:${lineNumber}`,
    type: type as MemoryEntryType,
    content: content.trim(),
    confidence,
    entities,
    source: sourceFile,
    lineNumber,
    timestamp,
  };
}

/**
 * Extract ## Retain section from markdown content
 */
export function extractRetainSection(content: string): string | null {
  const retainRegex = /##\s*Retain\s*\n([\s\S]*?)(?=\n##\s|\n*$)/i;
  const match = content.match(retainRegex);
  return match ? match[1].trim() : null;
}

/**
 * Parse entire ## Retain section
 */
export function parseRetainSection(
  content: string,
  sourceFile: string
): RetainSection | null {
  const retainContent = extractRetainSection(content);
  if (!retainContent) {
    return null;
  }

  // Extract date from filename (memory/YYYY-MM-DD.md)
  const dateMatch = sourceFile.match(/(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : new Date().toISOString().split("T")[0];

  const entries: ParsedMemoryEntry[] = [];
  const lines = retainContent.split("\n");
  
  let lineNumber = 0;
  for (const line of lines) {
    lineNumber++;
    const trimmedLine = line.trim();
    
    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith("<!--")) {
      continue;
    }

    const entry = parseRetainEntry(trimmedLine, lineNumber, sourceFile);
    if (entry) {
      entries.push(entry);
    }
  }

  return {
    entries,
    sourceFile,
    date,
  };
}

/**
 * Format a memory entry for display
 */
export function formatMemoryEntry(entry: ParsedMemoryEntry): string {
  const typeLabel = entry.type;
  const confidenceStr = entry.confidence !== undefined 
    ? `(c=${entry.confidence.toFixed(2)})` 
    : "";
  const entityStr = entry.entities.length > 0 
    ? entry.entities.map(e => `@${e}`).join(" ") + " " 
    : "";
  
  return `- ${typeLabel}${confidenceStr} ${entityStr}${entry.content}`;
}

/**
 * Generate ## Retain section from entries
 */
export function generateRetainSection(entries: ParsedMemoryEntry[]): string {
  if (entries.length === 0) {
    return "## Retain\n\n_No entries yet._\n";
  }

  const lines = ["## Retain", ""];
  
  for (const entry of entries) {
    lines.push(formatMemoryEntry(entry));
  }
  
  lines.push("");
  return lines.join("\n");
}

/**
 * Validate a Retain entry format
 */
export function validateRetainEntry(line: string): {
  valid: boolean;
  error?: string;
  type?: MemoryEntryType;
} {
  const trimmed = line.trim();
  
  if (!trimmed.startsWith("- ")) {
    return { valid: false, error: "Entry must start with '- '" };
  }

  const match = trimmed.match(RETAIN_ENTRY_REGEX);
  if (!match) {
    return { 
      valid: false, 
      error: "Invalid format. Expected: - [W/B/O/S](c=0.x) @entity: content" 
    };
  }

  const [, type, confidenceStr] = match;
  
  if (type === "O" && confidenceStr) {
    const confidence = parseFloat(confidenceStr);
    if (isNaN(confidence) || confidence < 0 || confidence > 1) {
      return { 
        valid: false, 
        error: "Confidence must be between 0 and 1",
        type: type as MemoryEntryType
      };
    }
  }

  return { valid: true, type: type as MemoryEntryType };
}
