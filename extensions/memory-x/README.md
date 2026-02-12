# @kakezh/memory-x

> Framework-agnostic hierarchical memory system for AI agents.

**Works with OpenClaw, LangChain, or standalone.**

## Why Memory-X?

- **Framework-Agnostic**: Use with any agent framework or standalone
- **Hierarchical Storage**: 4-level memory hierarchy (Original → Episode → Semantic → Theme)
- **Zero Config**: Works out of the box, no setup required
- **Cross-Platform**: Pure JavaScript, no native dependencies required
- **Type-Safe**: Full TypeScript support with detailed types

## Installation

```bash
npm install @kakezh/memory-x
```

## Quick Start

### Standalone Usage

```typescript
import { MemoryEngine } from '@kakezh/memory-x';

// Create engine (zero config)
const memory = new MemoryEngine();
await memory.init();

// Store a memory
await memory.remember("User prefers dark mode", {
  type: "preference",
  confidence: 0.9,
  entities: ["User"]
});

// Recall memories
const result = await memory.recall("user preferences");
console.log(result.evidence);

// Get statistics
const stats = memory.stats();
console.log(stats);
```

### Using Tools Interface

```typescript
import { createMemoryX } from '@kakezh/memory-x';

const adapter = await createMemoryX();

// Get all tools
const tools = adapter.getTools();

// Execute a tool
const result = await adapter.execute('memory_remember', {
  content: "User likes TypeScript",
  type: "preference"
});
```

### With OpenClaw

```typescript
import { createOpenClawPlugin } from '@kakezh/memory-x/adapters/openclaw';

export default await createOpenClawPlugin();
```

## API

### MemoryEngine

```typescript
class MemoryEngine {
  constructor(config?: MemoryConfig);
  
  // Core methods
  init(): Promise<void>;
  remember(content: string, options?: RememberOptions): Promise<RememberResult>;
  recall(query: string, options?: RecallOptions): Promise<RecallResult>;
  reflect(): Promise<ReflectResult>;
  stats(): MemoryStats;
  
  // Tool interface
  getTools(): MemoryTool[];
  executeTool(name: string, params: any): Promise<MemoryToolResult>;
  
  // Lifecycle
  close(): void;
}
```

### Configuration

```typescript
interface MemoryConfig {
  workspacePath?: string;      // Default: "./memory-data"
  storage?: "sqlite" | "memory"; // Default: "sqlite"
  hierarchy?: {
    maxThemeSize?: number;     // Default: 50
    minThemeCoherence?: number; // Default: 0.7
    autoReorganize?: boolean;  // Default: true
  };
  retrieval?: {
    themeTopK?: number;        // Default: 3
    semanticTopK?: number;     // Default: 5
    maxTokens?: number;        // Default: 4000
  };
}
```

## Memory Hierarchy

```
Level 4: Theme (主题)
└── High-level concepts: User preferences, projects, domains

Level 3: Semantic (语义)
└── Reusable facts: preferences, goals, constraints

Level 2: Episode (片段)
└── Conversation segments, task context

Level 1: Original (原始)
└── Raw messages: User input, Agent responses
```

## Tools

| Tool | Description |
|------|-------------|
| `memory_remember` | Store memory with auto-classification |
| `memory_recall` | Retrieve memories using semantic search |
| `memory_reflect` | Discover patterns from themes |
| `memory_status` | Get memory system statistics |

## Framework Integration

### OpenClaw

```typescript
import { createOpenClawPlugin } from '@kakezh/memory-x/adapters/openclaw';

export default await createOpenClawPlugin({
  workspacePath: "./data"
});
```

### Generic (Any Framework)

```typescript
import { createGenericAdapter } from '@kakezh/memory-x/adapters/generic';
import { MemoryEngine } from '@kakezh/memory-x';

const engine = new MemoryEngine();
await engine.init();

const adapter = createGenericAdapter(engine);

// Get tools for your framework
const tools = adapter.getTools();

// Execute tools
const result = await adapter.execute('memory_remember', { ... });
```

## License

MIT © Kakezh
