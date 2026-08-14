-- Localized course content is deliberately stored as JSON documents. A course
-- and its timed subtitle lines form one aggregate and can later move to MongoDB
-- without decomposing/rejoining translations.
alter table category_groups
  add column localizations_json json not null default (json_object()) after description;

alter table categories
  add column localizations_json json not null default (json_object()) after description;

alter table exercises
  add column localizations_json json not null default (json_object()) after summary;

create table if not exists user_preferences (
  id bigint unsigned primary key auto_increment,
  user_id bigint unsigned not null,
  ui_locale varchar(16) not null default 'zh-CN',
  content_locale varchar(16) not null default 'zh-CN',
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  unique key uq_user_preferences_user_id (user_id),
  key idx_user_preferences_user_id (user_id)
);

-- Keep the legacy translation member during this rollout so an old backend can
-- still read subtitles between migration completion and application restart.
-- New code treats translations["zh-CN"] as authoritative and derives the
-- legacy API field from it for Mobile compatibility.
delimiter //
create procedure migrate_legacy_subtitle_translations()
begin
  declare done boolean default false;
  declare exercise_id bigint unsigned;
  declare original_json json;
  declare next_json json;
  declare line_index int;
  declare line_count int;
  declare legacy_translation text;
  declare exercise_cursor cursor for
    select id, transcript_json from exercises
    where json_type(transcript_json) = 'ARRAY' and json_length(transcript_json) > 0;
  declare continue handler for not found set done = true;

  open exercise_cursor;
  migration_loop: loop
    fetch exercise_cursor into exercise_id, original_json;
    if done then leave migration_loop; end if;

    set next_json = original_json;
    set line_index = 0;
    set line_count = json_length(next_json);
    while line_index < line_count do
      set legacy_translation = json_unquote(json_extract(next_json, concat('$[', line_index, '].translation')));
      if legacy_translation is not null and trim(legacy_translation) <> '' then
        set next_json = json_set(
          next_json,
          concat('$[', line_index, '].translations'),
          json_object('zh-CN', legacy_translation)
        );
      else
        set next_json = json_set(next_json, concat('$[', line_index, '].translations'), json_object());
      end if;
      set line_index = line_index + 1;
    end while;
    update exercises set transcript_json = next_json where id = exercise_id;
  end loop;
  close exercise_cursor;
end//
call migrate_legacy_subtitle_translations()//
drop procedure migrate_legacy_subtitle_translations//
delimiter ;
