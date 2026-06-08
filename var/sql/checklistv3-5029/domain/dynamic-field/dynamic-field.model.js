const BaseModel = require("../../core/base.model");
const Joi = require("joi");
const {
  ALLOWED_DYNAMIC_FIELD_TYPES,
  CAN_DYNAMIC_FIELD_TYPES,
} = require("../../core/enums");

class DynamicFieldModel extends BaseModel {
  table = "dev_dynamic_fields";

  insertSchema = Joi.object({
    label_en: Joi.string().required(),
    entity_id: Joi.number().required().greater(0),
    entity_type: Joi.string()
      .valid(...CAN_DYNAMIC_FIELD_TYPES)
      .required(),
    value: Joi.object({
      type: Joi.string()
        .valid(...ALLOWED_DYNAMIC_FIELD_TYPES)
        .required(),
      content: Joi.any().default(null),
    }).required(),
  });

  updateSchema = Joi.object({
    order: Joi.number().integer().min(0),
    label_en: Joi.string(),
    label_zh: Joi.string().allow("").default(""),
    value: Joi.object({
      type: Joi.string()
        .valid(...ALLOWED_DYNAMIC_FIELD_TYPES)
        .required(),
      content: Joi.any().default(null),
    }),
  }).min(1);

  transformations = [];

  getDynamicFields = async ({ columns = "*", filters }) => {
    const data = await this.findMany({
      columns,
      filters,
    });

    return data;
  };
}

module.exports = new DynamicFieldModel();
