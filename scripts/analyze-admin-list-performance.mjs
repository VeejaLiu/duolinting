// 用法：node scripts/analyze-admin-list-performance.mjs < 后台日志.txt
// 只输出耗时汇总，不回显完整日志、地址、请求参数或个人信息。
import readline from 'node:readline';

const groups = new Map();
let samples = 0;
const add = (path, metric, value) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return;
  const key = `${path} ${metric}`;
  const values = groups.get(key) ?? [];
  values.push(value); groups.set(key, values);
};
const outcomes = { finished: 0, aborted: 0, failed: 0 };
for await (const line of readline.createInterface({ input: process.stdin })) {
  const marker = '[admin-list-perf] ';
  const index = line.indexOf(marker);
  if (index < 0) continue;
  try {
    // 兼容控制台日志的 ANSI 色彩以及 Docker 添加的行前缀。
    const value = JSON.parse(line.slice(index + marker.length).replace(/\u001b\[[0-9;]*m/g, '').trim());
    if (typeof value.path !== 'string' || !value.path.startsWith('/api/v1/admin/')) continue;
    samples++;
    if (value.outcome === 'aborted') { outcomes.aborted++; continue; }
    if (value.status >= 400) { outcomes.failed++; continue; }
    outcomes.finished++;
    add(value.path, 'totalMs', value.totalMs);
    for (const [step, ms] of Object.entries(value.stepsMs ?? {})) add(value.path, `${step}Ms`, ms);
    add(value.path, 'poolWaitingPeak', value.counts?.poolWaitingPeak);
    if (value.clientPrevious) {
      add(value.clientPrevious.path, 'clientFetchMs', value.clientPrevious.fetchMs);
      add(value.clientPrevious.path, 'clientParseMs', value.clientPrevious.parseMs);
    }
  } catch { /* 忽略无关或被截断的日志行。 */ }
}
const percentile = (values, percent) => values[Math.max(0, Math.ceil(values.length * percent) - 1)];
console.log(JSON.stringify({ samples, outcomes }));
for (const [key, values] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
  values.sort((a, b) => a - b);
  console.log(JSON.stringify({ metric: key, n: values.length, p50: percentile(values, 0.5),
    p95: percentile(values, 0.95), max: values.at(-1) }));
}
