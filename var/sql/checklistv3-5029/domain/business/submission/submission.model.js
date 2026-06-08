const Joi = require("joi");
const BaseModel = require("../../../core/base.model");
const { ALLOWED_SUBMISSION_STATUS } = require("../../../core/enums");

class SubmissionModel extends BaseModel {
  table = "dev_submissions";
  insertSchema = Joi.object({
    item_id: Joi.number().required(),
    name_en: Joi.string().required(),
    submitter_id: Joi.number().required(),
    submitted_at: Joi.date().required(),
    status: Joi.string()
      .valid(...ALLOWED_SUBMISSION_STATUS)
      .required(),

    submitter_comments: Joi.string().allow(""),
  });
  updateSchema = Joi.object({
    status: Joi.string().valid(...ALLOWED_SUBMISSION_STATUS),
    reviewer_id: Joi.number().allow(null),
    reviewed_at: Joi.date().allow(null),
    reviewer_comments: Joi.string().allow("").allow(null),
  }).min(1);
}

module.exports = new SubmissionModel();
