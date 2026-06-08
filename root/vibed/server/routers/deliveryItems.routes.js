import { Router } from "express";

import {
  create,
  destroy,
  index,
  printLabels,
  show,
  update,
} from "../controllers/deliveryItems.controller.js";

const deliveryItemsRouter = Router();

deliveryItemsRouter.get("/", index);
deliveryItemsRouter.get("/:id", show);
deliveryItemsRouter.post("/:id/print-labels", printLabels);
deliveryItemsRouter.post("/", create);
deliveryItemsRouter.put("/:id", update);
deliveryItemsRouter.patch("/:id", update);
deliveryItemsRouter.delete("/:id", destroy);

export default deliveryItemsRouter;
