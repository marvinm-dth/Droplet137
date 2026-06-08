const express = require("express");
const taskController = require("./task.controller");
const taskRouter = express.Router();

// restful
taskRouter.get("/", taskController.index);
taskRouter.get("/:id", taskController.show);
taskRouter.post("/", taskController.create);
taskRouter.put("/:id", taskController.update);
taskRouter.delete("/:id", taskController.delete);

taskRouter.get("/:id/users", taskController.indexUserDelegations); // can user delegate
taskRouter.post("/:id/users", taskController.updateUserDelegations);

taskRouter.get("/:id/fields", taskController.indexDynamicFields); // can dynamic field
taskRouter.post("/:id/fields", taskController.createDynamicFields); 
taskRouter.delete("/:id/fields", taskController.deleteDynamicFields);

// entityRelations - remove later
taskRouter.get("/:id/blockers", taskController.indexBlockers); // can relations
taskRouter.get("/:id/blocking", taskController.indexBlocking);
taskRouter.get("/:id/relations", taskController.indexRelations);
taskRouter.post("/:id/blockers", taskController.createBlockers);
taskRouter.delete("/:id/blockers", taskController.deleteBlockers);

// canClone - good
taskRouter.post("/:id/duplicate", taskController.createDuplicate);
taskRouter.post("/:id/template", taskController.createTemplate);
taskRouter.post("/from-template/:id", taskController.createFromTemplate); //template id

taskRouter.get("/:id/checklists", taskController.indexChecklists);
taskRouter.get("/:id/milestone", taskController.showMilestone);

module.exports = taskRouter;
