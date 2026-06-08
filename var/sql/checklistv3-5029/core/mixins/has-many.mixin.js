const checklistModel = require("../../domain/business/checklist/checklist.model");
const itemModel = require("../../domain/business/item/item.model");
const milestoneModel = require("../../domain/business/milestone/milestone.model");
const projectModel = require("../../domain/business/project/project.model");
const taskModel = require("../../domain/business/task/task.model");
const workshopModel = require("../../domain/business/workshop/workshop.model");
const thowModel = require("../../domain/business/thow/thow.model");
const submissionModel = require("../../domain/business/submission/submission.model");
const capitalize = require("../../utils/capitalize");

const modelMapping = {
  workshops: workshopModel,
  projects: projectModel,
  milestones: milestoneModel,
  tasks: taskModel,
  checklists: checklistModel,
  items: itemModel,
  thows: thowModel,
  submissions: submissionModel,
};

const hasMany = (...entities) => {
  const actions = {};
  entities.forEach((entity) => {
    actions[`index${capitalize(entity)}`] = async function (req, res) {
      const manyEntities = await this.model.findManyForeign({
        foreignModel: modelMapping[entity],
        filters: {
          [`${this.entityType}_id`]: req.params.id,
        },
        columns: "*",
      });
      res.json({
        success: true,
        message: "",
        data: manyEntities,
      });
    };
  });
  return actions;
};

module.exports = hasMany;
