# OpenClaw Memory System Architecture

> Technical Documentation for Memory Mechanisms

## 1. System Overview

OpenClaw implements a **multi-layered memory architecture**:

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenClaw Memory System                       │
├─────────────────────────────────────────────────────────────────┤
│  memory-core (Base Layer)                                        │
│  ├── memory_search: Semantic search over MEMORY.md + logs       │
│  └── memory_get: Safe snippet read with line ranges             │
├─────────────────────────────────────────────────────────────────┤
│  memory-x (Extended Layer)                                       │
│  ├── Four-Level Hierarchy: Original → Episode → Semantic → Theme│
│  ├── 3D Taxonomy: Form × Function × Dynamics                    │
│  └── Self-Evolution: Auto-reflection + META.md updates          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Memory System (`memory-core`)

### 2.1 Tools

| Tool | Description |
|------|-------------|
| `memory_search` | Semantic search over MEMORY.md and memory/*.md |
| `memory_get` | Safe snippet read with line ranges |

### 2.2 Implementation

**File**: `extensions/memory-core/index.ts` → `src/agents/tools/memory-tool.ts`

```typescript
// memory_search parameters
{
  query: string,
  maxResults?: number,
  minScore?: number
}

// memory_get parameters
{
  path: string,
  from?: number,
  lines?: number
}
```

---

## 3. Extended Memory System (`memory-x`)

### 3.1 Four-Level Hierarchy

| Level | Name | Description | Storage |
|-------|------|-------------|---------|
| 1 | Original | Raw messages with timestamps | `memory/YYYY-MM-DD.md` |
| 2 | Episode | Contiguous message blocks | `.memory/episodes/{id}.json` |
| 3 | Semantic | Reusable facts | `.memory/semantics/{id}.json` |
| 4 | Theme | High-level concepts | `.memory/themes/{id}.json` |

### 3.2 3D Taxonomy

```
Form × Function × Dynamics

Form: token | parametric | latent
Function: factual | experiential | working
Dynamics: forgetting, consolidation, conflict resolution
```

### 3.3 Tools

| Tool | Description |
|------|-------------|
| `memory_remember` | Store memory with auto-classification |
| `memory_recall` | Top-down hierarchy retrieval |
| `memory_reflect` | Discover patterns from themes |
| `memory_introspect` | System diagnostics |
| `memory_consolidate` | Merge/split themes |
| `memory_status` | Statistics and metrics |
| `memory_evolve` | Self-modify via META.md |

### 3.4 Self-Evolution

```typescript
// Auto-reflection configuration
autoReflection: {
  enabled: true,
  intervalMinutes: 60
}

// Flow:
// 1. Scan themes for high-frequency patterns
// 2. Generate evolution suggestions
// 3. Auto-apply rules to META.md
```

---

## 4. Storage Architecture

```
~/.openclaw/workspace/
├── memory/                    # Canonical daily logs
│   ├── 2026-02-09.md
│   └── META.md               # Self-evolution rules
│
└── .memory/                   # Derived store
    ├── episodes/
    ├── semantics/
    └── themes/
```

---

## 5. Configuration

```json
{
  "memory-x": {
    "hierarchy": {
      "maxThemeSize": 50,
      "minThemeCoherence": 0.7
    },
    "retrieval": {
      "themeTopK": 3,
      "semanticTopK": 5,
      "maxTokens": 4000
    },
    "skills": {
      "minThemeFrequency": 3
    },
    "autoReflection": {
      "enabled": true,
      "intervalMinutes": 60
    }
  }
}
```

---

## 6. Performance

| Metric | Value |
|--------|-------|
| Token Efficiency | -30% |
| QA Accuracy | +10% |
| Evidence Density | 2× |

---

## 7. References

1. xMemory: https://arxiv.org/html/2602.02007v1
2. Memory Taxonomy: https://arxiv.org/abs/2512.13564
3. AMemGym: https://openreview.net/forum?id=sfrVLzsmlf

---

**Version**: 2026.2.2
