const Joi = require("joi");
const BaseModel = require("../../../core/base.model");

class SubmissionMediaModel extends BaseModel {
  table = "dev_submission_media";
  insertSchema = Joi.object({
    uploader_id: Joi.number().required().allow(null),
    name_en: Joi.string(),
    name_zh: Joi.string(),
    mime: Joi.string(),
    path: Joi.string().required(),
    url: Joi.string().required(),
    submission_id: Joi.number().required(),
  });
  updateSchema = Joi.object({}).min(1);
  transformations = [];
}

module.exports = new SubmissionMediaModel();
