const Joi = require("joi");
const BaseModel = require("../../../core/base.model");
const {
  deriveStatusFromDescendantsStatus,
  includeAscendantData,
  transformTest,
  simulateStatusFromSelfComplete,
  deriveStatusFromSelfComplete,
  deriveStatusFromForceComplete,
  includeDescendantData,
  includeRelationData,
  deriveStatusFromDependency,
} = require("../../../core/dto");

class ProjectModel extends BaseModel {
  table = "dev_projects";

  insertSchema = Joi.object({
    workshop_id: Joi.number().allow(null).greater(0),
    name_en: Joi.string().required(),
  });

  updateSchema = Joi.object({
    name_en: Joi.string(),
    name_zh: Joi.string().allow(""),
    force_completed: Joi.boolean(),
    force_completed_at: Joi.date().allow(null),
  }).min(1);

  // make the transformations
  transformations = [
    [deriveStatusFromDependency, { model: this }],
    deriveStatusFromForceComplete,
    [deriveStatusFromDescendantsStatus,{ model: this, dTree: ["milestone", "task", "checklist", "item"]}],
    [includeAscendantData, { model: this, aTree: ["workshop"] }],
    [includeDescendantData, { model: this, dTree: ["milestone", "task", "checklist", "item"] }],
    [includeRelationData, { model: this }],
  ];
}

module.exports = new ProjectModel();
