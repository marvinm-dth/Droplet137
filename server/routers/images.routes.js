import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { create, destroy, index, show } from "../controllers/images.controller.js";

const imagesRouter = Router();
const uploadRootDir = path.join(process.cwd(), "public", "uploads");

fs.mkdirSync(uploadRootDir, { recursive: true });

function sanitizePathSegment(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

const storage = multer.diskStorage({
  destination: (_req, file, cb) => {
    const mimeSegments = String(file.mimetype || "application/octet-stream")
      .split("/")
      .map((segment) => sanitizePathSegment(segment || "unknown"));
    const uploadDir = path.join(uploadRootDir, ...mimeSegments);

    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname || "");
    cb(null, `${Date.now()}${extension}`);
  },
});

const upload = multer({ storage });

imagesRouter.get("/", index);
imagesRouter.get("/:id", show);
imagesRouter.post("/", upload.single("image"), create);
imagesRouter.delete("/:id", destroy);

export default imagesRouter;
