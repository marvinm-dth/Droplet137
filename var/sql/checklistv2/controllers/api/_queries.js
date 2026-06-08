const q = (...args) => {
  return args.join(", ");
}

const qTaskItem = {};
const qTaskChecklist = {};
const qTask = {};
const qMilestone = {};
const qProject = {};
const qWorkshop = {};

qTaskItem.basic = `id, title_en`;
qTaskItem.self = `id, status, force_completed, force_completed_at,
  title_en, title_zh, description_en, description_zh, notes_en, notes_zh,
  require_photos, require_videos, require_comments,
  reviewer_comments, submitted_comments, submitted_videos,
  submitted_at, reviewed_at`;
qTaskItem.downstream = `
reviewer:dev_users!reviewer_id(id, name),
submitter:dev_users!submitter_id(id, name),
reference_photos:dev_task_item_reference_photos(id, original_path, thumbnail_path, scaled_path),
reference_videos:dev_task_item_reference_videos(id, video_link, video_desc_en, video_desc_zh),
submitted_photos:dev_task_item_submitted_photos(id, original_path, thumbnail_path, scaled_path)`;

qTaskChecklist.basic = `id, name_en`;
qTaskChecklist.self = `id, name_en, name_zh, description_en, description_zh, force_completed, force_completed_at`;

qTask.basic = `id, name`;
qTask.self = `id, name, force_completed, force_completed_at`;
qTask.users = `users:dev_users(id, name)`

qMilestone.basic = `id, name_en`;
qMilestone.self = `id, name_en, name_zh, special_notes_en, special_notes_zh, force_completed, force_completed_at`;
qMilestone.dependencies = `dependencies:dev_milestone_relationships!child_id(data:dev_milestones!parent_id(id, name_en), ignored)`;
// qMilestone.dependents = `dependents:dev_milestone_relationships!parent_id(data:dev_milestones!child_id(id, name), ignored)`;
qMilestone.users = `users:dev_users(id, name)`


qProject.basic = `id, name`;
qProject.self = `id, name, sale_percent, force_completed, force_completed_at`;

qWorkshop.basic = `id, name`;
qWorkshop.self = `id, name`;

qProject.upstream = `workshop:dev_workshops(${qWorkshop.self})`;
qMilestone.upstream = `project:dev_projects(${qProject.self}, ${qProject.upstream})`;
qTask.upstream = `milestone:dev_milestones(${qMilestone.self}, ${qMilestone.upstream})`;
qTaskChecklist.upstream = `task:dev_tasks(${qTask.self}, ${qTask.upstream})`; //users:dev_users(id, name), 
qTaskItem.upstream = `task_checklist:dev_task_checklists(${qTaskChecklist.self}, ${qTaskChecklist.upstream})`;


qTaskItem.full = q(qTaskItem.self, qTaskItem.downstream, qTaskItem.upstream);
qTaskChecklist.downstream = `task_items:dev_task_items(${qTaskItem.full})`;

qTaskChecklist.full = q(qTaskChecklist.self, qTaskChecklist.downstream, qTaskChecklist.upstream);
qTask.downstream = `task_checklist:dev_task_checklists(${qTaskChecklist.full})`;

qTask.full = q(qTask.self, qTask.downstream, qTask.upstream, qTask.users);
qMilestone.downstream = `tasks:dev_tasks(${qTask.full})`;

qMilestone.full = q(qMilestone.self, qMilestone.downstream, qMilestone.upstream, qMilestone.dependencies, qMilestone.users);
qProject.downstream = `model:dev_models(id, name, description, short_name, original_price, length, width, height, area), milestones:dev_milestones(${qMilestone.full})`;

qProject.full = q(qProject.self, qProject.downstream, qProject.upstream);
qWorkshop.downstream = `projects:dev_projects(${qProject.full})`;



module.exports = {
  qTaskItem,
  qTaskChecklist,
  qTask,
  qMilestone,
  qProject,
  qWorkshop,
  q,
};