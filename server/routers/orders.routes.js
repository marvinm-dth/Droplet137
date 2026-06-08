import { Router } from "express";

import {
  create,
  destroy,
  index,
  show,
  update,
} from "../controllers/orders.controller.js";

const ordersRouter = Router();

ordersRouter.get("/", index);
ordersRouter.get("/:id", show);
ordersRouter.post("/", create);
ordersRouter.put("/:id", update);
ordersRouter.patch("/:id", update);
ordersRouter.delete("/:id", destroy);

export default ordersRouter;
