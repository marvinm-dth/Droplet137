const express = require("express");
const projectRouter = express.Router();
const projectController = require("./project.controller");

// restful
projectRouter.get("/", projectController.index);
projectRouter.get("/:id", projectController.show);
projectRouter.post("/", projectController.create);
projectRouter.put("/:id", projectController.update);
projectRouter.delete("/:id", projectController.delete);

projectRouter.get("/:id/users", projectController.indexUserDelegations); // can user delegate
projectRouter.post("/:id/users", projectController.updateUserDelegations);

projectRouter.get("/:id/fields", projectController.indexDynamicFields); // can dynamic field
projectRouter.post("/:id/fields", projectController.createDynamicFields); 
projectRouter.delete("/:id/fields", projectController.deleteDynamicFields);

// entityRelations - remove later
projectRouter.get("/:id/blockers", projectController.indexBlockers); // can relations
projectRouter.get("/:id/blocking", projectController.indexBlocking);
projectRouter.get("/:id/relations", projectController.indexRelations);
projectRouter.post("/:id/blockers", projectController.createBlockers);
projectRouter.delete("/:id/blockers", projectController.deleteBlockers);

// canClone - good
projectRouter.post("/:id/duplicate", projectController.createDuplicate);
projectRouter.post("/:id/template", projectController.createTemplate);
projectRouter.post("/from-template/:id", projectController.createFromTemplate); //template id


projectRouter.get("/:id/milestones", projectController.indexMilestones);
projectRouter.get("/:id/thows", projectController.indexThows);
projectRouter.get("/:id/workshop", projectController.showWorkshop);


module.exports = projectRouter;
