const templateModel = require("../../domain/template/template.model");
const templateService = require("../../domain/template/template.service");

const canClone = {
  async createDuplicate(req, res) {
    const og = await this.model.findOne({ filters: { id: req.params.id } });
    const newItem = await this.model.insertOne({ entry: og });
    res.json({ success: true, message: "", data: newItem });
  },

  async createTemplate(req, res) {
    const { templateName } = req.body;
    const jsonTemplateGuide = await templateService.templatize(
      this.templateGuide,
      req.params.id
    );

    const newItem = await templateModel.insertOne({
      entry: {
        name_en: templateName,
        entity_type: this.model.table,
        value: jsonTemplateGuide,
      },
    });

    res.json({ success: true, message: "", data: newItem });
  },

  async createFromTemplate(req, res) {
    const newItem = await templateService.insertUsingTemplate(req.params.id);
    res.json({ success: true, message: "", data: newItem });
  },
};

module.exports = canClone;
