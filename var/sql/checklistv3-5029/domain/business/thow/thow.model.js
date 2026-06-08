const BaseModel = require("../../../core/base.model");
const Joi = require("joi");

class ThowModel extends BaseModel {
  table = "dev_thows";

  insertSchema = Joi.object({
    project_id: Joi.number().greater(0).allow(null).default(null),
    internal_name: Joi.string().required(),
    name_en: Joi.string().required(),
  });

  updateSchema = Joi.object({
    project_id: Joi.number().greater(0).allow(null),
    internal_name: Joi.string(),
    name_en: Joi.string(),
    name_zh: Joi.string().allow(""),
  }).min(1);

  transformations = [];
}

module.exports = new ThowModel();
