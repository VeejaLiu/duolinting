-- Published snapshots bind metadata, source media, transcript and playback contract atomically.
-- No foreign keys: application transactions validate every relationship.
create table if not exists course_releases (
  id bigint unsigned auto_increment primary key,
  exercise_id bigint unsigned not null,
  media_url varchar(1024) not null,
  snapshot_json json not null,
  manifest_json json not null,
  state enum('preview','published') not null,
  created_by_admin_id bigint unsigned null,
  created_at timestamp not null default current_timestamp,
  published_at timestamp null,
  index idx_release_exercise (exercise_id, state, id)
);
alter table exercises add column published_release_id bigint unsigned null,
  add index idx_exercise_published_release (published_release_id);
alter table exercise_subtitle_drafts add column media_url varchar(1024) null;

create table if not exists media_analyses (
  id bigint unsigned auto_increment primary key,
  object_name varchar(255) not null,
  source_etag varchar(255) not null,
  media_revision char(64) not null,
  analysis_json json not null,
  waveform_json json not null,
  created_at timestamp not null default current_timestamp,
  unique key uk_media_analysis_object (object_name, source_etag)
);
create table if not exists course_preview_access (
  id bigint unsigned auto_increment primary key,
  release_id bigint unsigned not null,
  token_hash char(64) not null,
  audience_json json not null,
  expires_at timestamp not null,
  created_by_admin_id bigint unsigned not null,
  created_at timestamp not null default current_timestamp,
  unique key uk_preview_token_hash (token_hash),
  index idx_preview_release (release_id)
);
create table if not exists course_release_checks (
  id bigint unsigned auto_increment primary key,
  release_id bigint unsigned not null,
  platform enum('web','ios','android') not null,
  actor_user_id bigint unsigned null,
  actor_admin_id bigint unsigned null,
  evidence_json json not null,
  checked_at timestamp not null default current_timestamp,
  unique key uk_release_platform_check (release_id, platform)
);

-- Adopt existing published data without inventing a verified byte checksum or waveform.
-- These are snapshots of existing records, not seed courses. New approvals require analysis.
insert into course_releases (exercise_id, media_url, snapshot_json, manifest_json, state, published_at)
select id, audio_url,
 json_object('id',id,'categoryId',category_id,'title',title,'source',source,'sourceUrl',source_url,
 'difficulty',difficulty,'durationLabel',duration_label,'mediaType',media_type,'audioUrl',audio_url,
 'coverImageUrl',cover_image_url,'summary',summary,'status','published','sortOrder',sort_order,
 'localizations',localizations_json,'lines',transcript_json),
 json_object('mediaRevision',concat('legacy:',sha2(audio_url,256)),
 'timelineId',concat('legacy:',sha2(concat(audio_url,':origin0'),256)),
 'subtitleRevision',sha2(cast(transcript_json as char),256),'waveformRevision',null,
 'playbackContractVersion',0,'timelineOriginUs',0,'audioTrackIndex',0,'durationUs',null,'verifiedMedia',false),
 'published',current_timestamp
from exercises where status='published';
update exercises e join course_releases r on r.exercise_id=e.id and r.state='published'
set e.published_release_id=r.id where e.published_release_id is null;
-- Bind existing drafts to the media that was present at migration time.
update exercise_subtitle_drafts d join exercises e on e.id=d.exercise_id set d.media_url=e.audio_url;
