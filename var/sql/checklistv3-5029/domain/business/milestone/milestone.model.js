const BaseModel = require("../../../core/base.model");
const Joi = require("joi");
const { deriveStatusFromAscendantForceComplete, deriveStatusFromForceComplete, deriveStatusFromDescendantsStatus, includeAscendantData, includeDescendantData, includeRelationData, deriveStatusFromDependency } = require("../../../core/dto");

class MilestoneModel extends BaseModel {
  table = "dev_milestones";

  insertSchema = Joi.object({
    project_id: Joi.number().required().greater(0),
    name_en: Joi.string().required(),
  });
  updateSchema = Joi.object({
    name_en: Joi.string(),
    name_zh: Joi.string().allow(""),
    force_completed: Joi.boolean(),
    force_completed_at: Joi.date().allow(null),
  }).min(1);

  transformations = [
    deriveStatusFromForceComplete,
    [
      deriveStatusFromDescendantsStatus,
      {
        model: this,
        dTree: ["task", "checklist", "item"],
      },
    ],
    [
      deriveStatusFromAscendantForceComplete,
      {
        model: this,
        aTree: ["project", "workshop"],
      },
    ],
    // [deriveStatusFromDependency, { model: this }], causing loop

    [includeAscendantData, { model: this, aTree: ["project", "workshop"] }],
    [includeDescendantData, { model: this, dTree: ["task", "checklist", "item"] }],
    [includeRelationData, { model: this }],
  ];
}

module.exports = new MilestoneModel();
