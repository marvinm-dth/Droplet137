const BaseController = require("../../../core/base.controller");
const mix = require("../../../core/mixin");
const canClone = require("../../../core/mixins/can-clone.mixin");
const hasDynamicField = require("../../../core/mixins/has-dynamic-field.mixin");
const hasMany = require("../../../core/mixins/has-many.mixin");
const hasOne = require("../../../core/mixins/has-one.mixin");
const hasRelation = require("../../../core/mixins/has-relation.mixin");
const hasUser = require("../../../core/mixins/has-users.mixin");
const checklistModel = require("./checklist.model");

class ChecklistsController extends BaseController {
  model = checklistModel;
  entityType = "checklist";
  // templateGuide = checklistTemplateGuide;
}

module.exports = mix(new ChecklistsController()).with(
  hasUser,
  hasDynamicField,
  hasRelation,
  canClone,
  [hasMany, "items"],
  [hasOne, "task"]
);
