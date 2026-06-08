const userDelegationModel = require("../../domain/user-delegation/user-delegation.model");

const hasUser = {
  async indexUserDelegations(req, res) {
    const users = await userDelegationModel.getUserDelegations({
      targetEntity: this.model.table,
      targetId: req.params?.id,
      columns: "id, name",
    });
    res.json({ success: true, message: "", data: users });
  },

  async updateUserDelegations(req, res) {
    const users = req.body?.users || [];

    const entityId = req.params?.id;
    const entityType = `dev_${this.entityType}s`;

    const existing = await userDelegationModel.findMany({
      columns: "user_id",
      filters: {
        entity_id: entityId,
        entity_type: entityType,
      },
    });

    const flatExisting = existing?.map(({ user_id }) => user_id);

    // Determine what to add and what to remove
    const newIds = users?.filter((id) => !flatExisting?.includes(id));
    const removedIds = flatExisting?.filter((id) => !users?.includes(id));

    let newItems = [];
    if (newIds?.length > 0) {
      newItems = await userDelegationModel.insertMany({
        entries: newIds.map((newUser) => ({
          entity_type: entityType,
          entity_id: entityId,
          user_id: newUser,
        })),
      });
    }

    if (removedIds?.length > 0) {
      await userDelegationModel.deleteManyFromArray({
        filters: {
          entity_id: entityId,
          entity_type: entityType,
        },
        array: removedIds,
        arrayFilter: "user_id",
      });
    }

    res.json({ success: true, message: "", data: newItems });
  },
};

module.exports = hasUser;
