const BaseController = require("../../../core/base.controller");
const mix = require("../../../core/mixin");
const canClone = require("../../../core/mixins/can-clone.mixin");
const hasAttachments = require("../../../core/mixins/has-attachments.mixin");
const hasDynamicField = require("../../../core/mixins/has-dynamic-field.mixin");
const hasMany = require("../../../core/mixins/has-many.mixin");
const hasOne = require("../../../core/mixins/has-one.mixin");
const hasRelation = require("../../../core/mixins/has-relation.mixin");
const hasUser = require("../../../core/mixins/has-users.mixin");
const submissionModel = require("../submission/submission.model");
const itemModel = require("./item.model");

class ItemsController extends BaseController {
  model = itemModel;
  entityType = "item";
  // templateGuide = itemTemplateGuide;
  indexSubmissions = async (req, res) => {
    const userId = req.query?.userId;
    let returnData = {};

    if (userId) {
      const userSubmission = await this.model.findManyForeign({
        foreignModel: submissionModel,
        filters: { item_id: req.params.id, submitter_id: userId },
        order: ["submitted_at", { ascending: false }],
        columns:
          "*, submitter:dev_users!submitter_id(id, name), reviewer:dev_users!reviewer_id(id, name)",
      });

      returnData = userSubmission[0] || null;
    } else {
      returnData = await this.model.findManyForeign({
        foreignModel: submissionModel,
        filters: {
          [`item_id`]: req.params.id,
        },
        order: ["submitted_at", { ascending: false }],
        columns:
          "*, submitter:dev_users!submitter_id(id, name), reviewer:dev_users!reviewer_id(id, name)",
      });
    }

    res.json({
      success: true,
      message: "",
      data: returnData,
    });
  };
}

module.exports = mix(new ItemsController()).with(
  hasUser,
  hasDynamicField,
  hasRelation,
  canClone,
  hasAttachments,
  // [hasMany, "submissions"],
  [hasOne, "checklist"]
);
