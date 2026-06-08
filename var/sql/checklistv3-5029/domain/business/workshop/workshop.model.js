const BaseModel = require("../../../core/base.model");
const Joi = require("joi");

class WorkshopModel extends BaseModel {
  table = "dev_workshops";
  insertSchema = Joi.object({
    name_en: Joi.string().required(),
  });

  updateSchema = Joi.object({
    name_en: Joi.string(),
    name_zh: Joi.string().allow(""),
  }).min(1);

  transformations = [];
}

module.exports = new WorkshopModel();
