const express = require("express");
const mediaAttachmentRouter = express.Router();
const mediaAttachmentController = require("./media-attachment.controller");

mediaAttachmentRouter.get("/", mediaAttachmentController.index);
mediaAttachmentRouter.get("/:id", mediaAttachmentController.show);
mediaAttachmentRouter.post("/", mediaAttachmentController.create);
mediaAttachmentRouter.put("/:id", mediaAttachmentController.update);
mediaAttachmentRouter.delete("/:id", mediaAttachmentController.delete);

module.exports = mediaAttachmentRouter;
