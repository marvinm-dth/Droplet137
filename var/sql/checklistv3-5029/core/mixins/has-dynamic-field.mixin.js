const dynamicFieldModel = require("../../domain/dynamic-field/dynamic-field.model");

const hasDynamicField = {
  async indexDynamicFields(req, res) {
    const data = await dynamicFieldModel.getDynamicFields({
      filters: {
        entity_type: this.model.table,
        entity_id: req.params.id,
      },
    });

    res.json({ success: true, message: "", data: data });
  },

  async createDynamicFields(req, res) {
    const newItem = await dynamicFieldModel.insertOne({
      entry: {
        entity_type: `dev_${this.entityType}s`,
        entity_id: req.params.id,
        ...req.body,
      },
    });
    res.json({ success: true, message: "", data: newItem });
  },

  async deleteDynamicFields(req, res) {
    const deletedItem = await dynamicFieldModel.deleteOne({
      filters: { id: req.body?.fieldId }
    });
    res.json({ success: true, message: "", data: deletedItem });
  },
};

module.exports = hasDynamicField;
