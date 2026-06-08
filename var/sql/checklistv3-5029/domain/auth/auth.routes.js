const express = require("express");
const authRouter = express.Router();
const authController = require("./auth.controller");

authRouter.post("/register", authController.register);
authRouter.post(
  "/login",
  process.env.NODE_ENV === "local"
    ? authController.loginAnon
    : authController.login
);
authRouter.post("/refresh", authController.refresh);
authRouter.delete("/logout", authController.logout);

module.exports = authRouter;
