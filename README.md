# OpenClaw Memory+ Enhancement Documentation

> Intelligent memory system enhancement based on AMemGym paper and Workspace Memory v2 specification (Welcome to communicate and collaborate with me to iterate a more complete work)

## 📋 Project Overview

This project is an improvement to the [OpenClaw](https://github.com/openclaw) memory system, aiming to achieve a paradigm of intelligent memory management by introducing three pluggable extensions.

### Original Project Memory System

The original OpenClaw memory system (`memory-core` and `memory-lancedb`) has room for optimization:

1. **Structuring**: Only supports simple Markdown chunk indexing without semantic type differentiation
2. **Intelligent Decision-Making**: Insufficient ability to distinguish important information
3. **Diagnostic Capability**: Insufficient analysis of failure reasons for memory write/read/utilization
4. **Self-Evolution**: Fixed memory strategy, unable to automatically optimize based on usage effectiveness
5. **Skill and Memory**: Skills and memory systems are independent and cannot enhance each other
6. **Automatic Discovery**: Unable to automatically discover reusable patterns from conversation history

---

## 🏗️ Improved Architecture

```
extensions/
├── memory-core/              # Original: Basic memory search
├── memory-lancedb/           # Original: LanceDB vector storage
├── memory-bank/              # [New] Workspace Memory v2
├── memory-amem/              # [New] AMemGym intelligent memory
└── memory-skill-miner/       # [New] Skill automatic discovery
```

---

## 📦 Extension 1: memory-bank (Workspace Memory v2)

### Features

#### 1.1 Structured Memory Directory

```
~/.openclaw/workspace/
├── memory.md                 # Core persistent facts (supported)
├── memory/
│   └── YYYY-MM-DD.md        # Daily logs (supported)
└── bank/                     # [New] Typed memory
    ├── world.md             # Objective world facts
    ├── experience.md        # Agent experiences
    ├── opinions.md          # Subjective opinions + confidence
    └── entities/
        ├── Peter.md
        ├── The-Castle.md
        └── warelay.md
```

#### 1.2 ## Retain Parser

Supports parsing structured memory entries from daily logs:

```markdown
## Retain
- W @Peter: Currently in Marrakech (Nov 27–Dec 1, 2025) for Andy's birthday.
- B @warelay: Fixed the Baileys WS crash by wrapping handlers in try/catch.
- O(c=0.95) @Peter: Prefers concise replies (<1500 chars) on WhatsApp.
```

**Type Markers**:
- `W`: World - Objective world facts
- `B`: Biographical/Experience - Agent experiences
- `O(c=0.x)`: Opinion - Subjective opinions (with confidence)
- `S`: Summary - Summary/observation
- `@Entity`: Entity reference

#### 1.3 Entity Page Management

Automatically create and manage entity pages, aggregating relevant information:

```markdown
# Peter

Summary of Peter...

## Facts
- Currently in Marrakech (Nov 27–Dec 1, 2025)
- Prefers concise replies on WhatsApp
```

### Implementation Files

| File | Function |
|------|----------|
| `types.ts` | Type definitions (BankStructure, ParsedMemoryEntry, OpinionEntry) |
| `parser.ts` | ## Retain parser, supports type markers and entity extraction |
| `bank-manager.ts` | Bank directory management, entity page CRUD |
| `index.ts` | Plugin entry, registers tools and CLI commands |

### Agent Tools

- `bank_parse_retain`: Parse ## Retain section
- `bank_update_entity`: Create/update entity page
- `bank_read_entity`: Read entity page
- `bank_append`: Append to bank file
- `bank_stats`: Get bank statistics

### CLI Commands

```bash
openclaw memory-bank init          # Initialize bank structure
openclaw memory-bank parse <file>  # Parse ## Retain
openclaw memory-bank stats         # View statistics
openclaw memory-bank entities      # List entities
```

---

## 🧠 Extension 2: memory-amem (AMemGym Intelligent Memory)

Based on the [AMemGym: Interactive Memory Benchmarking for Assistants](https://openreview.net/forum?id=sfrVLzsmlf) paper implementation.

### Core Concepts

#### 2.1 AWE Architecture (Agentic Write External)

Unlike traditional RAG (passive retrieval) or long context (Native), AWE allows the Agent to **actively decide** when to write to memory:

```
User input → Importance assessment → Confidence calibration → Duplicate detection → Decision (write/skip)
```

#### 2.2 Memory Type System

```typescript
type AMemEntryType = 
  | "fact"           // Objective facts
  | "preference"     // User preferences
  | "goal"          // User goals
  | "constraint"    // Constraint conditions
  | "relationship"  // Relationship information
  | "event";        // Event records
```

#### 2.3 Three-Stage Failure Diagnostics (AMemGym)

```typescript
interface MemoryDiagnostics {
  writeFailures: Array<{
    reason: "low_confidence" | "duplicate" | "incomplete_info" | "low_importance";
    content: string;
    timestamp: number;
  }>;
  readFailures: Array<{
    reason: "query_mismatch" | "retrieval_error" | "ranking_error";
    query: string;
    expected: string;
    retrieved: string[];
  }>;
  utilizationFailures: Array<{
    reason: "context_interference" | "reasoning_error" | "irrelevant_info";
    memory: AMemEntry;
    context: string;
    error: string;
  }>;
}
```

### Implementation Files

| File | Function |
|------|----------|
| `types.ts` | Type definitions (AMemEntry, WriteDecision, MemoryDiagnostics) |
| `write-decider.ts` | Intelligent write decider, supports importance assessment and duplicate detection |
| `index.ts` | Plugin entry, registers tools and CLI commands |

### Intelligent Write Decision Flow

```typescript
// 1. Assess content importance
const assessment = await assessContent(content, context);
// → { importance: 0.85, type: "preference", confidence: 0.9, entities: ["Peter"] }

// 2. Detect similar memories
const similar = findSimilarEntry(content, existingEntries);
// → If similarity > 0.85, return existing entry

// 3. Decision
if (importance < threshold) → Skip (low importance)
if (similar && confidence <= similar.confidence) → Skip (duplicate)
else → Write (new memory or update)
```

### Agent Tools

- `amem_write`: Intelligent memory write
- `amem_query`: Semantic memory query
- `amem_diagnostics`: Get diagnostic statistics
- `amem_update`: Update memory
- `amem_delete`: Delete memory

### CLI Commands

```bash
openclaw memory-amem stats         # View statistics
openclaw memory-amem list          # List memories
openclaw memory-amem diagnostics   # View diagnostics
```

---

## ⛏️ Extension 3: memory-skill-miner (Skill Automatic Discovery)

Based on the Anthropic Agent Skills concept, implements automatic skill discovery from conversations.

### Core Concepts

#### 3.1 Skill Mining Engine

Identify repetitive task patterns from conversation history:

```
Conversation logs → Intent extraction → Pattern matching → Clustering → Potential Skill
```

#### 3.2 Automatic Skill Generation

Transform identified patterns into standard SKILL.md:

```yaml
---
name: auto-skill-name
description: Handle requests related to "..."
metadata:
  openclaw:
    emoji: 🤖
    autoGenerated: true
    occurrenceCount: 5
---

# Auto Skill Name

## When to use
- "trigger pattern 1"
- "trigger pattern 2"

## Workflow
1. Step 1
2. Step 2

## Tools Used
- tool1
- tool2
```

### Implementation Files

| File | Function |
|------|----------|
| `types.ts` | Type definitions (PotentialSkill, GeneratedSkill, SkillEvaluation) |
| `miner.ts` | Skill mining engine, supports pattern matching and clustering |
| `index.ts` | Plugin entry, registers tools and CLI commands |

### Skill Mining Flow

```typescript
// 1. Load recent sessions
const sessions = await loadRecentSessions(7);

// 2. Analyze each session
const analyses = sessions.map(s => analyzeSession(s));
// → { userIntent, workflow, toolsUsed, outcome, entities }

// 3. Extract patterns
const patterns = extractPatterns(analyses);
// → [{ pattern: "help me with ...", similarity: 0.9, sessionIds: [...] }]

// 4. Cluster into potential Skills
const skills = groupIntoSkills(patterns, analyses);
// → [PotentialSkill, ...]
```

### Agent Tools

- `skill_mine`: Scan sessions to discover Skills
- `skill_generate`: Generate SKILL.md
- `skill_preview`: Preview generated Skill
- `skill_list_discovered`: List discovered Skills
- `skill_review`: Approve/reject potential Skill

### CLI Commands

```bash
openclaw skill-miner scan --days 7    # Scan for potential Skills
openclaw skill-miner list             # View discovered Skills
openclaw skill-miner generate <id>    # Generate Skill
```

---

## 🔧 Technical Implementation Details

### Configuration System

All extensions are managed through a unified configuration system:

```json
{
  "plugins": {
    "entries": {
      "memory-bank": {
        "enabled": true,
        "config": {
          "parseRetain": true,
          "trackOpinions": true,
          "autoUpdateEntities": true,
          "reflectInterval": "daily"
        }
      },
      "memory-amem": {
        "enabled": true,
        "config": {
          "writeThreshold": 0.7,
          "minConfidence": 0.5,
          "similarityThreshold": 0.85,
          "retrievalStrategy": "hybrid",
          "diagnosticsEnabled": true,
          "evolutionEnabled": true
        }
      },
      "memory-skill-miner": {
        "enabled": true,
        "config": {
          "minOccurrences": 3,
          "similarityThreshold": 0.8,
          "observationWindow": 7,
          "autoGenerate": false,
          "autoEvolve": true
        }
      }
    }
  }
}
```

### Pluggable Architecture

Each extension is an independent npm package, registered through the OpenClaw plugin SDK:

```typescript
const plugin = {
  id: "memory-bank",
  name: "Memory Bank",
  kind: "memory",
  
  register(api: OpenClawPluginApi) {
    // Register tools
    api.registerTool((ctx) => [...tools]);
    
    // Register CLI commands
    api.registerCli(({ program }) => { ... });
  }
};
```

### Compatibility with Original System

- All extensions are **optionally enabled** and do not affect original functionality
- Original `memory-core` and `memory-lancedb` continue to work
- New extensions can be disabled at any time through configuration

---

## 📊 Expected Effects

Based on AMemGym research data and Workspace Memory v2 design goals:

| Metric | Before Improvement | After Improvement | Improvement |
|--------|-------------------|-------------------|-------------|
| Write Accuracy | To be tested | To be tested | To be tested |
| Read Recall | To be tested | To be tested | To be tested |
| Memory Utilization | To be tested | To be tested | To be tested |
| Repetitive Task Processing | Manual | Automatic Skill | N/A |
| Structuring Degree | None | Complete type system | N/A |
| Observability | None | Three-stage diagnostics | N/A |

---

## 🚀 Usage

### Quick Start

```bash
# 1. Initialize Memory Bank
openclaw memory-bank init

# 2. Scan sessions to discover Skills
openclaw skill-miner scan --days 7

# 3. View memory statistics
openclaw memory-amem stats

# 4. Use in conversation
# Agent will automatically use amem_write, bank_update_entity, and other tools
```

### Using in Conversation

```
User: Please remember that I prefer to receive concise replies on WhatsApp
→ Agent: amem_write({
    content: "User prefers concise replies on WhatsApp",
    type: "preference",
    confidence: 0.95,
    entityRefs: ["User"]
  })

User: /new
→ Agent: bank_update_entity({
    entityId: "User",
    name: "User",
    summary: "...",
    facts: ["Prefers concise replies on WhatsApp"]
  })
```

---

## 📚 References

1. **AMemGym Paper**: [Interactive Memory Benchmarking for Assistants](https://openreview.net/forum?id=sfrVLzsmlf)
2. **Workspace Memory v2**: [OpenClaw Research Notes](https://docs.openclaw.ai/experiments/research/memory)
3. **Anthropic Agent Skills**: [agentskills.io](https://agentskills.io)
4. **Letta/MemGPT**: [Memory-GPT Architecture](https://github.com/cpacker/MemGPT)
5. **Hindsight**: [Retrospective Memory Architecture](https://hindsight.pdf)

---

## 📝 Changed Files List

### New Files

```
extensions/memory-bank/
├── package.json
├── index.ts
├── types.ts
├── parser.ts
└── bank-manager.ts

extensions/memory-amem/
├── package.json
├── index.ts
├── types.ts
└── write-decider.ts

extensions/memory-skill-miner/
├── package.json
├── index.ts
├── types.ts
└── miner.ts

MEMORY_IMPROVEMENTS.md          # This file
```

### Modified Files

```
~/.openclaw/openclaw.json       # Added extension configuration
```

---

## 🤝 Contribution Guide

Welcome to submit Issues and PRs!

### Development Process

```bash
# 1. Clone repository
git clone https://github.com/Kakezh/openclaw-memoryplus.git

# 2. Install dependencies
pnpm install

# 3. Build
pnpm build

# 4. Test
pnpm test
```

### Commit Convention

- `feat:` New feature
- `fix:` Fix
- `docs:` Documentation
- `refactor:` Refactor
- `test:` Test

---

## 📄 License

MIT License - Based on OpenClaw original project

---

**Author**: Kakezh  
**Version**: 2026.2.1  
**Date**: 2026-02-09
