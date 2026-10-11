import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { parseImportRequest, parseSrt, sourceIdentity } from '../backend/src/general/content-imports/contracts.ts'

const base = { categoryId: 1, sortOrder: 0, title: 'Listening example', mediaType: 'video', language: 'en', difficulty: 'beginner', sourceUrl: 'https://www.youtube.com/watch?v=abcdefghijk', durationSeconds: 2, files: [{ role: 'media', fileName: 'lesson.mp4', contentType: 'video/mp4', sizeBytes: 100 }, { role: 'subtitle', fileName: 'lesson.srt', contentType: 'application/x-subrip', sizeBytes: 100 }] }
const fails = (callback, code) => assert.throws(callback, error => error.code === code)
assert.equal(sourceIdentity('https://youtu.be/abcdefghijk?t=1').identity, sourceIdentity(base.sourceUrl).identity)
assert.equal(sourceIdentity('https://youtube.com/shorts/abcdefghijk').identity, sourceIdentity(base.sourceUrl).identity)
for (const field of ['status', 'id', 'exerciseId', 'publish', 'audioUrl']) fails(() => parseImportRequest({ ...base, [field]: 'published' }), 'UNKNOWN_FIELD')
fails(() => parseImportRequest({ ...base, language: 'th' }), 'UNSUPPORTED_LANGUAGE')
fails(() => parseImportRequest({ ...base, sourceUrl: 'file:///tmp/media' }), 'INVALID_SOURCE')
fails(() => parseImportRequest({ ...base, files: [base.files[0], base.files[0]] }), 'INVALID_REQUEST')
fails(() => parseImportRequest({ ...base, files: [{ ...base.files[0], objectName: 'arbitrary' }, base.files[1]] }), 'UNKNOWN_FIELD')
fails(() => parseImportRequest({ ...base, source: { provider: 'youtube', externalId: 'wrong' } }), 'SOURCE_MISMATCH')
assert.equal(parseImportRequest(base).source.provider, 'youtube')
const srt = Buffer.from('1\r\n00:00:00,000 --> 00:00:01,500\r\nHello world.\r\n')
assert.equal(parseSrt(srt, 2).lines[0].end, 1.5)
fails(() => parseSrt(srt, 1), 'SUBTITLE_TIMELINE_ERROR')
fails(() => parseSrt(Buffer.from('1\n00:00:02,000 --> 00:00:01,000\nBackwards'), 3), 'SUBTITLE_TIMELINE_ERROR')
fails(() => parseSrt(Buffer.from([0xff, 0xfe]), 2), 'SUBTITLE_ENCODING')
fails(() => parseSrt(Buffer.from(''), 2), 'EMPTY_SUBTITLE')
console.log('Content import contract and subtitle checks passed')

