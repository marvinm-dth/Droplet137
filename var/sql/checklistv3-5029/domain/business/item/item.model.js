const BaseModel = require("../../../core/base.model");
const Joi = require("joi");
const {
  deriveStatusFromForceComplete,
  deriveStatusFromDescendantsStatus,
  includeDescendantData,
  includeRelationData,
  includeAscendantData,
  deriveStatusFromDependency,
  deriveStatusFromAscendantForceComplete,
} = require("../../../core/dto");

class ItemModel extends BaseModel {
  table = "dev_items";

  insertSchema = Joi.object({
    checklist_id: Joi.number().required().greater(0),
    name_en: Joi.string().required(),
  });

  updateSchema = Joi.object({
    name_en: Joi.string(),
    name_zh: Joi.string().allow(""),
    require_comments: Joi.boolean(),
    require_photos: Joi.boolean(),
    require_videos: Joi.boolean(),
    force_completed: Joi.boolean(),
    force_completed_at: Joi.date().allow(null),
  }).min(1);

  transformations = [
    deriveStatusFromForceComplete,
    [
      deriveStatusFromDescendantsStatus,
      {
        model: this,
        dTree: [],
      },
    ],
    [
      deriveStatusFromAscendantForceComplete,
      {
        model: this,
        aTree: ["checklist", "task", "milestone", "project", "workshop"],
      },
    ],
    [deriveStatusFromDependency, { model: this }],

    [
      includeAscendantData,
      {
        model: this,
        aTree: ["checklist", "task", "milestone", "project", "workshop"],
      },
    ],
    [includeDescendantData, { model: this, dTree: [] }],
    [includeRelationData, { model: this }],
  ];
}

module.exports = new ItemModel();
