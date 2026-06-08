const express = require("express");
const milestoneController = require("./milestone.controller");
const milestoneRouter = express.Router();

// restful
milestoneRouter.get("/", milestoneController.index);
milestoneRouter.get("/:id", milestoneController.show);
milestoneRouter.post("/", milestoneController.create);
milestoneRouter.put("/:id", milestoneController.update);
milestoneRouter.delete("/:id", milestoneController.delete);

milestoneRouter.get("/:id/users", milestoneController.indexUserDelegations); // can user delegate
milestoneRouter.post("/:id/users", milestoneController.updateUserDelegations);

milestoneRouter.get("/:id/fields", milestoneController.indexDynamicFields); // can dynamic field
milestoneRouter.post("/:id/fields", milestoneController.createDynamicFields); 
milestoneRouter.delete("/:id/fields", milestoneController.deleteDynamicFields);

milestoneRouter.get("/:id/blockers", milestoneController.indexBlockers); // can relations
milestoneRouter.get("/:id/blocking", milestoneController.indexBlocking);
milestoneRouter.get("/:id/relations", milestoneController.indexRelations);
milestoneRouter.post("/:id/blockers", milestoneController.createBlockers);
milestoneRouter.delete("/:id/blockers", milestoneController.deleteBlockers);

// canClone - good
milestoneRouter.post("/:id/duplicate", milestoneController.createDuplicate);
milestoneRouter.post("/:id/template", milestoneController.createTemplate);
milestoneRouter.post("/from-template/:id", milestoneController.createFromTemplate); //template id

milestoneRouter.get("/:id/project", milestoneController.showProject);
milestoneRouter.get("/:id/tasks", milestoneController.indexTasks);

module.exports = milestoneRouter;
