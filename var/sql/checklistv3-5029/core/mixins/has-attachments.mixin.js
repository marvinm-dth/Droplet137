const mediaAttachmentModel = require("../../domain/media-attachment/media-attachment.model");

const hasAttachments = {
  async indexAttachments(req, res) {
    const users = await mediaAttachmentModel.getMediaAttachments({
      targetEntity: this.model.table,
      targetId: req.params?.id,
      filters: {
        mime: req.params?.mimeType,
      },
    });
    res.json({ success: true, message: "", data: users });
  },

  async indexAvailableMedia(req, res) {
    const users = await mediaAttachmentModel.getAvailableMedia({
      targetEntity: this.model.table,
      targetId: req.params?.id,
      filters: {
        mime: req.params?.mimeType,
      },
    });
    res.json({ success: true, message: "", data: users });
  },

  async createAttachments(req, res) {
    const newItems = await mediaAttachmentModel.insertOne({
      entry: {
        entity_type: `dev_${this.entityType}s`,
        entity_id: req.params?.id,
        media_id: req.body?.mediaId,
        purpose: req.body?.purpose,
      },
    });

    res.json({ success: true, message: "", data: newItems });
  },

  async deleteAttachments(req, res) {
    const deletedItem = await mediaAttachmentModel.deleteMany({
      filters: {
        entity_type: `dev_${this.entityType}s`,
        entity_id: req.params?.id,
        media_id: req.body?.mediaId,
        purpose: req.body?.purpose,
      },
    });
    res.json({ success: true, message: "", data: deletedItem });
  },
};

module.exports = hasAttachments;
