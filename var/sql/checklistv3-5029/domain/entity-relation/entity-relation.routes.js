const express = require("express");
const entityRelationRouter = express.Router();
const entityRelationController = require("./entity-relation.controller");

entityRelationRouter.get("/", entityRelationController.index);
entityRelationRouter.get("/:id", entityRelationController.show);
entityRelationRouter.post("/", entityRelationController.create);
entityRelationRouter.put("/:id", entityRelationController.update);
entityRelationRouter.delete("/:id", entityRelationController.delete);

module.exports = entityRelationRouter;
