const BaseController = require("../../core/base.controller");
const submissionModel = require("../business/submission/submission.model");
const userModel = require("./user.model");
const bcrypt = require("bcrypt");

class UsersController extends BaseController {
  model = userModel;
  columns = "id, name, is_suspended";

  update = async (req, res) => {
    let password = req.body?.password;
    if (password) {
      password = await bcrypt.hash(password, 10);
    }

    const updatedItem = await this.model.updateOne({
      filters: { id: req.body?.userId },
      updates: {
        is_suspended: req.body?.isSuspended,
        name: req.body?.userName,
        password,
      },
    });
    res.json({ success: true, message: "", data: updatedItem });
  };

  delete = async (req, res) => {
    const deletedItem = await this.model.deleteOne({
      filters: { id: req.body?.userId },
    });
    res.json({ success: true, message: "", data: deletedItem.id });
  };

  // if itemId is present show all user submission on that ID;
  indexUserSubmissions = async (req, res) => {
    const filters = {};
    filters[`submitter_id`] = req.params.id;
    if (req.body?.itemId) {
      filters["item_id"] = req.body.itemId;
    }

    const manyEntities = await this.model.findManyForeign({
      foreignModel: submissionModel,
      filters,
      columns: "*",
    });
    res.json({
      success: true,
      message: "",
      data: manyEntities,
    });
  };
}

module.exports = new UsersController();
