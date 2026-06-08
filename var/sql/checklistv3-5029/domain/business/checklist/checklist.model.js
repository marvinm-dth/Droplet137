const BaseModel = require("../../../core/base.model");
const {
  deriveStatusFromForceComplete,
  deriveStatusFromDescendantsStatus,
  deriveStatusFromAscendantForceComplete,
  deriveStatusFromDependency,
  includeAscendantData,
  includeDescendantData,
  includeRelationData,
} = require("../../../core/dto");
const Joi = require("joi");

class ChecklistModel extends BaseModel {
  table = "dev_checklists";

  insertSchema = Joi.object({
    task_id: Joi.number().required().greater(0),
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
        dTree: ["item"],
      },
    ],
    [
      deriveStatusFromAscendantForceComplete,
      {
        model: this,
        aTree: ["task", "milestone", "project", "workshop"],
      },
    ],
    [deriveStatusFromDependency, { model: this }],

    [
      includeAscendantData,
      { model: this, aTree: ["task", "milestone", "project", "workshop"] },
    ],
    [includeDescendantData, { model: this, dTree: ["item"] }],
    [includeRelationData, { model: this }],
  ];
}

module.exports = new ChecklistModel();
