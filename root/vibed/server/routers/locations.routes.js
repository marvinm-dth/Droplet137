import { Router } from "express";

import {
  create,
  destroy,
  index,
  show,
  update,
} from "../controllers/locations.controller.js";

const locationsRouter = Router();

locationsRouter.get("/", index);
locationsRouter.get("/:id", show);
locationsRouter.post("/", create);
locationsRouter.put("/:id", update);
locationsRouter.patch("/:id", update);
locationsRouter.delete("/:id", destroy);

export default locationsRouter;
