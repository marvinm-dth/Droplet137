const entityRelationModel = require("../../domain/entity-relation/entity-relation.model");

const hasRelation = {
  async indexBlockers(req, res) {
    const blockers = await entityRelationModel.getBlockers({
      targetModel: this.model,
      targetId: req.params.id,
    });
    res.json({ success: true, message: "", data: blockers });
  },

  async indexBlocking(req, res) {
    const blocking = await entityRelationModel.getBlocking({
      targetModel: this.model,
      targetId: req.params.id,
    });
    res.json({ success: true, message: "", data: blocking });
  },

  async indexRelations(req, res) {
    const blockers = await entityRelationModel.getBlockers({
      targetModel: this.model,
      targetId: req.params.id,
    });
    const blocking = await entityRelationModel.getBlocking({
      targetModel: this.model,
      targetId: req.params.id,
    });

    res.json({ success: true, message: "", data: { blockers, blocking } });
  },

  async createBlockers(req, res) {
    const blockers = req.body?.blockers || [];

    const existing = await entityRelationModel.findManyFromArray({
      columns: "blocker_id",
      array: blockers,
      arrayFilter: "blocker_id",
      filters: {
        blocked_id: req.params?.id,
        entity_type: `dev_${this.entityType}s`,
      },
    });

    const flatExisting = existing.map(({ blocker_id }) => blocker_id);
    const newIds = blockers.filter((id) => !flatExisting.includes(id));
    if (!newIds.length) res.status(200);

    const newItems = await entityRelationModel.insertMany({
      entries: newIds.map((newBlocker) => ({
        entity_type: `dev_${this.entityType}s`,
        blocker_id: newBlocker,
        blocked_id: req.params?.id,
      })),
    });

    res.json({ success: true, message: "", data: newItems });
  },

  async deleteBlockers(req, res) {
    const deletedItem = await entityRelationModel.deleteMany({
      filters: {
        entity_type: `dev_${this.entityType}s`,
        blocker_id: req.body?.blocker,
        blocked_id: req.params?.id,
      },
    });
    res.json({ success: true, message: "", data: deletedItem });
  },
};

module.exports = hasRelation;
