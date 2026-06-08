const express = require("express");
const submissionRouter = express.Router();
const submissionController = require("./submission.controller");
const upload = require("../../../core/multer");

submissionRouter.post(
  "/photos",
  upload.single("file"),
  submissionController.createImage
); // api/v1/submission/image
// submissionRouter.post("/video", submissionController.createVideo); // api/v1/submission/image

submissionRouter.get("/", submissionController.index);
submissionRouter.get("/:id", submissionController.show);

submissionRouter.post("/", upload.any(), submissionController.create);

submissionRouter.put("/:id", submissionController.update);

// fix delete record, delete on bucket.
submissionRouter.delete("/:id", submissionController.delete);

submissionRouter.get("/:id/videos", submissionController.indexVideos);
submissionRouter.get("/:id/images", submissionController.indexImages);

module.exports = submissionRouter;
