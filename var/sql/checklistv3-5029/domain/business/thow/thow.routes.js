const express = require("express");
const thowRouter = express.Router();
const thowController = require("./thow.controller");

thowRouter.get("/", thowController.index);
thowRouter.get("/:id", thowController.show);
thowRouter.post("/", thowController.create);
thowRouter.put("/:id", thowController.update);
thowRouter.delete("/:id", thowController.delete);

thowRouter.get("/:id/fields", thowController.indexDynamicFields); // can dynamic field
thowRouter.post("/:id/fields", thowController.createDynamicFields); 
thowRouter.delete("/:id/fields", thowController.deleteDynamicFields);

// canClone - good
thowRouter.post("/:id/duplicate", thowController.createDuplicate);
thowRouter.post("/:id/template", thowController.createTemplate);
thowRouter.post("/from-template/:id", thowController.createFromTemplate); //template id

thowRouter.get("/:id/project", thowController.showProject);

module.exports = thowRouter;
