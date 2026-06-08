const Joi = require("joi");
const BaseModel = require("../../core/base.model");

class TemplateModel extends BaseModel {
  table = "dev_templates";
  ascendantTree = ["foo", "foo", "foo", "foo"];
  descendantTree = ["foo", "foo", "foo", "foo"];

  transformations = [];

  insertSchema = Joi.object({
    name_en: Joi.string().required(),
    entity_type: Joi.string()
      .valid(
        "dev_thows",
        "dev_projects",
        "dev_milestones",
        "dev_tasks",
        "dev_checklists",
        "dev_items"
      )
      .required(),
    value: Joi.object().required(),
  }).min(1);
  updateSchema = Joi.object({}).min(1);
}

module.exports = new TemplateModel();
