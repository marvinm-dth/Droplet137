const BaseController = require("../../core/base.controller");
const userModel = require("./user-delegation.model");

class UserDelegationsController extends BaseController {
  model = userModel;
}

module.exports = new UserDelegationsController();