if (process.argv.includes('--integration')) {
  const dotenv = await import('dotenv')
  const mysql = await import('mysql2/promise')
  const configuration = dotenv.parse(await readFile(new URL('../backend/.env', import.meta.url)))
  const local = new Set(['127.0.0.1', 'localhost', '::1'])
  const databaseHost = configuration.MYSQL_HOST || '127.0.0.1'
  const storageHost = configuration.MEDIA_STORAGE_ENDPOINT || configuration.MINIO_ENDPOINT || 'localhost'
  assert.ok(local.has(databaseHost) && local.has(storageHost), 'Integration checks require loopback database and object storage')
  const originalDatabase = configuration.MYSQL_DATABASE || 'duolinting_app_dev'
  assert.match(originalDatabase, /^[A-Za-z0-9_]+$/)
  const suffix = randomUUID().replaceAll('-', '')
  const database = `dlt_import_check_${suffix}`
  const bucket = `dlt-import-check-${suffix}`
  const connection = await mysql.createConnection({ host: databaseHost, port: Number(configuration.MYSQL_PORT || 3306), user: configuration.MYSQL_USERNAME || configuration.MYSQL_USER || 'root', password: configuration.MYSQL_PASSWORD || '', multipleStatements: true })
  let server, sequelize, storage
  const directory = await mkdtemp(path.join(tmpdir(), 'dlt-import-check-'))
  try {
    await connection.query(`create database \`${database}\``)
    for (const table of ['category_groups', 'categories', 'exercises', 'admin_users']) await connection.query(`create table \`${database}\`.\`${table}\` like \`${originalDatabase}\`.\`${table}\``)
    await connection.query(`use \`${database}\``)
    await connection.query(await readFile(new URL('../infra/mysql/migrations/V202610110001__draft_content_imports.sql', import.meta.url), 'utf8'))
    await connection.query(await readFile(new URL('../infra/mysql/migrations/V202610110002__content_import_all_series.sql', import.meta.url), 'utf8'))
    Object.assign(process.env, configuration, { MYSQL_DATABASE: database, MYSQL_LOGGING: 'false', MEDIA_STORAGE_PROVIDER: 'minio', MEDIA_STORAGE_BUCKET: bucket, MINIO_BUCKET: bucket, MEDIA_PUBLIC_BASE_URL: '', NODE_ENV: 'development' })
    const express = (await import('express')).default
    const routes = (await import('../backend/src/router/v1/index.ts')).default
    const db = await import('../backend/src/models/db-config-mysql.ts')
    sequelize = db.sequelize
    const { issueToken } = await import('../backend/src/general/content-imports/tokens.ts')
    const { processImport, cleanupImports } = await import('../backend/src/general/content-imports/service.ts')
    const { ContentImport } = await import('../backend/src/general/content-imports/models.ts')
    const { env } = await import('../backend/src/env.ts')
    const { Client } = await import('minio')
    storage = new Client({ endPoint: env.media.storage.endpoint, port: env.media.storage.port, useSSL: env.media.storage.useSSL, accessKey: env.media.storage.accessKey, secretKey: env.media.storage.secretKey, region: env.media.storage.region })
    await connection.query("insert into category_groups (name, description, accent, sort_order) values ('Check', '', '#1cb0f6', 0)")
    await connection.query("insert into categories (group_id, name, description, accent, sort_order) values (1, 'Check', '', '#1cb0f6', 0), (1, 'Other', '', '#1cb0f6', 1)")
    const issued = await issueToken({ name: 'isolated check', categoryIds: [1] }, 1)
    const actor = { id: issued.token.id, allCategories: false, categoryIds: [1] }
    assert.equal(issued.token.allCategories, false)
    await assert.rejects(() => issueToken({ name: 'explicit limited empty scope', allCategories: false, categoryIds: [] }, 1), error => error.code === 'INVALID_REQUEST')
    await assert.rejects(() => issueToken({ name: 'invalid list', categoryIds: 'all' }, 1), error => error.code === 'INVALID_REQUEST')
    await assert.rejects(() => issueToken({ name: 'invalid flag', allCategories: 'true' }, 1), error => error.code === 'INVALID_REQUEST')
    await assert.rejects(() => issueToken({ name: 'ambiguous scope', allCategories: true, categoryIds: [1] }, 1), error => error.code === 'INVALID_REQUEST')
    const app = express(); app.use(express.json()); app.use('/api/v1', routes)
    app.use((error, _req, res, _next) => { console.error('Integration request failed:', error.code || error.name); res.status(500).json({ code: 'INTERNAL' }) })
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))
    const origin = `http://127.0.0.1:${server.address().port}`
    const call = async (method, endpoint, body, key = 'import-check', secret = issued.secret) => {
      const response = await fetch(`${origin}/api/v1${endpoint}`, { method, headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', 'Idempotency-Key': key }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      return { status: response.status, body: await response.json() }
    }
    assert.equal((await call('GET', '/content-imports/catalog', undefined, '', 'invalid')).status, 401)
    assert.equal((await call('GET', '/admin/content-imports/tokens')).status, 401)
    assert.equal((await call('POST', '/admin/exercises', { status: 'published' })).status, 401)
    const administratorSecret = randomUUID()
    await connection.query("insert into admin_users (username, display_name, password_hash, role, is_active, must_change_password, token, token_expires_at) values ('import-check', 'Check', 'unused', 'super_admin', 1, 0, ?, ?)", [createHash('sha256').update(administratorSecret).digest('hex'), new Date(Date.now() + 3600000)])
    const managed = await call('GET', '/admin/content-imports/tokens', undefined, '', administratorSecret)
    assert.equal(managed.status, 200)
    assert.equal(managed.body.items.length, 1)
    assert.equal(managed.body.items[0].key_hash, undefined)
    assert.equal(managed.body.items[0].secret, undefined)
    const managedCreate = await call('POST', '/admin/content-imports/tokens', { name: 'API management check', categoryIds: [1] }, '', administratorSecret)
    assert.equal(managedCreate.status, 201)
    assert.equal((await call('DELETE', `/admin/content-imports/tokens/${managedCreate.body.token.id}`, undefined, '', administratorSecret)).status, 200)
    assert.equal((await call('GET', '/content-imports/catalog', undefined, '', managedCreate.body.secret)).status, 401)

    const allCreated = await call('POST', '/admin/content-imports/tokens', { name: 'All series check', categoryIds: [] }, '', administratorSecret)
    assert.equal(allCreated.status, 201)
    assert.equal(allCreated.body.token.allCategories, true)
    assert.deepEqual(allCreated.body.token.categoryIds, [])
    const implicitAll = await issueToken({ name: 'Omitted series' }, 1)
    assert.equal(implicitAll.token.allCategories, true)
    assert.deepEqual(implicitAll.token.categoryIds, [])
    const allSecret = allCreated.body.secret
    assert.equal((await call('GET', '/content-imports/catalog', undefined, '', allSecret)).body.categories.length, 2)
    await connection.query("insert into categories (group_id, name, description, accent, sort_order) values (1, 'Future series', '', '#1cb0f6', 2)")
    assert.equal((await call('GET', '/content-imports/catalog', undefined, '', allSecret)).body.categories.length, 3, 'All-series tokens must include later-created series')
    assert.equal((await call('POST', '/admin/exercises', { status: 'published' }, '', allSecret)).status, 401)
    const catalog = await call('GET', '/content-imports/catalog'); assert.equal(catalog.body.categories.length, 1)
    assert.equal((await call('POST', '/content-imports', { ...base, categoryId: 2 })).status, 403)
    assert.equal((await call('POST', '/content-imports', { ...base, status: 'published' })).body.code, 'UNKNOWN_FIELD')
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=10:d=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', '-shortest', path.join(directory, 'lesson.mp4')])
    const media = await readFile(path.join(directory, 'lesson.mp4'))
    const request = { ...base, files: [{ ...base.files[0], sizeBytes: media.length, sha256: createHash('sha256').update(media).digest('hex') }, { ...base.files[1], sizeBytes: srt.length }] }
    const task = await call('POST', '/content-imports', request); assert.equal(task.status, 201); assert.equal(task.body.status, 'awaiting_upload')
    const repeat = await call('POST', '/content-imports', request); assert.equal(repeat.body.id, task.body.id)
    assert.equal((await call('POST', '/content-imports', { ...request, title: 'Changed' })).status, 409)
    assert.equal((await call('POST', '/content-imports', { ...request, sourceUrl: 'https://youtu.be/abcdefghijk' }, 'different-key')).status, 409)
    const another = await issueToken({ name: 'second', categoryIds: [1] }, 1)
    assert.equal((await call('GET', `/content-imports/${task.body.id}`, undefined, '', another.secret)).status, 404)
    assert.equal((await call('POST', `/content-imports/${task.body.id}/complete`, { status: 'published' })).status, 400)
    await assert.rejects(() => processImport(task.body.id, actor), error => error.code === 'UPLOAD_INCOMPLETE')
    assert.equal((await call('GET', `/content-imports/${task.body.id}`)).body.status, 'failed')
    const renew = await call('POST', `/content-imports/${task.body.id}/upload-urls`, {})
    for (const upload of renew.body.uploads) assert.equal((await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: upload.role === 'media' ? media : srt })).status, 200)
    const queued = await call('POST', `/content-imports/${task.body.id}/complete`, {}); assert.equal(queued.status, 202); assert.equal(queued.body.status, 'queued')
    const results = await Promise.allSettled([processImport(task.body.id, actor), processImport(task.body.id, actor)])
    assert.ok(results.some(result => result.status === 'fulfilled'))
    const ready = (await call('GET', `/content-imports/${task.body.id}`)).body
    assert.equal(ready.status, 'ready'); assert.equal(ready.createdAs, 'draft'); assert.equal(ready.validation.subtitle.cueCount, 1)
    const [courses] = await connection.query('select status, transcript_json from exercises')
    assert.equal(courses.length, 1); assert.equal(courses[0].status, 'draft')
    const { listCatalog, listCategoryExercises } = await import('../backend/src/general/catalog/catalog-service.ts')
    assert.equal((await listCatalog()).categories.length, 0, 'Draft-only series must not appear in the learner catalog')
    assert.equal((await listCategoryExercises(1)).length, 0, 'Imported drafts must not appear in the learner course list')
    assert.equal((await call('POST', `/content-imports/${task.body.id}/complete`, {})).body.exerciseId, ready.exerciseId)
    for (const upload of renew.body.uploads) await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: Buffer.alloc(upload.role === 'media' ? media.length : srt.length, 0) })
    const stored = await ContentImport.findByPk(task.body.id)
    const acceptedKeys = stored.get('result_json').acceptedKeys
    const stream = await storage.getObject(bucket, acceptedKeys.media)
    const chunks = []; for await (const chunk of stream) chunks.push(chunk)
    assert.deepEqual(Buffer.concat(chunks), media, 'A still-valid staging PUT must not replace accepted course media')
    await stored.update({ expires_at: new Date(Date.now() - 86400000) })
    await cleanupImports()
    assert.equal((await storage.statObject(bucket, acceptedKeys.media)).size, media.length)
    const revokeRequest = { ...request, sourceUrl: 'https://www.youtube.com/watch?v=01234567890' }
    const revokedTask = await call('POST', '/content-imports', revokeRequest, 'revocation-check')
    for (const upload of revokedTask.body.uploads) assert.equal((await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: upload.role === 'media' ? media : srt })).status, 200)
    await call('POST', `/content-imports/${revokedTask.body.id}/complete`, {})
    const { revokeToken } = await import('../backend/src/general/content-imports/tokens.ts'); await revokeToken(actor.id)
    assert.equal((await call('GET', '/content-imports/catalog')).status, 401)
    assert.equal((await call('POST', `/content-imports/${revokedTask.body.id}/complete`, {})).status, 401)
    // Simulate a worker that authenticated before revocation: final commit still must reject it.
    await assert.rejects(() => processImport(revokedTask.body.id, actor), error => error.code === 'IMPORT_TOKEN_REVOKED')
    const [afterRevocation] = await connection.query('select count(*) as total from exercises')
    assert.equal(afterRevocation[0].total, 1)
    const expiredTask = await call('POST', '/content-imports', { ...request, sourceUrl: 'https://www.youtube.com/watch?v=expiretest1' }, 'expiry-check', another.secret)
    assert.equal(expiredTask.status, 201)
    const expiredRow = await ContentImport.findByPk(expiredTask.body.id)
    await expiredRow.update({ expires_at: new Date(Date.now() - 1000) })
    assert.equal((await call('POST', `/content-imports/${expiredTask.body.id}/complete`, {}, '', another.secret)).status, 410)
    const recovered = await call('POST', '/content-imports', { ...request, categoryId: 3, sourceUrl: 'https://youtu.be/expiretest1' }, 'expiry-check-new', allSecret)
    assert.equal(recovered.status, 201)
    for (const upload of recovered.body.uploads) await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: upload.role === 'media' ? media : srt })
    await call('POST', `/content-imports/${recovered.body.id}/complete`, {}, '', allSecret)
    const { startImportWorker, stopImportWorker } = await import('../backend/src/general/content-imports/worker.ts')
    startImportWorker()
    try {
      const deadline = Date.now() + 15000
      let status
      do {
        await new Promise(resolve => setTimeout(resolve, 500))
        status = (await call('GET', `/content-imports/${recovered.body.id}`, undefined, '', allSecret)).body.status
      } while (status !== 'ready' && Date.now() < deadline)
      assert.equal(status, 'ready', 'Durable worker must consume the queued task')
      const [futureCourses] = await connection.query('select status from exercises where category_id=3')
      assert.equal(futureCourses.length, 1, 'All-series token must be able to import into future series')
      assert.equal(futureCourses[0].status, 'draft')
    } finally { stopImportWorker() }

    console.log('Isolated database/storage integration checks passed: draft-only, auth scopes, deduplication, retries, concurrency, immutable accepted files, cleanup, revocation')
  } finally {
    if (server) await new Promise(resolve => server.close(resolve))
    if (sequelize) await sequelize.close()
    if (storage) {
      try {
        const objects = []; for await (const object of storage.listObjectsV2(bucket, '', true)) objects.push(object.name)
        if (objects.length) await storage.removeObjects(bucket, objects)
        await storage.removeBucket(bucket)
      } catch { /* The bucket may not have been created if a prerequisite failed. */ }
    }
    await connection.query(`drop database if exists \`${database}\``)
    await connection.end()
    await rm(directory, { recursive: true, force: true })
  }
}
