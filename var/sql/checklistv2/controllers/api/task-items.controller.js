const { BASE_PATH } = require('../../_config');
const path = require ('path');
const fs = require ('fs');
const {
    TaskItem,
    TaskItemReferencePhotos,
    TaskItemSubmittedPhotos,
    TaskItemReferenceVideos
} = require('../../models/table.model');
const Notifications = require("../sse/notifications.controller");

const { qTaskItem, q} = require('./_queries');
// =============================================
exports.getAll = async (req, res) => {
    try {
        const taskItems = await TaskItem.getAll(qTaskItem.full);
        res.json({success: true, message: "", data: taskItems});
    } catch (error) {
        console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
        res.status(500).json({ success: false, message: error.message });
    }
};


exports.getById = async (req, res) => {
    try {
        const { taskItemId } = req.params;
        const taskItem = await TaskItem.getById( taskItemId, qTaskItem.full);

        res.json({success: true, message: "", data: taskItem});
    } catch (error) {
        console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.create = async (req, res) => {
    try {
        const { taskChecklistId } = req.body;

        const entry = {}
        entry.task_checklist_id = taskChecklistId;
        entry.title_en = "New task item title";

        const taskItem = await TaskItem.insert(entry, qTaskItem.full);

        res.json({success: true, message: "", data: taskItem});
    } catch (error) {
        console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
        res.status(500).json({success: false, message: error.message});
    }
};

exports.update = async (req, res) => {
    try {
        const { taskItemId } = req.params;
        // const { title_en, title_zh, description_en, description_zh, notes_en, notes_zh,
        //   video_link, video_desc_en, video_desc_zh,
        //   require_photos, require_videos, require_comments  } = req.body;
        const { title_en, title_zh, description_en, description_zh, notes_en, notes_zh,
                require_photos, require_videos, require_comments  } = req.body;

                

        const updates = {};
        updates.title_en = title_en;
        updates.title_zh = title_zh;
        updates.description_en = description_en;
        updates.description_zh = description_zh;
        updates.notes_en = notes_en;
        updates.notes_zh = notes_zh;

        updates.require_photos = require_photos;
        updates.require_videos = require_videos;
        updates.require_comments = require_comments;

        const updatedTaskItem = await TaskItem.update(taskItemId, updates, qTaskItem.full);

        res.json({success: true, message: "", data: []});
    } catch (error) {
        console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
        res.status(500).json({ success: false, message: error.message });
    }
}

exports.delete = async (req, res) => {
    try {
        const { taskItemId } = req.params;
        await TaskItem.delete( taskItemId , qTaskItem.full);
        res.json({success: true, message: "", data: []});
    } catch (error) {
        console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
        res.status(500).json({ success: false, message: error.message });
    }
}

// =================================================

exports.updateStatus = async (req, res) => {
  try {
      const { taskItemId } = req.params;
      const { action, reviewer_comments, submitted_comments  } = req.body;

      const updates = {};
      if(reviewer_comments !== null) updates.reviewer_comments = reviewer_comments;
      if(submitted_comments !== null) updates.submitted_comments = submitted_comments;


      switch (action) {
        case "cancel":
          updates.status = "cancelled"
          updates.reviewer_id = req.user.id;
          break;
        case "restore":
          updates.status = "inprogress"
          updates.reviewer_id = null;
          break;
        case "approve":
          updates.reviewed_at = new Date().toISOString();
          updates.status = "approved"
          updates.reviewer_id = req.user.id;
          
          await Notifications.createNotification("success", `Task item #${taskItemId} was approved by ${req.user.name}.`)

          break;
        case "reject":
          updates.status = "rejected"
          updates.reviewed_at = new Date().toISOString();
          updates.reviewer_id = req.user.id;
          break;
        case "rethink":
          updates.status = "submitted"
          updates.reviewed_at = null;
          updates.reviewer_id = null;
          break;
        case "submit":
          updates.status = "submitted"
          updates.submitted_at = new Date().toISOString();
          updates.submitter_id = req.user.id;
          break;
        case "submitUndo":
          updates.status = "inprogress"
          updates.submitted_at = null;
          updates.submitter_id = null;
          break;
      }

      const updatedTaskItem = await TaskItem.update(taskItemId, updates, qTaskItem.full);

      res.json({success: true, message: "", data: {status: updates.status}});
  } catch (error) {
      console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
      res.status(500).json({ success: false, message: error.message });
  }
}

exports.uploadPhotos = async (req, res) => {
    try {
      const { photoType } = req.params;
      const { taskItemId } = req.body;
      const uploadedPhotos = req.files.uploadedPhotos;

      if(!taskItemId) throw new Error("Missing taskItemId in uploadPhoto");
      if(!uploadedPhotos.length) throw new Error("No uploadedPhotos.")

      const entries = [];

      uploadedPhotos.forEach((photo) => {
        const entry = {}
        entry.task_item_id = taskItemId;
        entry.original_path = photo.originalPath;
        entry.thumbnail_path = photo.thumbnailPath;
        entry.scaled_path = photo.scaledPath;
        entries.push(entry)
      });
      

      let newPhotos = {};
      
      if(photoType === "reference") {
        newPhotos = await TaskItemReferencePhotos.insertMany(entries, `id, original_path, thumbnail_path, scaled_path`);
      } else if (photoType === "submitted") {
        newPhotos = await TaskItemSubmittedPhotos.insertMany(entries, `id, original_path, thumbnail_path, scaled_path`);
      }
      
      
      res.json({success: true, message: "", data: newPhotos});
  } catch (error) {
      console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
      res.status(500).json({success: false, message: error.message});
  }
}

exports.uploadVideos = async (req, res) => {
  try {
    const { videoType } = req.params;
    const { taskItemId, videoLink } = req.body;
    const uploadedVideos = req.files?.uploadedVideos || null;

    if(!taskItemId) throw new Error("Missing taskItemId in uploadVideo");

    const entries = []

    if(uploadedVideos) {
      uploadedVideos.forEach((video) => {
        const entry = {}
        entry.task_item_id = taskItemId;
        entry.video_link = video.originalPath;
        entries.push(entry)
      });
    }
    else if (videoLink !== undefined) {
      entries.push({
        task_item_id: taskItemId,
        video_link: videoLink
      })
    }

    let newVideos = {};
    if(videoType === "reference") {
      newVideos = await TaskItemReferenceVideos.insertMany(entries, "id, video_link, video_desc_en, video_desc_zh");
    } else if (videoType === "submitted") {
      // newVideos = await TaskItemSubmittedVideos.delete(photoId, "original_path, thumbnail_path, scaled_path");
    }

    res.json({success: true, message: "", data: newVideos});
  } catch (error) {
      console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
      res.status(500).json({success: false, message: error.message});
  }
}

exports.deletePhoto = async (req, res) => {
  try {
    const { photoType, photoId } = req.params;

    let targetScaledPath = "";
    let targetThumbnailPath = "";
    let targetOriginalPath = "";

    let photoInfo = {}
    if(photoType === "reference") {
      photoInfo = await TaskItemReferencePhotos.delete(photoId, "original_path, thumbnail_path, scaled_path");
    } else if (photoType === "submitted") {
      photoInfo = await TaskItemSubmittedPhotos.delete(photoId, "original_path, thumbnail_path, scaled_path");
    }

    if (photoInfo.scaled_path) targetScaledPath = path.join(BASE_PATH, photoInfo.scaled_path);
    if (photoInfo.thumbnail_path) targetThumbnailPath = path.join(BASE_PATH, photoInfo.thumbnail_path);
    if (photoInfo.original_path) targetOriginalPath = path.join(BASE_PATH, photoInfo.original_path);

    const deletePromises = [];

    if(targetScaledPath) deletePromises.push(deleteFile(targetScaledPath))
    if(targetThumbnailPath) deletePromises.push(deleteFile(targetThumbnailPath))
    if(targetOriginalPath) deletePromises.push(deleteFile(targetOriginalPath))

    await Promise.allSettled(deletePromises);

    res.json({success: true, message: "", data: []});
  } catch (error) {
      console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
      res.status(500).json({success: false, message: error.message});
  }
}





exports.updateVideo = async (req, res) => {
  try {
      const { videoType, videoId } = req.params;
      const { video_link, video_desc_en, video_desc_zh } = req.body;
      const { reference_videos } = req.body;

      if(videoId === "multiple") {
        const updatePromisesArray = reference_videos.map(({ id, ...updates }) => {
          return TaskItemReferenceVideos.update(id, updates);
        });
        
        await Promise.all(updatePromisesArray);
      } else {
        const updates = {};
        updates.video_link = video_link;
        updates.video_desc_en = video_desc_en;
        updates.video_desc_zh = video_desc_zh;
  
        await TaskItemReferenceVideos.update(videoId, updates);
      }

      res.json({success: true, message: "", data: []});
  } catch (error) {
      console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
      res.status(500).json({ success: false, message: error.message });
  }
}




exports.deleteVideo = async (req, res) => {
  try {
    const { videoType, videoId } = req.params;

    let videoReference = {};
    if(videoType === "reference") {
      await TaskItemReferenceVideos.delete(videoId);
    } else if (videoType === "submitted") {
      // photoInfo = await TaskItemSubmittedPhotos.delete(photoId, "original_path, thumbnail_path, scaled_path");
    }

    res.json({success: true, message: "", data: []});
  } catch (error) {
      console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
      res.status(500).json({success: false, message: error.message});
  }
}




async function deleteFile(filePath) {
  return new Promise((resolve) => {
    fs.access(filePath, fs.constants.F_OK, (err) => {
      if (err) {
        console.log(`File not found, skipping deletion: ${filePath}`);
        return resolve({ success: false, message: "File not found" });
      }

      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) {
          console.error(`Error deleting file: ${filePath}`, unlinkErr);
          return resolve({ success: false, message: "File deletion failed" });
        }
        resolve({ success: true });
      });
    });
  });
}
