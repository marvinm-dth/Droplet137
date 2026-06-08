const BaseController = require("../../../core/base.controller");
const milestoneModel = require("./milestone.model");
const hasUser = require("../../../core/mixins/has-users.mixin");
const hasDynamicField = require("../../../core/mixins/has-dynamic-field.mixin");
const hasRelation = require("../../../core/mixins/has-relation.mixin");
const canClone = require("../../../core/mixins/can-clone.mixin");
const mix = require("../../../core/mixin");
const { logClassMethods } = require("../../../utils/controller.utils");
const hasMany = require("../../../core/mixins/has-many.mixin");
const hasOne = require("../../../core/mixins/has-one.mixin");
const projectModel = require("../project/project.model");

class MilestonesController extends BaseController {
  model = milestoneModel;
  entityType = "milestone";
  // templateGuide = milestoneTemplateGuide;
}

module.exports = mix(new MilestonesController()).with(
  hasUser,
  hasDynamicField,
  hasRelation,
  canClone,
  [hasMany, "tasks"],
  [hasOne, "project"]
);
