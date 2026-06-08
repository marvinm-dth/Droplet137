import { Router } from "express";

import {
  create,
  destroy,
  index,
  show,
  update,
} from "../controllers/itemGroups.controller.js";

const itemGroupsRouter = Router();

itemGroupsRouter.get("/", index);
itemGroupsRouter.get("/:id", show);
itemGroupsRouter.post("/", create);
itemGroupsRouter.put("/:id", update);
itemGroupsRouter.patch("/:id", update);
itemGroupsRouter.delete("/:id", destroy);

export default itemGroupsRouter;
