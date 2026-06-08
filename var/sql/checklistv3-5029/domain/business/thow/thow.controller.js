const BaseController = require("../../../core/base.controller");
const mix = require("../../../core/mixin");
const canClone = require("../../../core/mixins/can-clone.mixin");
const hasDynamicField = require("../../../core/mixins/has-dynamic-field.mixin");
const hasOne = require("../../../core/mixins/has-one.mixin");
const thowModel = require("./thow.model");

class ThowsController extends BaseController {
  model = thowModel;
  entityType = "thow";
  // templateGuide = taskTemplateGuide;
}

module.exports = mix(new ThowsController()).with(
  hasDynamicField,
  canClone,
  [hasOne, "project"]
);
