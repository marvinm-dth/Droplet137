const BaseModel = require("../../core/base.model");
const Joi = require("joi");
const { CAN_RELATIONS_TYPES } = require("../../core/enums");
const { modelErrorWrapper } = require("../../utils/model.utils");

class EntityRelationModel extends BaseModel {
  table = "dev_entity_relations";

  insertSchema = Joi.object({
    entity_type: Joi.string()
      .valid(...CAN_RELATIONS_TYPES)
      .required(),
    blocker_id: Joi.number().required().greater(0),
    blocked_id: Joi.number().required().greater(0),
  });

  // no updateSchema

  transformations = [];

  getBlockers = async ({
    targetModel,
    targetId,
    columns = "*",
    filters,
    includeTransform,
  }) => {
    const blockers = await this.findMany({
      filters: {
        entity_type: targetModel.table,
        blocked_id: targetId,
      },
    });
    const data = await targetModel.findManyFromArray({
      columns,
      filters,
      array: blockers.map((r) => r["blocker_id"]),
      includeTransform,
    });
    return data;
  };

  getBlocking = async ({
    targetModel,
    targetId,
    columns = "*",
    filters,
    includeTransform,
  }) => {
    const blocking = await this.findMany({
      filters: {
        entity_type: targetModel.table,
        blocker_id: targetId,
      },
    });

    const data = await targetModel.findManyFromArray({
      columns,
      filters,
      array: blocking.map((r) => r["blocked_id"]),
      includeTransform,
    });

    return data;
  };
}

module.exports = new EntityRelationModel();
