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
