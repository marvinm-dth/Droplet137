const BaseController = require("../../core/base.controller");
const entityModel = require("./entity-relation.model");

class EntityRelationsController extends BaseController {
  model = entityModel;
}

module.exports = new EntityRelationsController();
