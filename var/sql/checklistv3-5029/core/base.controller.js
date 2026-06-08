class BaseController {
  model;
  entityType;
  templateGuide;
  columns = "*";

  index = async (req, res) => {
    const data = await this.model.all({ columns: this.columns });
    res.json({ success: true, message: "", data: data });
  };

  show = async (req, res) => {
    const item = await this.model.findOne({
      filters: { id: req.params.id },
      columns: this.columns,
    });
    res.json({ success: true, message: "", data: item });
  };

  create = async (req, res) => {
    const newItem = await this.model.insertOne({ entry: req.body });
    res.json({ success: true, message: "", data: newItem });
  };

  update = async (req, res) => {
    const updatedItem = await this.model.updateOne({
      filters: { id: req.params.id },
      updates: req.body,
    });
    res.json({ success: true, message: "", data: updatedItem });
  };

  delete = async (req, res) => {
    const deletedItem = await this.model.deleteOne({
      filters: { id: req.params.id },
    });
    res.json({ success: true, message: "", data: deletedItem.id });
  };
}

module.exports = BaseController;
