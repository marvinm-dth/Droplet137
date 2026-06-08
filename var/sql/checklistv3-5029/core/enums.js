const CAN_USER_DELEGATE_TYPES = ["dev_projects", "dev_milestones", "dev_tasks"];

const CAN_DYNAMIC_FIELD_TYPES = [
  "dev_projects",
  "dev_milestones",
  "dev_tasks",
  "dev_thows",
];

const CAN_RELATIONS_TYPES = ["dev_projects", "dev_milestones", "dev_tasks"];

const ALLOWED_MIME_TYPES = ["image", "video", "text", "audio"];

const ALLOWED_DYNAMIC_FIELD_TYPES = [
  "text",
  "number",
  "boolean",
  "link",
  "media",
];

const CAN_MEDIA_ATTACH_TYPES = ["dev_items", "dev_dynamic_fields"];

const ALLOWED_ATTACHMENT_TYPES = ["sample", "proof"];

const CAN_MAKE_TEMPLATE = [
  "dev_thows",
  "dev_projects",
  "dev_milestones",
  "dev_tasks",
  "dev_checklists",
  "dev_items",
];

const ALLOWED_SUBMISSION_STATUS = [
  "draft",
  "pending",
  "approved",
  "rejected",
  "forced"
];

module.exports = {
  CAN_USER_DELEGATE_TYPES,
  CAN_DYNAMIC_FIELD_TYPES,
  CAN_RELATIONS_TYPES,
  ALLOWED_MIME_TYPES,
  ALLOWED_DYNAMIC_FIELD_TYPES,
  CAN_MEDIA_ATTACH_TYPES,
  ALLOWED_ATTACHMENT_TYPES,
  CAN_MAKE_TEMPLATE,
  ALLOWED_SUBMISSION_STATUS,
};
