const express = require("express");
const dynamicFieldRouter = express.Router();
const dynamicFieldController = require("./dynamic-field.controller");

dynamicFieldRouter.get("/", dynamicFieldController.index);
dynamicFieldRouter.get("/:id", dynamicFieldController.show);
dynamicFieldRouter.post("/", dynamicFieldController.create);
dynamicFieldRouter.put("/:id", dynamicFieldController.update);
dynamicFieldRouter.delete("/:id", dynamicFieldController.delete);

module.exports = dynamicFieldRouter;
