const express = require("express");
const checklistRouter = express.Router();
const checklistController = require("./checklist.controller");

// restful
checklistRouter.get("/", checklistController.index);
checklistRouter.get("/:id", checklistController.show);
checklistRouter.post("/", checklistController.create);
checklistRouter.put("/:id", checklistController.update);
checklistRouter.delete("/:id", checklistController.delete);

checklistRouter.get("/:id/users", checklistController.indexUserDelegations); // can user delegate
checklistRouter.post("/:id/users", checklistController.updateUserDelegations);

checklistRouter.get("/:id/fields", checklistController.indexDynamicFields); // can dynamic field
checklistRouter.post("/:id/fields", checklistController.createDynamicFields); 
checklistRouter.delete("/:id/fields", checklistController.deleteDynamicFields);

// entityRelations - remove later
checklistRouter.get("/:id/blockers", checklistController.indexBlockers); // can relations
checklistRouter.get("/:id/blocking", checklistController.indexBlocking);
checklistRouter.get("/:id/relations", checklistController.indexRelations);
checklistRouter.post("/:id/blockers", checklistController.createBlockers);
checklistRouter.delete("/:id/blockers", checklistController.deleteBlockers);

// canClone - good
checklistRouter.post("/:id/duplicate", checklistController.createDuplicate);
checklistRouter.post("/:id/template", checklistController.createTemplate);
checklistRouter.post("/from-template/:id", checklistController.createFromTemplate); //template id

checklistRouter.get("/:id/items", checklistController.indexItems);
checklistRouter.get("/:id/task", checklistController.showTask);

module.exports = checklistRouter;
