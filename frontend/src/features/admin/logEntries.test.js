import test from "node:test";
import assert from "node:assert/strict";
import { buildLogEntries, filterLogEntries, auditLogEntries } from "./logEntries.js";

const row = (seq, extra = {}) => ({ seq, timestamp: seq, ts: "2026-11-14 12:00:00", message: "过程记录", category: "engines", operation_id: "install-1", level: "INFO", status: "info", ...extra });
test("同一次安装合并过程记录并保留明确的失败结果", () => {
  const entries = buildLogEntries([row(1, { event: "engine.operation", title: "安装引擎", status: "running" }), row(2, { message: "验证文件" }), row(3, { event: "engine.operation", title: "引擎安装失败", status: "failed", level: "ERROR" }), row(4, { message: "安装操作结束" })]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, "引擎安装失败");
  assert.equal(entries[0].status, "failed");
  assert.equal(entries[0].records.length, 4);
});
test("无业务含义的普通诊断记录不占用主列表，异常仍可见", () => {
  const entries = buildLogEntries([row(1, { operation_id: "", category: "system" }), row(2, { operation_id: "", category: "system", level: "ERROR", status: "failed", title: "连接失败" })]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, "连接失败");
});
test("搜索能找到收起的错误详情，范围与时间筛选可组合", () => {
  const entries = buildLogEntries([row(1, { timestamp: 9000, event: "engine.operation", status: "failed", title: "安装失败", message: "SHA256 校验不符" }), row(2, { timestamp: 100, operation_id: "analysis-1", category: "analysis", event: "analysis.completed", status: "success" })]);
  assert.equal(filterLogEntries(entries, { query: "sha256", category: "engines", status: "problems", hours: 1, now: 10000 * 1000 }).length, 1);
  assert.equal(filterLogEntries(entries, { category: "analysis", hours: 1, now: 10000 * 1000 }).length, 0);
});
test("管理审计使用中文业务标题并保留原始动作供排查", () => {
  const entry = auditLogEntries([{ id: 1, ts: "2026-11-14 12:00:00", title: "调整用户 AI 额度", action: "adjust_ai_quota", category: "ai", target: "alice", level: "info" }])[0];
  assert.equal(entry.title, "调整用户 AI 额度");
  assert.match(entry.records[0].message, /adjust_ai_quota/);
  assert.equal(entry.timestamp, Date.parse("2026-11-14T12:00:00Z") / 1000);
});
