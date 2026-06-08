const checklistModel = require("../../domain/business/checklist/checklist.model");
const itemModel = require("../../domain/business/item/item.model");
const milestoneModel = require("../../domain/business/milestone/milestone.model");
const projectModel = require("../../domain/business/project/project.model");
const taskModel = require("../../domain/business/task/task.model");
const workshopModel = require("../../domain/business/workshop/workshop.model");
const capitalize = require("../../utils/capitalize");

const modelMapping = {
  workshop: workshopModel,
  project: projectModel,
  milestone: milestoneModel,
  task: taskModel,
  checklist: checklistModel,
  item: itemModel,
};

const hasOne = (...entities) => {
  const actions = {};
  entities.forEach((entity) => {
    actions[`show${capitalize(entity)}`] = async function (req, res) {

      const oneEntity = await this.model.findOneForeign({
        foreignModel: modelMapping[entity],
        internalKey: req.params.id,
        foreignInternalKey: `${entity}_id`,
      });

      res.json({
        success: true,
        message: "",
        data: oneEntity,
      });
    };
  });
  return actions;
};

module.exports = hasOne;
