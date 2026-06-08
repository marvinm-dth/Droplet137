const express = require("express");
const userRouter = express.Router();
const userController = require("./user.controller");

userRouter.get("/", userController.index);
userRouter.get("/:id", userController.show);
userRouter.post("/", userController.create);
userRouter.put("/", userController.update);
userRouter.delete("/", userController.delete);

userRouter.get("/:id/submissions", userController.indexUserSubmissions);


module.exports = userRouter;
