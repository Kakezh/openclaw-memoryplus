# Checklist

## 基础框架
- [x] `bench/` 目录已创建
- [x] `bench/utils.ts` 包含计时、内存测量、报告生成工具函数
- [x] `bench/index.ts` 作为测试入口可正常运行

## 存储性能测试
- [x] `bench/storage.bench.ts` 已创建
- [x] 写入延迟测试输出单次/批量写入时间
- [x] 搜索延迟测试输出不同数据量下的搜索时间
- [x] 存储后端对比测试输出 sql.js vs better-sqlite3 性能对比

## 层级操作测试
- [x] `bench/hierarchy.bench.ts` 已创建
- [x] remember 操作测试输出完整层级处理时间
- [x] recall 操作测试输出检索时间
- [x] 层级遍历测试输出各层级处理时间分布

## 内存开销测试
- [x] `bench/memory.bench.ts` 已创建
- [x] 单条记忆内存测量输出准确的内存占用
- [x] 批量内存测试输出内存增长曲线数据
- [x] GC 压力测试输出 GC 相关指标

## 报告生成
- [x] 控制台输出格式化的测试报告
- [x] `bench/results.json` 包含完整测试数据
- [x] 报告包含环境信息（Node 版本、平台、时间戳）

## 项目配置
- [x] `package.json` 包含 `bench` 脚本
- [x] `pnpm bench` 命令可正常运行

## 文档更新
- [x] README.md 性能部分包含实际测试数据
- [x] 性能数据标注为"实测数据"并注明测试环境