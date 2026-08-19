-- 旧课程只有课程授权、没有工作流负责人时，若该课程恰好只有一位贡献者，
-- 按当前简化规则自动让该贡献者同时负责校对和二次审核。
insert ignore into exercise_workflow_assignees (exercise_id, workflow_role, admin_user_id)
select assignments.exercise_id, roles.workflow_role, assignments.admin_user_id
from exercise_contributor_assignments assignments
inner join (
  select exercise_id
  from exercise_contributor_assignments
  group by exercise_id
  having count(distinct admin_user_id) = 1
) single_contributor on single_contributor.exercise_id = assignments.exercise_id
cross join (
  select 'proofreader' as workflow_role
  union all
  select 'second_reviewer' as workflow_role
) roles;
