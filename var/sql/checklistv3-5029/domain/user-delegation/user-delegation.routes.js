const express = require("express");
const userDelegationRouter = express.Router();
const userDelegationController = require("./user-delegation.controller");

userDelegationRouter.get("/", userDelegationController.index);
userDelegationRouter.get("/:id", userDelegationController.show);
userDelegationRouter.post("/", userDelegationController.create);
userDelegationRouter.put("/:id", userDelegationController.update);
userDelegationRouter.delete("/:id", userDelegationController.delete);

module.exports = userDelegationRouter;
