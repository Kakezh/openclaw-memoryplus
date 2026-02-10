# OpenClaw Memory-X

> Unified hierarchical memory system based on xMemory and Memory Taxonomy (Welcome to communicate and collaborate!)

## 📋 Project Overview

This project is a **refactored** memory system for [OpenClaw](https://github.com/openclaw), consolidating three separate extensions into a single unified `memory-x` extension based on cutting-edge research.

### Why Refactor?

The original three extensions (`memory-bank`, `memory-amem`, `memory-skill-miner`) had overlapping functionality and inconsistent APIs. This refactor unifies them into a cohesive system based on:

- **xMemory**: Four-level hierarchical memory structure
- **Memory Taxonomy**: 3D classification (Form × Function × Dynamics)

---

## 🏗️ Architecture

```
extensions/
├── memory-core/              # Original: Basic memory search
├── memory-lancedb/           # Original: LanceDB vector storage
└── memory-x/                 # [Unified] Hierarchical memory system
    ├── package.json
    ├── types.ts              # Type definitions
    └── index.ts              # Plugin entry with 6 unified tools
```

### Removed Extensions

- ❌ `memory-bank/` → Merged into memory-x hierarchy
- ❌ `memory-amem/` → Merged into memory-x taxonomy
- ❌ `memory-skill-miner/` → Integrated into memory-x reflection

---

## 🧠 Core Concepts

### 1. Four-Level Hierarchy (xMemory)

```
Original → Episode → Semantic → Theme
```

| Level | Description | Example |
|-------|-------------|---------|
| **Original** | Raw messages with timestamps | "I prefer coffee" |
| **Episode** | Contiguous message blocks | Meeting discussion |
| **Semantic** | Reusable facts | User prefers coffee |
| **Theme** | High-level concepts | User preferences |

### 2. 3D Taxonomy (Memory Taxonomy)

```
Form × Function × Dynamics
```

**Form**: Where memory exists
- `token`: Text tokens in context
- `parametric`: Model weights
- `latent`: Hidden states

**Function**: What memory is used for
- `factual`: World knowledge (Paris is capital of France)
- `experiential`: Personal history (User likes coffee)
- `working`: Temporary buffer

**Dynamics**: How memory evolves
- Forgetting curve
- Memory consolidation
- Conflict resolution

### 3. Sparsity-Semantics Objective

Automatic theme management:
- **Split**: When theme grows too large (>50 items)
- **Merge**: When themes are too similar
- **44.9%** of nodes dynamically reallocated

### 4. Top-Down Retrieval

```
Stage 1: Select themes (submodular greedy)
    ↓
Stage 2: Select semantics
    ↓
Stage 3: Expand episodes (uncertainty gating)
```

**Results**:
- Token usage: **-30%**
- QA accuracy: **+10%**
- Evidence density: **2×**

---

## 🛠️ Unified Tool API (6 Tools)

| Tool | Description | Replaces |
|------|-------------|----------|
| `memory_remember` | Store memory with auto-classification | bank_parse_retain, amem_write |
| `memory_recall` | Top-down hierarchy retrieval | amem_query, bank_read_entity |
| `memory_reflect` | Discover patterns from themes | skill_mine |
| `memory_introspect` | System diagnostics | amem_diagnostics |
| `memory_consolidate` | Merge/split themes, resolve conflicts | amem_update, amem_delete |
| `memory_status` | Statistics and metrics | bank_stats |

### Tool Examples

```typescript
// Remember
memory_remember({
  content: "User prefers concise replies on WhatsApp",
  type: "preference",
  confidence: 0.95,
  entities: ["User"]
})

// Recall
memory_recall({
  query: "What does the user prefer?",
  maxTokens: 4000
})

// Reflect (discover skills)
memory_reflect({})
// → Discovers themes with >3 occurrences
```

---

## ⚙️ Configuration

```json
{
  "plugins": {
    "entries": {
      "memory-x": {
        "enabled": true,
        "config": {
          "hierarchy": {
            "maxThemeSize": 50,
            "minThemeCoherence": 0.7,
            "autoReorganize": true
          },
          "retrieval": {
            "themeTopK": 3,
            "semanticTopK": 5,
            "uncertaintyThreshold": 0.3,
            "maxTokens": 4000
          },
          "taxonomy": {
            "separateFactualExperiential": true
          },
          "skills": {
            "autoMineFromThemes": true,
            "minThemeFrequency": 3
          }
        }
      }
    }
  }
}
```

---

## 🚀 Usage

### CLI Commands

```bash
# View statistics
openclaw memory-x status

# List themes
openclaw memory-x themes

# Discover patterns
openclaw memory-x reflect
```

### In Conversation

```
User: Please remember I prefer dark mode
→ Agent: memory_remember({
    content: "User prefers dark mode",
    type: "preference",
    confidence: 0.9,
    entities: ["User"]
  })

User: What are my preferences?
→ Agent: memory_recall({ query: "user preferences" })
```

---

## 📊 Expected Performance

Based on xMemory and Taxonomy research:

| Metric | Improvement |
|--------|-------------|
| Token Efficiency | -30% |
| QA Accuracy | +10% |
| Evidence Density | 2× |
| Retrieval Redundancy | Significantly reduced |
| Fact/Experience Separation | Complete |

---

## 📚 References

1. **xMemory**: [Beyond RAG for Agent Memory](https://arxiv.org/html/2602.02007v1)
2. **Memory Taxonomy**: [Memory in the Age of AI Agents](https://arxiv.org/abs/2512.13564)
3. **AMemGym**: [Interactive Memory Benchmarking](https://openreview.net/forum?id=sfrVLzsmlf)
4. **Workspace Memory v2**: [OpenClaw Research](https://docs.openclaw.ai/experiments/research/memory)

---

## 📝 Changes from Previous Version

### Before (3 Extensions)
```
extensions/
├── memory-bank/         # 4 files
├── memory-amem/         # 4 files
└── memory-skill-miner/  # 4 files

Tools: 15+ (scattered)
```

### After (1 Unified Extension)
```
extensions/
└── memory-x/            # 3 files

Tools: 6 (unified API)
```

**Benefits**:
- ✅ Consistent API
- ✅ Reduced complexity
- ✅ Better type safety
- ✅ Easier maintenance

---

## 🤝 Contributing

```bash
# Clone
git clone https://github.com/Kakezh/openclaw-memoryplus.git

# Install
pnpm install

# Build
pnpm build

# Test
pnpm test
```

---

## 📄 License

MIT License - Based on OpenClaw original project

---

**Author**: Kakezh  
**Version**: 2026.2.2  
**Date**: 2026-02-09
