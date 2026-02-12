# Integration Guide

This guide explains how to integrate Memory-X with different agent frameworks.

## Table of Contents

1. [Standalone Usage](#standalone-usage)
2. [OpenClaw Integration](#openclaw-integration)
3. [LangChain Integration](#langchain-integration)
4. [Custom Integration](#custom-integration)

---

## Standalone Usage

Memory-X can be used without any agent framework.

### Basic Setup

```typescript
import { MemoryEngine } from '@kakezh/memory-x';

const memory = new MemoryEngine({
  workspacePath: './my-memory-data'
});

await memory.init();
```

### Using Core API

```typescript
// Remember
const result = await memory.remember("User prefers dark mode", {
  type: "preference",
  confidence: 0.9,
  entities: ["User"]
});

console.log(result.ids);
// { original: "orig-...", episode: "ep-...", semantic: "sem-...", theme: "theme-..." }

// Recall
const recalled = await memory.recall("what does user prefer?");
console.log(recalled.evidence);

// Reflect
const patterns = await memory.reflect();
console.log(patterns);

// Stats
const stats = memory.stats();
console.log(stats);
```

### Using Tool Interface

```typescript
const tools = memory.getTools();

for (const tool of tools) {
  console.log(tool.name, tool.description);
}

// Execute specific tool
const result = await memory.executeTool('memory_remember', {
  content: "User likes TypeScript",
  type: "preference"
});
```

---

## OpenClaw Integration

### Installation

```bash
npm install @kakezh/memory-x
```

### Plugin Setup

Create a plugin file:

```typescript
// memory-x-plugin.ts
import { createOpenClawPlugin } from '@kakezh/memory-x/adapters/openclaw';

export default await createOpenClawPlugin({
  workspacePath: './workspace'
});
```

### Register in OpenClaw Config

```json
{
  "plugins": {
    "entries": {
      "memory-x": {
        "enabled": true,
        "path": "./memory-x-plugin.ts"
      }
    }
  }
}
```

### Using in Agent

```typescript
// The tools are automatically registered
// Use them in your agent:

const response = await agent.run(`
  Use memory_remember to store: "User prefers concise responses"
  Then use memory_recall to find user preferences
`);
```

---

## LangChain Integration

### Installation

```bash
npm install @kakezh/memory-x @langchain/core
```

### Create LangChain Tools

```typescript
import { MemoryEngine } from '@kakezh/memory-x';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

const memory = new MemoryEngine();
await memory.init();

// Convert Memory-X tools to LangChain format
function toLangChainTool(tool: any) {
  return new DynamicStructuredTool({
    name: tool.name,
    description: tool.description,
    schema: z.object({
      content: z.string().optional(),
      query: z.string().optional(),
      type: z.enum(['fact', 'preference', 'goal', 'constraint', 'event']).optional()
    }),
    func: async (input) => {
      const result = await tool.execute(input);
      return JSON.stringify(result.data);
    }
  });
}

const langChainTools = memory.getTools().map(toLangChainTool);
```

### Use with LangChain Agent

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { createOpenAIFunctionsAgent } from 'langchain/agents';

const llm = new ChatOpenAI({ modelName: 'gpt-4' });

const agent = await createOpenAIFunctionsAgent({
  llm,
  tools: langChainTools,
  prompt: 'You are a helpful assistant with memory capabilities.'
});
```

---

## Custom Integration

### Creating a Custom Adapter

```typescript
import { MemoryEngine, MemoryTool } from '@kakezh/memory-x';

interface MyFrameworkTool {
  name: string;
  description: string;
  handler: (params: any) => Promise<any>;
}

function createMyFrameworkAdapter(engine: MemoryEngine) {
  return {
    getTools(): MyFrameworkTool[] {
      const tools = engine.getTools();
      
      return tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        handler: async (params) => {
          const result = await tool.execute(params);
          return result.data;
        }
      }));
    }
  };
}

// Usage
const memory = new MemoryEngine();
await memory.init();

const adapter = createMyFrameworkAdapter(memory);
const myTools = adapter.getTools();
```

### Event Handling

```typescript
memory.on('memory:created', (event) => {
  console.log('New memory created:', event.payload);
});

memory.on('memory:conflict', (event) => {
  console.log('Conflict detected:', event.payload);
});
```

### Custom Embedding Provider

```typescript
import { IEmbeddingProvider } from '@kakezh/memory-x';

class MyEmbeddingProvider implements IEmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    // Your embedding logic
    return [/* vector */];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }
}

memory.setEmbeddingProvider(new MyEmbeddingProvider());
```

---

## Best Practices

### 1. Memory Types

Use appropriate types for different content:

```typescript
await memory.remember("Paris is the capital of France", { type: "fact" });
await memory.remember("User prefers dark mode", { type: "preference" });
await memory.remember("Complete the project by Friday", { type: "goal" });
await memory.remember("API rate limit is 1000/hour", { type: "constraint" });
await memory.remember("Meeting scheduled for 3pm", { type: "event" });
```

### 2. Entity Extraction

Provide entities for better organization:

```typescript
await memory.remember("John works at Acme Corp", {
  type: "fact",
  entities: ["John", "Acme Corp"]
});
```

### 3. Confidence Scores

Set confidence for uncertain information:

```typescript
await memory.remember("User might be interested in Python", {
  type: "preference",
  confidence: 0.6
});
```

### 4. Lifecycle Management

Always close the engine when done:

```typescript
process.on('SIGTERM', () => {
  memory.close();
});
```

---

## Troubleshooting

### sql.js Loading Issues

If sql.js fails to load, provide the WASM file location:

```typescript
import { MemoryEngine } from '@kakezh/memory-x';

const memory = new MemoryEngine({
  workspacePath: './data'
});
// sql.js will auto-load from CDN
```

### Memory Leaks

If you notice memory leaks, ensure you're closing the engine:

```typescript
// Bad: Engine never closed
const memory = new MemoryEngine();
await memory.init();

// Good: Close when done
const memory = new MemoryEngine();
await memory.init();
try {
  // ... use memory
} finally {
  memory.close();
}
```
