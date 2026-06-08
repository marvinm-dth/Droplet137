import { Router } from "express";

import { resetAppData } from "../controllers/appReset.controller.js";
import { requireAdmin } from "../libs/auth-guards.js";

const appResetRouter = Router();

appResetRouter.post("/", ...requireAdmin, resetAppData);

export default appResetRouter;
