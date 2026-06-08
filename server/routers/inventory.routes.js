import { Router } from "express";

import {
  create,
  destroy,
  index,
  show,
  update,
} from "../controllers/inventory.controller.js";

const inventoryRouter = Router();

inventoryRouter.get("/", index);
inventoryRouter.get("/:id", show);
inventoryRouter.post("/", create);
inventoryRouter.put("/:id", update);
inventoryRouter.patch("/:id", update);
inventoryRouter.delete("/:id", destroy);

export default inventoryRouter;
