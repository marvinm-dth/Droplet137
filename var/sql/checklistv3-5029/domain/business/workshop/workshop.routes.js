const express = require("express");
const workshopRouter = express.Router();
const workshopController = require("./workshop.controller");

workshopRouter.get("/", workshopController.index);
workshopRouter.get("/:id", workshopController.show);
workshopRouter.post("/", workshopController.create);
workshopRouter.put("/:id", workshopController.update);
workshopRouter.delete("/:id", workshopController.delete);


workshopRouter.get("/:id/users", workshopController.indexUserDelegations); // can user delegate
workshopRouter.post("/:id/users", workshopController.updateUserDelegations);

workshopRouter.get("/:id/fields", workshopController.indexDynamicFields); // can dynamic field
workshopRouter.post("/:id/fields", workshopController.createDynamicFields);
workshopRouter.delete("/:id/fields", workshopController.deleteDynamicFields);

// canClone - good
workshopRouter.post("/:id/duplicate", workshopController.createDuplicate);
workshopRouter.post("/:id/template", workshopController.createTemplate);
workshopRouter.post("/from-template/:id", workshopController.createFromTemplate); //template id

// workshopRouter.get("/:id/:entity", workshopController.indexProjects);


module.exports = workshopRouter;
