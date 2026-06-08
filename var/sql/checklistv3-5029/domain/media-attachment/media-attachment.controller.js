const BaseController = require("../../core/base.controller");
const mediaModel = require("./media-attachment.model");
const mediaService = require("./media-attachment.service");

class MediaAttachmentsController extends BaseController {
  model = mediaModel;
  /**
   * index = async (req, res) => {};
   * show = async (req, res) => {};
   * create = async (req, res) => {};
   * update = async (req, res) => {};
   * delete = async (req, res) => {};
  */
}

module.exports = new MediaAttachmentsController();
