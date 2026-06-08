import { Router } from "express";

import {
  create,
  destroy,
  index,
  show,
  update,
} from "../controllers/items.controller.js";

const itemsRouter = Router();

itemsRouter.get("/", index);
itemsRouter.get("/:id", show);
itemsRouter.post("/", create);
itemsRouter.put("/:id", update);
itemsRouter.patch("/:id", update);
itemsRouter.delete("/:id", destroy);

export default itemsRouter;
