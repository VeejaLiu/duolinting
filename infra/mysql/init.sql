set names utf8mb4;

create table if not exists category_groups (
  id bigint unsigned primary key auto_increment,
  name varchar(120) not null,
  description varchar(255) not null,
  accent varchar(16) not null,
  cover_image_url varchar(1024) null,
  sort_order int not null default 0,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp
);

create table if not exists categories (
  id bigint unsigned primary key auto_increment,
  group_id bigint unsigned not null,
  name varchar(120) not null,
  description varchar(255) not null,
  accent varchar(16) not null,
  cover_image_url varchar(1024) null,
  sort_order int not null default 0,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  key idx_categories_group_id (group_id)
);

create table if not exists exercises (
  id bigint unsigned primary key auto_increment,
  category_id bigint unsigned not null,
  title varchar(180) not null,
  source varchar(180) not null,
  difficulty enum('beginner', 'intermediate', 'advanced') not null,
  duration_label varchar(32) not null,
  media_type enum('audio', 'video') not null default 'audio',
  audio_object_name varchar(255) null,
  audio_url varchar(1024) not null,
  cover_image_url varchar(1024) null,
  summary text not null,
  transcript_json json not null,
  status enum('draft', 'published', 'archived') not null default 'draft',
  sort_order int not null default 0,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  key idx_exercises_category_id (category_id),
  key idx_exercises_status (status)
);

create table if not exists users (
  id bigint unsigned primary key auto_increment,
  email varchar(255) not null unique,
  display_name varchar(120) not null,
  password_hash varchar(255) null,
  token varchar(64) null,
  token_expires_at timestamp null,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp
);

create table if not exists user_sessions (
  id bigint unsigned primary key auto_increment,
  user_id bigint unsigned not null,
  client_type enum('web_app', 'mobile_web', 'mobile_app') not null,
  token_hash char(64) not null,
  expires_at timestamp not null,
  last_seen_at timestamp null,
  revoked_at timestamp null,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  unique key uq_user_sessions_user_client (user_id, client_type),
  key idx_user_sessions_user_id (user_id),
  key idx_user_sessions_expires_at (expires_at)
);

create table if not exists admin_users (
  id bigint unsigned primary key auto_increment,
  username varchar(80) not null unique,
  display_name varchar(120) not null,
  password_hash varchar(255) not null,
  role varchar(40) not null default 'admin',
  token text null,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp
);

create table if not exists exercise_progress (
  id bigint unsigned primary key auto_increment,
  user_id bigint unsigned not null,
  exercise_id bigint unsigned not null,
  last_line_id varchar(96) not null,
  show_translation boolean not null default true,
  hide_transcript boolean not null default false,
  playback_rate decimal(4, 2) not null default 1.00,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  unique key uq_exercise_progress_user_exercise (user_id, exercise_id),
  key idx_exercise_progress_user_id (user_id),
  key idx_exercise_progress_exercise_id (exercise_id)
);

create table if not exists line_progress (
  id bigint unsigned primary key auto_increment,
  user_id bigint unsigned not null,
  exercise_id bigint unsigned not null,
  line_id varchar(96) not null,
  unclear boolean not null default false,
  mastered boolean not null default false,
  repeat_count int not null default 0,
  note text not null,
  dictation text not null,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  unique key uq_line_progress_user_line (user_id, exercise_id, line_id),
  key idx_line_progress_user_id (user_id),
  key idx_line_progress_exercise_id (exercise_id)
);

create table if not exists vocabulary_items (
  id bigint unsigned primary key auto_increment,
  user_id bigint unsigned not null,
  exercise_id bigint unsigned not null,
  word varchar(180) not null,
  context text not null,
  mastery_level int not null default 0,
  next_review_at timestamp null,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  unique key uq_vocabulary_user_word (user_id, exercise_id, word),
  key idx_vocabulary_user_id (user_id),
  key idx_vocabulary_exercise_id (exercise_id)
);

create table if not exists accepted_answer_feedback (
  id bigint unsigned primary key auto_increment,
  user_id bigint unsigned not null,
  exercise_id bigint unsigned not null,
  line_id varchar(96) not null,
  submitted_answer text not null,
  line_text text not null,
  line_translation text not null,
  accepted_answers_json json not null,
  status enum('open', 'reviewed', 'dismissed') not null default 'open',
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  key idx_accepted_answer_feedback_user_id (user_id),
  key idx_accepted_answer_feedback_exercise_id (exercise_id),
  key idx_accepted_answer_feedback_status (status),
  key idx_accepted_answer_feedback_created_at (created_at)
);

insert into category_groups (id, name, description, accent, sort_order) values
  (1, '新闻资讯', '新闻简报、专题报道、公共事件解读', '#1cb0f6', 10),
  (2, '演讲访谈', '演讲、访谈、圆桌讨论、人物对话', '#ce82ff', 20),
  (3, '故事文化', '故事、纪录片、文化节目、影视片段', '#ff9600', 30),
  (4, '校园考试', '校园广播、考试题型、学术讲座', '#2f6fed', 40),
  (5, '职场商务', '会议、汇报、面试、商业播客', '#0d8f74', 50),
  (6, '科技产品', '技术分享、产品发布、开发者内容', '#845ec2', 60),
  (7, '生活服务', '旅行、医疗、购物、客服与公共服务', '#ff4b4b', 70)
on duplicate key update
  name = values(name),
  description = values(description),
  accent = values(accent),
  sort_order = values(sort_order);
