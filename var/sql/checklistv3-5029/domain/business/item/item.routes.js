const express = require("express");
const itemRouter = express.Router();
const itemController = require("./item.controller");

// restful
itemRouter.get("/", itemController.index);
itemRouter.get("/:id", itemController.show);
itemRouter.post("/", itemController.create);
itemRouter.put("/:id", itemController.update);
itemRouter.delete("/:id", itemController.delete);

itemRouter.get("/:id/users", itemController.indexUserDelegations); // can user delegate
itemRouter.post("/:id/users", itemController.updateUserDelegations);

itemRouter.get("/:id/fields", itemController.indexDynamicFields); // can dynamic field
itemRouter.post("/:id/fields", itemController.createDynamicFields);
itemRouter.delete("/:id/fields", itemController.deleteDynamicFields);

// entityRelations - remove later
itemRouter.get("/:id/blockers", itemController.indexBlockers); // can relations
itemRouter.get("/:id/blocking", itemController.indexBlocking);
itemRouter.get("/:id/relations", itemController.indexRelations);
itemRouter.post("/:id/blockers", itemController.createBlockers);
itemRouter.delete("/:id/blockers", itemController.deleteBlockers);

// canClone - good
itemRouter.post("/:id/duplicate", itemController.createDuplicate);
itemRouter.post("/:id/template", itemController.createTemplate);
itemRouter.post("/from-template/:id", itemController.createFromTemplate); //template id

itemRouter.get("/:id/submissions", itemController.indexSubmissions);
itemRouter.get("/:id/checklist", itemController.showChecklist);

itemRouter.get("/:id/attachments/:mimeType", itemController.indexAttachments);
itemRouter.get(
  "/:id/attachments/:mimeType/available",
  itemController.indexAvailableMedia
);

itemRouter.post("/:id/attachments/:mimeType", itemController.createAttachments);
itemRouter.delete(
  "/:id/attachments/:mimeType",
  itemController.deleteAttachments
);

module.exports = itemRouter;
