const BaseController = require("../../../core/base.controller");
const mix = require("../../../core/mixin");
const canClone = require("../../../core/mixins/can-clone.mixin");
const hasDynamicField = require("../../../core/mixins/has-dynamic-field.mixin");
const hasMany = require("../../../core/mixins/has-many.mixin");
const hasUser = require("../../../core/mixins/has-users.mixin");
const projectModel = require("../project/project.model");
const workshopModel = require("./workshop.model");

class WorkshopsController extends BaseController {
  model = workshopModel;
  entityType = "workshop";

  indexProjects = async (req, res) => {
    const checklists = await this.model.findManyForeign({
      foreignModel: projectModel,
      filters: {
        [`${this.entityType}_id`]: req.params.id,
      },
      columns: "*",
    });
    res.json({
      success: true,
      message: "",
      data: checklists,
    });
  };
}

module.exports = mix(new WorkshopsController()).with(
  hasUser,
  hasDynamicField,
  canClone,
  [hasMany, "projects"]
);
