---
name: memory-core
description: Core memory management skill for OAMC (OpenClaw Adaptive Memory Core).
metadata:
  openclaw:
    emoji: 🧠
    requires:
      plugins: ["memory-x"]
---

# Memory Core Skill

This skill provides the fundamental tools for the OpenClaw Adaptive Memory Core (OAMC).
It allows the agent to retain experiences, recall context, reflect on patterns, and self-evolve.

## 🛠️ Tools

### 1. `memory_remember`
**Purpose**: Store a new memory or experience.
- **When to use**: When the user tells you a fact, preference, or goal.
- **Effect**: Writes to the daily log (`memory/YYYY-MM-DD.md`) and updates the search index.

### 2. `memory_recall`
**Purpose**: Retrieve relevant context.
- **When to use**: Before answering a question that relies on past interactions or user preferences.
- **Effect**: Searches themes, semantics, and episodes to provide dense context.

### 3. `memory_reflect`
**Purpose**: Mine patterns and suggest evolution.
- **When to use**: Periodically, or when you notice you are repeating mistakes.
- **Effect**: Scans recent history for high-frequency patterns and suggests new rules.

### 4. `memory_evolve`
**Purpose**: Update your own operating rules.
- **When to use**: When `memory_reflect` provides a valid suggestion to update `META.md`.
- **Effect**: Writes a new Rule or SOP to `memory/META.md`, permanently changing your behavior.

## 🔄 Workflow

1.  **Ingest**: Use `memory_remember` to log important turns.
2.  **Retrieve**: Use `memory_recall` to ground your responses.
3.  **Reflect**: Use `memory_reflect` to identify patterns.
4.  **Evolve**: Use `memory_evolve` to write new rules based on reflection.

## 🤖 Automatic Evolution

This skill includes a background process that:
1.  Runs `memory_reflect` periodically (default: every 60 mins).
2.  If high-confidence patterns are found (e.g., repeated corrections), it automatically suggests or applies updates to `META.md`.
3.  This ensures the agent evolves even without explicit user prompts to "reflect".
