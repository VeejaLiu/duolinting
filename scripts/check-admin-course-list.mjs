// 只读本地数据库回归检查：旧/新列表结果、筛选权限、计数兼容性、耗时隔离及缓存失效。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(path.join(root, 'backend'));
const config = dotenv.parse(fs.readFileSync('.env'));
assert.ok(['localhost', '127.0.0.1', '::1'].includes(config.MYSQL_HOST ?? '127.0.0.1'), 'Only a loopback database may be tested');
const require = createRequire(import.meta.url);
const { sequelize } = require('../backend/src/models/db-config-mysql.ts');
const { listAllExercises, listAdminExercisesPage, listCatalog } = require('../backend/src/general/catalog/catalog-service.ts');
const { AdminListPerformance, adminListPerformance, measureAdminListStep, parsePreviousListTiming } = require('../backend/src/lib/admin-list-performance.ts');
const { countTranscriptLines } = require('../backend/src/general/catalog/transcript-line-count.ts');
const cache = require('../admin/src/lib/courseListCache.ts');

const normalized = (item) => ({ ...item, workflow: { ...item.workflow,
  drafts: [...item.workflow.drafts].sort((a, b) => a.adminUserId - b.adminUserId),
} });
let checked = 0;
try {
  const old = await listAllExercises();
  assert.ok(old.length > 0, 'Local database needs courses to exercise parity');
  for (const categoryId of new Set(old.map((item) => item.categoryId))) {
    for (let page = 1; ; page++) {
      const current = await listAdminExercisesPage({ categoryId, page, pageSize: 20 });
      for (const item of current.items) {
        const prior = old.find((row) => row.id === item.id);
        // 当前分页接口原本不返回 localizations_json；仅比较它既有的响应字段。
        const { localizations: _oldLocales, ...expected } = normalized(prior);
        const { localizations: _newLocales, ...actual } = normalized(item);
        assert.ok(isDeepStrictEqual(actual, expected), 'Page summary differs from legacy summary');
        checked++;
      }
      if (page * 20 >= current.total) break;
    }
  }
  for (const status of ['draft', 'proofread', 'published', 'archived']) {
    const current = await listAdminExercisesPage({ status, page: 1, pageSize: 100 });
    assert.equal(current.total, old.filter((item) => item.status === status).length);
    assert.ok(current.items.every((item) => item.status === status));
  }
  const allowed = old.slice(0, 2).map((item) => item.id);
  const assigned = await listAdminExercisesPage({ assignedExerciseIds: allowed, page: 1, pageSize: 20 });
  assert.equal(assigned.total, allowed.length);
  assert.ok(assigned.items.every((item) => allowed.includes(item.id)));
  const emptyTrace = new AdminListPerformance();
  await adminListPerformance.run(emptyTrace, async () => {
    assert.equal((await listAdminExercisesPage({ assignedExerciseIds: [], page: 1, pageSize: 20 })).total, 0);
    assert.equal(emptyTrace.counts.sql, undefined);
  });
  const pageTrace = new AdminListPerformance();
  await adminListPerformance.run(pageTrace, () => listAdminExercisesPage({ page: 1, pageSize: 20 }));
  assert.equal(pageTrace.counts.sql, 5);
  for (const step of ['count', 'page', 'workflow_drafts', 'workflow_assignees', 'workflow_credits', 'assemble']) {
    assert.ok(Number.isFinite(pageTrace.steps[step]), `Missing step ${step}`);
  }
  const catalogTrace = new AdminListPerformance();
  await adminListPerformance.run(catalogTrace, () => listCatalog(true, true));
  assert.equal(catalogTrace.counts.sql, 2);

  // 轻量计数沿用原来的 Number(start/end) 有限性规则，包含异常旧格式。
  const fixtures = [[], [{ start: 0, end: 1 }], [{ start: '0', end: '1' }],
    [{ start: null, end: '' }], [{ start: 'bad', end: 1 }, { start: 0, end: 2 }], [null, 4, {}], null, {}];
  const countLegacy = (value) => Array.isArray(value) ? value.filter((line) => line && typeof line === 'object'
    && Number.isFinite(Number(line.start)) && Number.isFinite(Number(line.end))).length : 0;
  for (const fixture of fixtures) {
    assert.equal(countTranscriptLines(fixture), countLegacy(fixture));
    assert.equal(countTranscriptLines(JSON.stringify(fixture)), countLegacy(fixture));
  }
  assert.equal(countTranscriptLines('invalid-json'), 0);
  const traceA = new AdminListPerformance(); const traceB = new AdminListPerformance();
  await Promise.all([adminListPerformance.run(traceA, () => measureAdminListStep('only_a', async () => 1)),
    adminListPerformance.run(traceB, () => measureAdminListStep('only_b', async () => 2))]);
  assert.equal(traceA.steps.only_b, undefined); assert.equal(traceB.steps.only_a, undefined);
  assert.equal(parsePreviousListTiming('{"path":"/private","requestId":"secret"}'), undefined);
  assert.equal(parsePreviousListTiming(JSON.stringify({ path: '/api/v1/admin/exercises', requestId: 'a'.repeat(36), fetchMs: -1, parseMs: 0 })), undefined);

  // 验证实际请求日志：仅一行性能汇总、关联浏览器耗时、查询词不进入日志。
  const { requestLogger } = require('../backend/src/lib/requestLogger.ts');
  const { Logger } = require('../backend/src/lib/logger/index.ts');
  const messages = [];
  const originalInfo = Logger.prototype.info;
  Logger.prototype.info = (message) => messages.push(message);
  try {
    const response = new EventEmitter();
    const headers = new Map();
    response.locals = {}; response.statusCode = 200; response.writableFinished = false;
    response.setHeader = (key, value) => headers.set(key, value);
    response.getHeader = (key) => headers.get(key);
    const previous = { path: '/api/v1/admin/catalog', requestId: '11111111-1111-4111-8111-111111111111', fetchMs: 10, parseMs: 2 };
    await new Promise((resolve, reject) => {
      requestLogger({ method: 'GET', originalUrl: '/api/v1/admin/exercises?search=private-test-term',
        headers: { 'x-admin-list-timing': JSON.stringify(previous) }, ip: '127.0.0.1' }, response, () => {
        measureAdminListStep('auth', async () => undefined).then(() => {
          response.writableFinished = true; response.emit('finish'); response.emit('close'); resolve();
        }).catch(reject);
      });
    });
    const summaries = messages.filter((message) => message.startsWith('[admin-list-perf] '));
    assert.equal(summaries.length, 1);
    const summary = JSON.parse(summaries[0].slice('[admin-list-perf] '.length));
    assert.deepEqual(summary.clientPrevious, previous);
    assert.ok(Number.isFinite(summary.stepsMs.auth));
    assert.equal(summary.outcome, 'finished');
    assert.ok(messages.every((message) => !message.includes('private-test-term')));
  } finally { Logger.prototype.info = originalInfo; }

  const sample = { items: [], total: 0, page: 1, pageSize: 20 };
  cache.writeCourseListCache('account-a', 'page-1', sample);
  assert.equal(cache.readCourseListCache('account-a', 'page-1'), sample);
  assert.equal(cache.readCourseListCache('account-b', 'page-1'), undefined);
  cache.writeCourseListCache('account-b', 'page-1', sample);
  cache.clearCourseListCache();
  assert.equal(cache.readCourseListCache('account-b', 'page-1'), undefined);
  const realNow = Date.now;
  try {
    Date.now = () => 1000;
    cache.writeCourseListCache('account-b', 'page-1', sample);
    Date.now = () => 62_000;
    assert.equal(cache.readCourseListCache('account-b', 'page-1'), undefined);
  } finally { Date.now = realNow; cache.clearCourseListCache(); }
  console.log(JSON.stringify({ ok: true, coursesCompared: checked, pageQueries: pageTrace.counts.sql,
    catalogQueries: catalogTrace.counts.sql, pageStepsMs: pageTrace.steps }));
} catch (error) {
  // 失败时不打印实际课程内容、SQL 参数或连接配置。
  console.error(`Course-list regression failed: ${error instanceof assert.AssertionError ? error.message : error.name}`);
  process.exitCode = 1;
} finally { await sequelize.close(); }
