import { Router } from "express";

import {
  create,
  destroy,
  index,
  show,
  update,
} from "../controllers/suppliers.controller.js";

const suppliersRouter = Router();

suppliersRouter.get("/", index);
suppliersRouter.get("/:id", show);
suppliersRouter.post("/", create);
suppliersRouter.put("/:id", update);
suppliersRouter.patch("/:id", update);
suppliersRouter.delete("/:id", destroy);

export default suppliersRouter;
