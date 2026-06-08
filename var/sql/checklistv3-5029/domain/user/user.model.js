const Joi = require("joi");
const BaseModel = require("../../core/base.model");

class UserModel extends BaseModel {
  table = "dev_users";

  insertSchema = Joi.object({
    name: Joi.string().required(),
    // password: Joi.string().required(),
  });

  updateSchema = Joi.object({
    name: Joi.string(),
    is_suspended: Joi.boolean(),
    password: Joi.string(),
  }).min(1);
  transformations = [];
}

module.exports = new UserModel();
