# Tasks

- [x] Task 1: 创建基准测试框架
  - [x] SubTask 1.1: 创建 `bench/` 目录结构
  - [x] SubTask 1.2: 创建 `bench/utils.ts` 工具函数（计时、内存测量、报告生成）
  - [x] SubTask 1.3: 创建 `bench/index.ts` 测试入口

- [x] Task 2: 实现存储性能测试
  - [x] SubTask 2.1: 创建 `bench/storage.bench.ts`
  - [x] SubTask 2.2: 实现写入延迟测试（单次/批量）
  - [x] SubTask 2.3: 实现搜索延迟测试（不同数据量）
  - [x] SubTask 2.4: 实现 sql.js vs better-sqlite3 对比测试

- [x] Task 3: 实现层级操作测试
  - [x] SubTask 3.1: 创建 `bench/hierarchy.bench.ts`
  - [x] SubTask 3.2: 实现 remember 操作测试
  - [x] SubTask 3.3: 实现 recall 操作测试
  - [x] SubTask 3.4: 实现层级遍历性能测试

- [x] Task 4: 实现内存开销测试
  - [x] SubTask 4.1: 创建 `bench/memory.bench.ts`
  - [x] SubTask 4.2: 实现单条记忆内存测量
  - [x] SubTask 4.3: 实现批量内存增长测试
  - [x] SubTask 4.4: 实现 GC 压力测试

- [x] Task 5: 实现报告生成
  - [x] SubTask 5.1: 实现控制台格式化输出
  - [x] SubTask 5.2: 实现 JSON 报告生成
  - [x] SubTask 5.3: 添加环境信息收集

- [x] Task 6: 更新项目配置
  - [x] SubTask 6.1: 更新 `package.json` 添加 bench 脚本
  - [x] SubTask 6.2: 添加 benchmark 依赖（如需要）

- [x] Task 7: 更新文档
  - [x] SubTask 7.1: 运行基准测试获取实际数据
  - [x] SubTask 7.2: 更新 README.md 性能部分

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1]
- [Task 4] depends on [Task 1]
- [Task 5] depends on [Task 2, Task 3, Task 4]
- [Task 7] depends on [Task 5, Task 6]