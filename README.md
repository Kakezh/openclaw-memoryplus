# OpenClaw Memory-X

> Unified hierarchical memory system based on xMemory and Memory Taxonomy.
> "The unified memory layer for autonomous agents."

## 📋 Project Overview

This project is a **refactored** memory system for [OpenClaw](https://github.com/openclaw), consolidating three separate extensions into a single unified `memory-x` extension.

It implements the **Workspace Memory v2** architecture, combining a **Canonical Store** (human-readable Markdown) with a **Derived Store** (machine-readable index).

### Why Refactor?

The original system relied on scattered extensions (`memory-bank`, `memory-amem`, `memory-skill-miner`). Memory-X unifies them into a cohesive system based on:

- **xMemory**: Four-level hierarchical memory structure (Original → Episode → Semantic → Theme).
- **Memory Taxonomy**: 3D classification (Form × Function × Dynamics).
- **Workspace Memory v2**: Offline-first, git-friendly persistence.

---

## 📦 Installation & Setup

### 1. Install Plugin
The Memory-X system is packaged as a standard OpenClaw plugin containing the `memory-core` skill.

```bash
# Build and pack the extension
cd extensions/memory-x
pnpm install && pnpm build
pnpm pack

# Install into OpenClaw (adjust version as needed)
openclaw plugins install ./openclaw-memory-x-2026.2.2.tgz
```

### 2. Enable Skill
After installation, enable the skill in your `AGENTS.md` or via CLI:

```bash
# Verify installation
openclaw skills list | grep memory-core
```

### 3. Verify
Check if the memory system is active:
```bash
openclaw agent run "memory_status({})"
```

---

## 🏗️ Architecture: OpenClaw Adaptive Memory Core (OAMC)

This system implements a "Dual-Stream" architecture fused with a "Self-Evolution" loop.

### Directory Structure

```
extensions/
└── memory-x/
    ├── package.json
    ├── types.ts              # Type definitions (xMemory, Taxonomy)
    └── index.ts              # Unified plugin entry
```

### 🧠 Core Concepts

#### 1. Four-Level Hierarchy (xMemory)

| Level | Description | Persistence Location |
|-------|-------------|----------------------|
| **Original** | Raw messages, daily logs | `memory/YYYY-MM-DD.md` |
| **Episode** | Contiguous message blocks | `.memory/episodes/` (JSON) |
| **Semantic** | Reusable facts | `.memory/semantics/` (JSON) |
| **Theme** | High-level concepts | `.memory/themes/` |

#### 2. Workspace Persistence Layout (Dual-Stream)

**Stream A: Canonical Store (Human Audit & Evolution)**
*Location: `~/.openclaw/workspace/`*

```text
workspace/
├── MEMORY.md                 # [Legacy] Root profile
├── memory/
│   ├── YYYY-MM-DD.md         # [Log] Narrative Stream
│   └── META.md               # [Evolution] Self-generated Rules & SOPs
```

**Stream B: Derived Store (Machine Index)**
*Location: `~/.openclaw/workspace/.memory/`*

```text
.memory/
├── index.json                # Fast lookup
├── episodes/                 # Context chunks
├── semantics/                # Facts
└── themes/                   # Clusters
```

#### 3. Self-Evolution Loop (AMemGym Style)

1.  **Reflect**: `memory_reflect` identifies high-frequency patterns in Themes.
2.  **Suggest**: System proposes a new Rule or SOP.
3.  **Evolve**: `memory_evolve` writes the rule to `META.md`.
4.  **Adapt**: Agent loads `META.md` into System Prompt on next run.

---

## 🛠️ Unified Tool API

| Tool | Description | Usage |
|------|-------------|-------|
| `memory_remember` | Store memory. | `memory_remember({ content: "..." })` |
| `memory_recall` | Retrieve context. | `memory_recall({ query: "..." })` |
| `memory_reflect` | Mine patterns & suggest evolution. | `memory_reflect({ focus: "evolution" })` |
| `memory_evolve` | **Update META.md rules.** | `memory_evolve({ action: "add_rule", ... })` |
| `memory_introspect` | System diagnostics. | `memory_introspect({})` |
| `memory_consolidate` | Merge/Split themes. | `memory_consolidate({...})` |
| `memory_status` | View stats. | `memory_status({})` |

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
            "autoReorganize": true
          },
          "retrieval": {
            "themeTopK": 3,
            "semanticTopK": 5
          }
        }
      }
    }
  }
}
```

---

## 📚 References

1. **xMemory**: [Beyond RAG for Agent Memory](https://arxiv.org/html/2602.02007v1)
2. **Memory Taxonomy**: [Memory in the Age of AI Agents](https://arxiv.org/abs/2512.13564)
3. **Workspace Memory v2**: [OpenClaw Research](https://docs.openclaw.ai/experiments/research/memory)

---

**Author**: Kakezh
**Version**: 2026.2.3
**Date**: 2026-02-10
