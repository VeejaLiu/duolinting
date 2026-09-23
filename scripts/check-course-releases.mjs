import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { Client } from 'minio'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
// This integration check must be pointed explicitly at an isolated database.
if (process.env.NODE_ENV !== 'test' || process.env.MYSQL_DATABASE !== 'release_check') throw new Error('Use NODE_ENV=test and MYSQL_DATABASE=release_check')
const { sequelize } = require('../backend/src/models/db-config-mysql.ts')
const { createCoursePreview, publishReviewedRelease, publishedCourse, authorizedPreview } = require('../backend/src/general/releases/release-service.ts')
const { uploadMediaObject, getManagedMediaObjectName } = require('../backend/src/general/media/media-service.ts')
const directory = await mkdtemp(join(tmpdir(), 'release-check-'))
const file = join(directory, 'fixture.m4a')
execFileSync('ffmpeg', ['-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=4','-ac','1','-c:a','aac','-b:a','160k',file])
const buffer = await readFile(file)
const uploaded = await uploadMediaObject({ fileName: 'fixture.m4a', contentType: 'audio/mp4', buffer, size: buffer.length })
const url = uploaded.publicUrl
const lines=[{id:'stable-1',start:1,end:2,text:'Test sentence',translation:'测试',translations:{'zh-CN':'测试'},answers:[],keywords:[]}]
try {
  const learnerId=Date.now()
  const username=`release-check-${learnerId}`
  await sequelize.query("insert into admin_users (username,email,display_name,password_hash,role,learner_user_id) values (:username,:email,'Reviewer','unused','super_admin',:learnerId)",{replacements:{username,learnerId,email:`${username}@example.invalid`}})
  const [[admin]]=await sequelize.query("select id from admin_users where username=:username",{replacements:{username}})
  const [id]=await sequelize.query(`insert into exercises (category_id,title,source,difficulty,duration_label,media_type,audio_url,summary,localizations_json,transcript_json,status,sort_order)
    values (1,'Release fixture','test','beginner','00:04','audio',:url,'',json_object(),cast(:lines as json),'draft',0)`,{replacements:{url,lines:JSON.stringify(lines)}})
  const exerciseId=Number(id)
  // Approval must work before any preview or device confirmation exists.
  await sequelize.transaction(t=>publishReviewedRelease(exerciseId,Number(admin.id),lines,t))
  assert.deepEqual((await publishedCourse(exerciseId)).lines,lines)
  const preview=await createCoursePreview(exerciseId,Number(admin.id),lines,url)
  const mediaRevision = preview.course.release.mediaRevision
  assert.ok(preview.course.release.courseReleaseId>0)
  assert.match(preview.course.audioUrl, /releases/)
  assert.equal(preview.course.waveform.mediaRevision, mediaRevision)
  assert.ok(preview.mobilePreviewToken)
  const samePreview=await createCoursePreview(exerciseId,Number(admin.id),lines,url)
  assert.equal(samePreview.course.release.courseReleaseId,preview.course.release.courseReleaseId)
  await assert.rejects(authorizedPreview(preview.mobilePreviewToken,999),/无权访问/)
  assert.equal((await authorizedPreview(preview.mobilePreviewToken,learnerId)).lines[0].id,'stable-1')
  await sequelize.transaction(t=>publishReviewedRelease(exerciseId,Number(admin.id),lines,t))
  const published=await publishedCourse(exerciseId)
  assert.ok(published.release.courseReleaseId > 0)
  assert.equal(published.release.mediaRevision, preview.course.release.mediaRevision)
  assert.deepEqual(published.lines,lines)
  const storage = new Client({endPoint:process.env.MINIO_ENDPOINT,port:Number(process.env.MINIO_PORT),useSSL:false,accessKey:process.env.MINIO_ACCESS_KEY,secretKey:process.env.MINIO_SECRET_KEY})
  await storage.putObject(process.env.MINIO_BUCKET,uploaded.objectName,Buffer.concat([buffer,Buffer.from('changed-source')]))
  const frozen=await storage.getObject(process.env.MINIO_BUCKET,getManagedMediaObjectName(published.audioUrl))
  const checksum=createHash('sha256');for await(const chunk of frozen)checksum.update(chunk)
  assert.equal(checksum.digest('hex'),mediaRevision)

  await sequelize.query("update exercises set audio_url='/api/v1/media/objects?key=audio%2Fnew-source.m4a',transcript_json=json_array(),status='draft' where id=:id",{replacements:{id:exerciseId}})
  assert.deepEqual((await publishedCourse(exerciseId)).lines,lines)
  assert.equal((await publishedCourse(exerciseId)).release.mediaRevision,mediaRevision)
  await assert.rejects(createCoursePreview(exerciseId,Number(admin.id),lines,url),/媒体已变化/)
  await sequelize.query('update course_preview_access set expires_at=date_sub(utc_timestamp(), interval 1 second) where release_id=:id',{replacements:{id:preview.course.release.courseReleaseId}})
  await assert.rejects(authorizedPreview(preview.mobilePreviewToken,learnerId),/已过期/)
  console.log('PASS: immutable published snapshot, atomic pointer, publication without preview or device checks, bound media, preview authorization/expiry, stable ids')
} finally { await sequelize.close(); await rm(directory, { recursive: true, force: true }) }
