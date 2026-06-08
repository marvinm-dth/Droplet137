const Joi = require("joi");
const BaseModel = require("../../../core/base.model");
const { deriveStatusFromDependency, includeAscendantData, includeDescendantData, includeRelationData, deriveStatusFromAscendantForceComplete, deriveStatusFromDescendantsStatus, deriveStatusFromForceComplete } = require("../../../core/dto");

class TaskModel extends BaseModel {
  table = "dev_tasks";

  insertSchema = Joi.object({
    milestone_id: Joi.number().required().greater(0),
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
        dTree: ["checklist", "item"],
      },
    ],
    [
      deriveStatusFromAscendantForceComplete,
      {
        model: this,
        aTree: ["milestone", "project", "workshop"],
      },
    ],
    [deriveStatusFromDependency, { model: this }],

    [
      includeAscendantData,
      { model: this, aTree: ["milestone", "project", "workshop"] },
    ],
    [includeDescendantData, { model: this, dTree: ["checklist", "item"] }],
    [includeRelationData, { model: this }],
  ];
}

module.exports = new TaskModel();
