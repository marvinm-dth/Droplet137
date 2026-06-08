const BaseController = require("../../../core/base.controller");
const mix = require("../../../core/mixin");
const canClone = require("../../../core/mixins/can-clone.mixin");
const hasDynamicField = require("../../../core/mixins/has-dynamic-field.mixin");
const hasMany = require("../../../core/mixins/has-many.mixin");
const hasOne = require("../../../core/mixins/has-one.mixin");
const hasRelation = require("../../../core/mixins/has-relation.mixin");
const hasUser = require("../../../core/mixins/has-users.mixin");
const taskModel = require("./task.model");

class TasksController extends BaseController {
  model = taskModel;
  entityType = "task";
  // templateGuide = taskTemplateGuide;
}

module.exports = mix(new TasksController()).with(
  hasUser,
  hasDynamicField,
  hasRelation,
  canClone,
  [hasMany, "checklists"],
  [hasOne, "milestone"]
);
