const BaseModel = require("../../core/base.model");
const Joi = require("joi");
const mediaModel = require("../media/media.model");
const { CAN_MEDIA_ATTACH_TYPES, ALLOWED_ATTACHMENT_TYPES } = require("../../core/enums");

class MediaAttachmentModel extends BaseModel {
  table = "dev_media_attachments";

  insertSchema = Joi.object({
     media_id: Joi.number().required().greater(0),
    entity_id: Joi.number().required().greater(0),
    entity_type: Joi.string()
      .valid(...CAN_MEDIA_ATTACH_TYPES)
      .required(),
      purpose: Joi.string()
      .valid(...ALLOWED_ATTACHMENT_TYPES)
      .required(),
  });

  // no update

  transformations = [];

  getMediaAttachments = async ({
    targetEntity,
    targetId,
    columns = "*",
    filters,
  }) => {
    const polyTableRecords = await this.findMany({
      filters: {
        entity_type: targetEntity,
        entity_id: targetId,
      },
    });

    const data = await mediaModel.findManyFromArray({
      columns,
      filters,
      array: polyTableRecords?.map((r) => r["media_id"]),
    });

    return data;
  };


   getAvailableMedia = async ({
    targetEntity,
    targetId,
    columns = "*",
    filters,
  }) => {
    const polyTableRecords = await this.findMany({
      filters: {
        entity_type: targetEntity,
        entity_id: targetId,
      },
    });

    const data = await mediaModel.findManyFromArrayNot({
      columns,
      filters,
      array: polyTableRecords?.map((r) => r["media_id"]),
    });

    return data;
  };
}

module.exports = new MediaAttachmentModel();
