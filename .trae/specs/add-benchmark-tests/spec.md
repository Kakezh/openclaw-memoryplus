# 性能基准测试 Spec

## Why

当前 README 中的性能数据来自 xMemory 论文的理论值，缺乏实际测试验证。需要创建性能基准测试脚本来获取 Memory-X 系统的实际性能数据，包括存储延迟、搜索延迟、内存开销等关键指标。

## What Changes

* 添加 `bench/` 目录存放基准测试脚本

* 创建 `bench/memory.bench.ts` 核心性能测试

* 创建 `bench/storage.bench.ts` 存储后端对比测试

* 创建 `bench/hierarchy.bench.ts` 层级操作测试

* 更新 `package.json` 添加 bench 脚本命令

* 更新 README.md 使用实际测试数据

## Impact

* Affected specs: 无

* Affected code:

  * `extensions/memory-x/bench/` (新增)

  * `extensions/memory-x/package.json` (修改)

  * `README.md` (修改)

## ADDED Requirements

### Requirement: 性能基准测试框架

系统 SHALL 提供完整的性能基准测试框架，用于测量 Memory-X 的关键性能指标。

#### Scenario: 运行基准测试

* **WHEN** 用户执行 `pnpm bench`

* **THEN** 系统运行所有基准测试并输出详细报告

### Requirement: 存储性能测试

系统 SHALL 测量存储操作的性能指标。

#### Scenario: 写入性能测试

* **WHEN** 执行写入基准测试

* **THEN** 系统测量并报告：

  * 单次写入延迟 (ms)

  * 批量写入吞吐量

  * 不同存储后端的性能对比

#### Scenario: 搜索性能测试

* **WHEN** 执行搜索基准测试

* **THEN** 系统测量并报告：

  * 关键词搜索延迟

  * 不同数据量的搜索性能曲线

  * P50/P95/P99 延迟百分位

### Requirement: 层级操作测试

系统 SHALL 测量四级层级操作的性能。

#### Scenario: 层级遍历测试

* **WHEN** 执行层级遍历测试

* **THEN** 系统测量并报告：

  * Original → Episode → Semantic → Theme 的处理时间

  * 层级深度对性能的影响

### Requirement: 内存开销测试

系统 SHALL 测量内存使用情况。

#### Scenario: 内存占用测试

* **WHEN** 执行内存基准测试

* **THEN** 系统测量并报告：

  * 单条记忆的内存开销

  * 不同数据量的内存增长曲线

  * GC 压力测试结果

### Requirement: 报告生成

系统 SHALL 生成人类可读的测试报告。

#### Scenario: 控制台报告

* **WHEN** 测试完成

* **THEN** 系统输出格式化的控制台报告，包含：

  * 各项指标的数值

  * 与基线的对比（如有）

  * 性能等级评估

#### Scenario: JSON 报告

* **WHEN** 测试完成

* **THEN** 系统生成 `bench/results.json` 文件，包含：

  * 完整的测试数据

  * 环境信息（Node 版本、平台等）

  * 时间戳

