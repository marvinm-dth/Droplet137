const BaseModel = require("../../core/base.model");
const supabase = require("../../core/supabase");
const Joi = require("joi");

class SessionModel extends BaseModel {
  table = "dev_sessions";

  insertSchema = Joi.object({
    user_id: Joi.number().required(),
    token: Joi.string().required(),
    user_agent: Joi.string().required(),
  });

  updateSchema = Joi.object({
    is_revoked: Joi.boolean().required(),
  }).min(1);
}

module.exports = new SessionModel();
