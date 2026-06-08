const BaseController = require("../../../core/base.controller");
const supabase = require("../../../core/supabase");
const submissionModel = require("./submission.model");

const path = require("path");
const { nanoid } = require("nanoid");
const submissionMediaModel = require("./submission-media.model");

const BUCKET_NAME = "uploads";

class SubmissionsController extends BaseController {
  model = submissionModel;

  show = async (req, res) => {
    const item = await this.model.findOne({
      filters: { id: req.params.id },
      columns:
        "*, submitter:dev_users!submitter_id(id, name), reviewer:dev_users!reviewer_id(id, name)",
    });
    res.json({ success: true, message: "", data: item });
  };

  indexImages = async (req, res) => {
    const data = await submissionMediaModel.all({
      columns: "*, uploader:dev_users(name)",
      filters: { mime: "image", submission_id: req.params.id },
    });
    res.json({ success: true, message: "", data: data });
  };

  indexVideos = async (req, res) => {
    const data = await submissionMediaModel.all({
      columns: "*, uploader:dev_users(name)",
      filters: { mime: "video", submission_id: req.params.id },
    });
    res.json({ success: true, message: "", data: data });
  };

  create = async (req, res) => {
    const submissionEntry = {
      ...req.body,
      name_en: `#${Date.now()} submission`,
      submitter_id: req.user.id,
      submitted_at: Date.now(),
      status: "pending",
    };

    const newSubmission = await this.model.insertOne({
      entry: submissionEntry,
    });

    try {
      // try to use RESUMABLEJS if video upload speed is a problem
      const mediaProofs = req.files.filter(
        (f) =>
          f.mimetype?.startsWith("image/") || f.mimetype?.startsWith("video/")
      );

      const mediaUploads = mediaProofs.map(async (file) => {
        const { originalname, buffer, mimetype } = file;
        const now = new Date();
        const uploadDate = now.toISOString().split("T")[0];
        const ext = path.extname(originalname);
        const baseName = path.basename(originalname, ext);
        const newFileName = `${uploadDate}_${baseName}_${nanoid(8)}${ext}`;
        const mimeCategory = mimetype.split("/")[0];

        const filePath = `proof/${now.getFullYear()}-${
          now.getMonth() + 1
        }/${mimeCategory}/${newFileName}`;

        // Upload Bucket
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(filePath, buffer, {
            contentType: mimetype,
            upsert: false,
          });
        if (uploadError)
          throw new Error(`Upload failed: ${uploadError.message}`);

        // Public URL
        const { data: publicUrlData } = supabase.storage
          .from(BUCKET_NAME)
          .getPublicUrl(uploadData.path);
        const publicUrl = publicUrlData?.publicUrl ?? null;

        // Insert row
        const { data: mediaRow, error: insertError } =
          await submissionMediaModel.insertOne({
            entry: {
              uploader_id: req.user?.id,
              name_en: baseName,
              mime: mimeCategory,
              path: uploadData.path,
              url: publicUrl,
              submission_id: newSubmission?.id,
            },
          });
        if (insertError)
          throw new Error(`DB insert failed: ${insertError.message}`);

        return { ok: true, mediaRow };
      });

      const settled = await Promise.allSettled(mediaUploads);

      const createdMedia = settled
        .filter((r) => r.status === "fulfilled")
        .map((r) => r.value.mediaRow);

      const errors = settled
        .filter((r) => r.status === "rejected")
        .map((r) => ({ error: r.reason?.message || String(r.reason) }));

      return res.json({
        success: errors.length === 0,
        message:
          errors.length === 0
            ? "Submission Successful"
            : "Submission completed with some errors",
        data: newSubmission,
      });
    } catch (err) {
      console.error("Unexpected error:", err);
      return res.status(500).json({ error: "Server error" });
    }
  };

  createImage = async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      const { originalname, buffer, mimetype } = req.file;
      const mimeCategory = mimetype.split("/")[0]; // e.g., "image", "video"

      const now = new Date();
      const uploadDate = now.toISOString().split("T")[0];

      const ext = path.extname(originalname); // e.g., ".mp4"
      const baseName = path.basename(originalname, ext); // e.g., "vid-1"

      const newFileName = `${uploadDate}_${baseName}_${nanoid(8)}${ext}`;
      const filePath = `proofs/${now.getFullYear()}-${
        now.getMonth() + 1
      }/${mimeCategory}/${newFileName}`; //proofs/2025-7/image/filename.jpeg

      const { data: bucketData, error: bucketError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, buffer, {
          contentType: mimetype,
          upsert: false,
        });

      if (bucketError) {
        console.error("Upload error:", bucketError);
        return res.status(500).json({ error: "Failed to upload to Supabase" });
      }

      const { data: publicUrlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(bucketData.path);

      const publicUrl = publicUrlData?.publicUrl;

      try {
        await submissionMediaModel.insertOne({
          entry: {
            uploader_id: req.user?.id,
            name_en: baseName,
            mime: mimeCategory,
            path: bucketData.path,
            url: publicUrl,
          },
        });

        res.json({
          message: "File uploaded successfully",
        });
      } catch (error) {
        if (error) {
          console.error("Upload error:", error);
          return res
            .status(500)
            .json({ error: "Failed to upload to Supabase" });
        }
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      res.status(500).json({ error: "Server error" });
    }
  };

  delete = async (req, res) => {
    const submission_id = req.params.id;

    const deletedItem = await this.model.deleteOne({
      filters: { id: submission_id },
    });

    const deletedMedia = await submissionMediaModel.deleteMany({
      filters: { submission_id },
    });

    res.json({ success: true, message: "", data: deletedItem.id });
  };

  update = async (req, res) => {
    const { action, reviewer_comments } = req.body;
    let updates = {};

    if (["approved", "rejected", "forced"].includes(action)) {
      updates = {
        status: action,
        reviewer_id: req.user?.id,
        reviewed_at: Date.now(),
        reviewer_comments: reviewer_comments,
      };
    } else if (action == "pending") {
      updates = {
        status: action,
        reviewer_id: null,
        reviewed_at: null,
        reviewer_comments: null,
      };
    }

    const updatedItem = await this.model.updateOne({
      filters: { id: req.params.id },
      updates: updates,
    });

    res.json({ success: true, message: "", data: {} });
  };
}

module.exports = new SubmissionsController();
