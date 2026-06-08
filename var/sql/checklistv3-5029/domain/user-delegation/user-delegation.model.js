const BaseModel = require("../../core/base.model");
const Joi = require("joi");
const { CAN_USER_DELEGATE_TYPES } = require("../../core/enums");
const { modelErrorWrapper } = require("../../utils/model.utils");
const userModel = require("../user/user.model");

class UserDelegationModel extends BaseModel {
  table = "dev_user_delegations";

  insertSchema = Joi.object({
    user_id: Joi.number().required().greater(0),
    entity_id: Joi.number().required().greater(0),
    entity_type: Joi.string()
      .valid(...CAN_USER_DELEGATE_TYPES)
      .required(),
  });

  // no updateSchema
  transformations = [];

  getUserDelegations = async ({
    targetEntity,
    targetId,
    columns = "*",
    filters,
  }) => {
    // Step 1: Fetch all records from the userDelegation table where the entity matches the specified type and ID
    const polyTableRecords = await this.findMany({
      filters: {
        entity_type: targetEntity,
        entity_id: targetId,
      },
    });
    // Step 2: Fetch user records from the users' table
    const data = await userModel.findManyFromArray({
      columns,
      filters,
      array: polyTableRecords?.map((r) => r["user_id"]),
    });

    return data;
  };
}

module.exports = new UserDelegationModel();
