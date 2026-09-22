-- English is the default for new preferences. Explicit saved preferences remain unchanged.
alter table user_preferences alter column ui_locale set default 'en-US',
  alter column content_locale set default 'en-US';

-- Preserve original Chinese fields, then promote only existing nonempty English translations.
-- Missing English translations retain the original text; no content is fabricated.
update category_groups
set localizations_json = json_set(localizations_json, '$."zh-CN"',
  json_set(coalesce(json_extract(localizations_json, '$."zh-CN"'), json_object()),
    '$.name', name))
where coalesce(json_type(json_extract(localizations_json, '$."zh-CN".name')), 'NULL') <> 'STRING'
  or length(trim(json_unquote(json_extract(localizations_json, '$."zh-CN".name')))) = 0;

update category_groups
set name = json_unquote(json_extract(localizations_json, '$."en-US".name'))
where json_type(json_extract(localizations_json, '$."en-US".name')) = 'STRING'
  and length(trim(json_unquote(json_extract(localizations_json, '$."en-US".name')))) > 0;

update category_groups
set localizations_json = json_set(localizations_json, '$."zh-CN"',
  json_set(coalesce(json_extract(localizations_json, '$."zh-CN"'), json_object()),
    '$.description', description))
where coalesce(json_type(json_extract(localizations_json, '$."zh-CN".description')), 'NULL') <> 'STRING'
  or length(trim(json_unquote(json_extract(localizations_json, '$."zh-CN".description')))) = 0;

update category_groups
set description = json_unquote(json_extract(localizations_json, '$."en-US".description'))
where json_type(json_extract(localizations_json, '$."en-US".description')) = 'STRING'
  and length(trim(json_unquote(json_extract(localizations_json, '$."en-US".description')))) > 0;

-- The base fields now own English, avoiding stale English overrides after later edits.
update category_groups set localizations_json = json_remove(localizations_json, '$."en-US"');

update categories
set localizations_json = json_set(localizations_json, '$."zh-CN"',
  json_set(coalesce(json_extract(localizations_json, '$."zh-CN"'), json_object()),
    '$.name', name))
where coalesce(json_type(json_extract(localizations_json, '$."zh-CN".name')), 'NULL') <> 'STRING'
  or length(trim(json_unquote(json_extract(localizations_json, '$."zh-CN".name')))) = 0;

update categories
set name = json_unquote(json_extract(localizations_json, '$."en-US".name'))
where json_type(json_extract(localizations_json, '$."en-US".name')) = 'STRING'
  and length(trim(json_unquote(json_extract(localizations_json, '$."en-US".name')))) > 0;

update categories
set localizations_json = json_set(localizations_json, '$."zh-CN"',
  json_set(coalesce(json_extract(localizations_json, '$."zh-CN"'), json_object()),
    '$.description', description))
where coalesce(json_type(json_extract(localizations_json, '$."zh-CN".description')), 'NULL') <> 'STRING'
  or length(trim(json_unquote(json_extract(localizations_json, '$."zh-CN".description')))) = 0;

update categories
set description = json_unquote(json_extract(localizations_json, '$."en-US".description'))
where json_type(json_extract(localizations_json, '$."en-US".description')) = 'STRING'
  and length(trim(json_unquote(json_extract(localizations_json, '$."en-US".description')))) > 0;

-- The base fields now own English, avoiding stale English overrides after later edits.
update categories set localizations_json = json_remove(localizations_json, '$."en-US"');

update exercises
set localizations_json = json_set(localizations_json, '$."zh-CN"',
  json_set(coalesce(json_extract(localizations_json, '$."zh-CN"'), json_object()),
    '$.title', title))
where coalesce(json_type(json_extract(localizations_json, '$."zh-CN".title')), 'NULL') <> 'STRING'
  or length(trim(json_unquote(json_extract(localizations_json, '$."zh-CN".title')))) = 0;

update exercises
set title = json_unquote(json_extract(localizations_json, '$."en-US".title'))
where json_type(json_extract(localizations_json, '$."en-US".title')) = 'STRING'
  and length(trim(json_unquote(json_extract(localizations_json, '$."en-US".title')))) > 0;

update exercises
set localizations_json = json_set(localizations_json, '$."zh-CN"',
  json_set(coalesce(json_extract(localizations_json, '$."zh-CN"'), json_object()),
    '$.summary', summary))
where coalesce(json_type(json_extract(localizations_json, '$."zh-CN".summary')), 'NULL') <> 'STRING'
  or length(trim(json_unquote(json_extract(localizations_json, '$."zh-CN".summary')))) = 0;

update exercises
set summary = json_unquote(json_extract(localizations_json, '$."en-US".summary'))
where json_type(json_extract(localizations_json, '$."en-US".summary')) = 'STRING'
  and length(trim(json_unquote(json_extract(localizations_json, '$."en-US".summary')))) > 0;

-- The base fields now own English, avoiding stale English overrides after later edits.
update exercises set localizations_json = json_remove(localizations_json, '$."en-US"');

