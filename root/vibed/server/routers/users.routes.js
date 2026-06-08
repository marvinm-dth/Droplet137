import { Router } from "express";

import { create, index } from "../controllers/users.controller.js";
import { requireAdmin } from "../libs/auth-guards.js";

const usersRouter = Router();

usersRouter.get("/", ...requireAdmin, index);
usersRouter.post("/", ...requireAdmin, create);

export default usersRouter;
