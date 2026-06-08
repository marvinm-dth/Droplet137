const BaseController = require("../../../core/base.controller");
const projectModel = require("./project.model");
const mix = require("../../../core/mixin");
const hasUser = require("../../../core/mixins/has-users.mixin");
const hasDynamicField = require("../../../core/mixins/has-dynamic-field.mixin");
const hasRelation = require("../../../core/mixins/has-relation.mixin");
const canClone = require("../../../core/mixins/can-clone.mixin");
const { projectTemplateGuide } = require("../../template/template-guide");
const { logClassMethods } = require("../../../utils/controller.utils");
const hasMany = require("../../../core/mixins/has-many.mixin");
const hasOne = require("../../../core/mixins/has-one.mixin");
const milestoneModel = require("../milestone/milestone.model");

class ProjectsController extends BaseController {
  model = projectModel;
  entityType = "project";
  templateGuide = projectTemplateGuide;
}

module.exports = mix(new ProjectsController()).with(
  hasUser,
  hasDynamicField,
  hasRelation,
  canClone,
  [hasMany, "milestones", "thows"],
  [hasOne, "workshop"]
);

// logClassMethods(module.exports)
