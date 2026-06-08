import { Router } from "express";

import {
  create,
  destroy,
  index,
  show,
  update,
} from "../controllers/deliveries.controller.js";

const deliveriesRouter = Router();

deliveriesRouter.get("/", index);
deliveriesRouter.get("/:id", show);
deliveriesRouter.post("/", create);
deliveriesRouter.put("/:id", update);
deliveriesRouter.patch("/:id", update);
deliveriesRouter.delete("/:id", destroy);

export default deliveriesRouter;
