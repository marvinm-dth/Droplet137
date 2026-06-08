import { Router } from "express";

import {
  create,
  destroy,
  index,
  show,
  update,
} from "../controllers/requests.controller.js";

const requestsRouter = Router();

requestsRouter.get("/", index);
requestsRouter.get("/:id", show);
requestsRouter.post("/", create);
requestsRouter.put("/:id", update);
requestsRouter.patch("/:id", update);
requestsRouter.delete("/:id", destroy);

export default requestsRouter;
