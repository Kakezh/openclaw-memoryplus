# OpenClaw Memory+ 改进文档

> 基于 AMemGym 论文和 Workspace Memory v2 规范的智能记忆系统增强（采用vibe coding辅助快速开发，欢迎大家与我交流、合作，迭代出完成度更高的作品）

## 📋 项目概述

本项目是对 [OpenClaw](https://github.com/openclaw) 记忆系统的改进，通过引入三个可插拔扩展，目的是实现智能记忆管理的范式。

### 原项目记忆系统

OpenClaw 原有的记忆系统（`memory-core` 和 `memory-lancedb`）有一定优化空间：

1. **结构化**: 仅支持简单的 Markdown 分块索引，没有语义类型区分
2. **智能决策**: 对重要信息的区分能力不够
3. **诊断能力**: 对记忆写入/读取/利用的失败原因分析不足
4. **自我进化**: 记忆策略固定，无法根据使用效果自动优化
5. **Skill 与记忆**: Skills 和记忆系统各自独立，无法相互增强
6. **自动发现**: 无法从会话历史中自动发现可复用的模式

---

## 🏗️ 改进架构

```
extensions/
├── memory-core/              # 原有：基础记忆搜索
├── memory-lancedb/           # 原有：LanceDB 向量存储
├── memory-bank/              # 【新增】Workspace Memory v2
├── memory-amem/              # 【新增】AMemGym 智能记忆
└── memory-skill-miner/       # 【新增】Skill 自动发现
```

---

## 📦 扩展 1: memory-bank (Workspace Memory v2)

### 功能特性

#### 1.1 结构化记忆目录

```
~/.openclaw/workspace/
├── memory.md                 # 核心持久事实（已支持）
├── memory/
│   └── YYYY-MM-DD.md        # 每日日志（已支持）
└── bank/                     # 【新增】类型化记忆
    ├── world.md             # 客观世界事实
    ├── experience.md        # Agent 经历
    ├── opinions.md          # 主观意见 + 置信度
    └── entities/
        ├── Peter.md
        ├── The-Castle.md
        └── warelay.md
```

#### 1.2 ## Retain 解析器

支持解析每日日志中的结构化记忆条目：

```markdown
## Retain
- W @Peter: Currently in Marrakech (Nov 27–Dec 1, 2025) for Andy's birthday.
- B @warelay: Fixed the Baileys WS crash by wrapping handlers in try/catch.
- O(c=0.95) @Peter: Prefers concise replies (<1500 chars) on WhatsApp.
```

**类型标记**:
- `W`: World - 客观世界事实
- `B`: Biographical/Experience - Agent 经历
- `O(c=0.x)`: Opinion - 主观意见（带置信度）
- `S`: Summary - 摘要/观察
- `@Entity`: 实体引用

#### 1.3 实体页面管理

自动创建和管理实体页面，聚合相关信息：

```markdown
# Peter

Summary of Peter...

## Facts
- Currently in Marrakech (Nov 27–Dec 1, 2025)
- Prefers concise replies on WhatsApp
```

### 实现文件

| 文件 | 功能 |
|------|------|
| `types.ts` | 类型定义（BankStructure, ParsedMemoryEntry, OpinionEntry） |
| `parser.ts` | ## Retain 解析器，支持类型标记和实体提取 |
| `bank-manager.ts` | Bank 目录管理，实体页面 CRUD |
| `index.ts` | 插件入口，注册工具和 CLI 命令 |

### Agent 工具

- `bank_parse_retain`: 解析 ## Retain 章节
- `bank_update_entity`: 创建/更新实体页面
- `bank_read_entity`: 读取实体页面
- `bank_append`: 追加到 bank 文件
- `bank_stats`: 获取 bank 统计

### CLI 命令

```bash
openclaw memory-bank init          # 初始化 bank 结构
openclaw memory-bank parse <file>  # 解析 ## Retain
openclaw memory-bank stats         # 查看统计
openclaw memory-bank entities      # 列出实体
```

---

## 🧠 扩展 2: memory-amem (AMemGym 智能记忆)

基于 [AMemGym: Interactive Memory Benchmarking for Assistants](https://openreview.net/forum?id=sfrVLzsmlf) 论文实现。

### 核心概念

#### 2.1 AWE 架构 (Agentic Write External)

不同于传统的 RAG（被动检索）或长上下文（Native），AWE 让 Agent **主动决定**何时写入记忆：

```
用户输入 → 重要性评估 → 置信度校准 → 重复检测 → 决策（写入/跳过）
```

#### 2.2 记忆类型系统

```typescript
type AMemEntryType = 
  | "fact"           // 客观事实
  | "preference"     // 用户偏好
  | "goal"          // 用户目标
  | "constraint"    // 约束条件
  | "relationship"  // 关系信息
  | "event";        // 事件记录
```

#### 2.3 失败诊断三环节 (AMemGym)

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

### 实现文件

| 文件 | 功能 |
|------|------|
| `types.ts` | 类型定义（AMemEntry, WriteDecision, MemoryDiagnostics） |
| `write-decider.ts` | 智能写入决策器，支持重要性评估和重复检测 |
| `index.ts` | 插件入口，注册工具和 CLI 命令 |

### 智能写入决策流程

```typescript
// 1. 评估内容重要性
const assessment = await assessContent(content, context);
// → { importance: 0.85, type: "preference", confidence: 0.9, entities: ["Peter"] }

// 2. 检测相似记忆
const similar = findSimilarEntry(content, existingEntries);
// → 如果相似度 > 0.85，返回现有条目

// 3. 决策
if (importance < threshold) → 跳过（低重要性）
if (similar && confidence <= similar.confidence) → 跳过（重复）
else → 写入（新记忆或更新）
```

### Agent 工具

- `amem_write`: 智能写入记忆
- `amem_query`: 语义查询记忆
- `amem_diagnostics`: 获取诊断统计
- `amem_update`: 更新记忆
- `amem_delete`: 删除记忆

### CLI 命令

```bash
openclaw memory-amem stats         # 查看统计
openclaw memory-amem list          # 列出记忆
openclaw memory-amem diagnostics   # 查看诊断
```

---

## ⛏️ 扩展 3: memory-skill-miner (Skill 自动发现)

基于 Anthropic Agent Skills 理念，实现从会话中自动发现 Skills。

### 核心概念

#### 3.1 Skill 挖掘引擎

从会话历史中识别重复任务模式：

```
会话日志 → 意图提取 → 模式匹配 → 聚类分组 → 潜在 Skill
```

#### 3.2 自动 Skill 生成

将识别出的模式转化为标准 SKILL.md：

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

### 实现文件

| 文件 | 功能 |
|------|------|
| `types.ts` | 类型定义（PotentialSkill, GeneratedSkill, SkillEvaluation） |
| `miner.ts` | Skill 挖掘引擎，支持模式匹配和聚类 |
| `index.ts` | 插件入口，注册工具和 CLI 命令 |

### Skill 挖掘流程

```typescript
// 1. 加载近期会话
const sessions = await loadRecentSessions(7);

// 2. 分析每个会话
const analyses = sessions.map(s => analyzeSession(s));
// → { userIntent, workflow, toolsUsed, outcome, entities }

// 3. 提取模式
const patterns = extractPatterns(analyses);
// → [{ pattern: "help me with ...", similarity: 0.9, sessionIds: [...] }]

// 4. 聚类为潜在 Skills
const skills = groupIntoSkills(patterns, analyses);
// → [PotentialSkill, ...]
```

### Agent 工具

- `skill_mine`: 扫描会话发现 Skills
- `skill_generate`: 生成 SKILL.md
- `skill_preview`: 预览生成的 Skill
- `skill_list_discovered`: 列出发现的 Skills
- `skill_review`: 审批/拒绝潜在 Skill

### CLI 命令

```bash
openclaw skill-miner scan --days 7    # 扫描潜在 Skills
openclaw skill-miner list             # 查看发现的 Skills
openclaw skill-miner generate <id>    # 生成 Skill
```

---

## 🔧 技术实现细节

### 配置系统

所有扩展通过统一的配置系统管理：

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

### 可插拔架构

每个扩展都是独立的 npm 包，通过 OpenClaw 插件 SDK 注册：

```typescript
const plugin = {
  id: "memory-bank",
  name: "Memory Bank",
  kind: "memory",
  
  register(api: OpenClawPluginApi) {
    // 注册工具
    api.registerTool((ctx) => [...tools]);
    
    // 注册 CLI 命令
    api.registerCli(({ program }) => { ... });
  }
};
```

### 与原有系统的兼容性

- 所有扩展**可选启用**，不影响原有功能
- 原有 `memory-core` 和 `memory-lancedb` 继续工作
- 新扩展通过配置项控制，可随时禁用

---

## 📊 预期效果

基于 AMemGym 研究数据和 Workspace Memory v2 设计目标：

| 指标 | 改进前 | 改进后 | 提升 |
|------|--------|--------|------|
| 写入准确率 | 待测试 | 待测试 | 待测试 |
| 读取召回率 | 待测试 | 待测试 | 待测试 |
| 记忆利用率 | 待测试 | 待测试 | 待测试 |
| 重复任务处理 | 手动 | 自动 Skill | N/A |
| 结构化程度 | 无 | 完整类型系统 | N/A |
| 可观测性 | 无 | 三环节诊断 | N/A |

---

## 🚀 使用方法

### 快速开始

```bash
# 1. 初始化 Memory Bank
openclaw memory-bank init

# 2. 扫描会话发现 Skills
openclaw skill-miner scan --days 7

# 3. 查看记忆统计
openclaw memory-amem stats

# 4. 在对话中使用
# Agent 会自动使用 amem_write, bank_update_entity 等工具
```

### 在对话中使用

```
User: 请记住我喜欢在 WhatsApp 上接收简洁回复
→ Agent: amem_write({
    content: "User prefers concise replies on WhatsApp",
    type: "preference",
    confidence: 0.95,
    entityRefs: ["User"]
  })

User: /new
→ 智能体：bank_update_entity({
    entityId: "User",
    name: "User",
    summary: "...",
    facts: ["Prefers concise replies on WhatsApp"]
  })
```

---

## 📚 参考资料

1. **AMemGym Paper**: [Interactive Memory Benchmarking for Assistants](https://openreview.net/forum?id=sfrVLzsmlf)
2. **Workspace Memory v2**: [OpenClaw Research Notes](https://docs.openclaw.ai/experiments/research/memory)
3. **Anthropic Agent Skills**: [agentskills.io](https://agentskills.io)
4. **Letta/MemGPT**: [Memory-GPT Architecture](https://github.com/cpacker/MemGPT)
5. **Hindsight**: [Retrospective Memory Architecture](https://hindsight.pdf)

---

## 📝 改动文件清单

### 新增文件

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

MEMORY_IMPROVEMENTS.md          # 本文件
```

### 修改文件

```
~/.openclaw/openclaw.json       # 添加扩展配置
```

---

## 🤝 贡献指南

欢迎提交 Issue 和 PR！

### 开发流程

```bash
# 1. 克隆仓库
git clone https://github.com/Kakezh/openclaw-memoryplus.git

# 2. 安装依赖
pnpm install

# 3. 构建
pnpm build

# 4. 测试
pnpm test
```

### 提交规范

- `feat:` 新功能
- `fix:` 修复
- `docs:` 文档
- `refactor:` 重构
- `test:` 测试

---

## 📄 License

MIT License - 基于 OpenClaw 原项目

---

**作者**: Kakezh  
**版本**: 2026.2.1  
**日期**: 2026-02-09
