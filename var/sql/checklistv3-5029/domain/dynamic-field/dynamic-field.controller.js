const BaseController = require("../../core/base.controller");
const dynamicModel = require("./dynamic-field.model");

class DynamicFieldsController extends BaseController {
  model = dynamicModel;
}

module.exports = new DynamicFieldsController();
