const { debugLog } = require('../../helpers/debug.helper');
const Models = require('../../models/table.model');
const Notifications = require("../sse/notifications.controller");

const modelMap = {
  project: Models.Project,
  milestone: Models.Milestone,
  task: Models.Task,
  task_checklist: Models.TaskChecklist,
  task_item: Models.TaskItem,
};

const nameMap = {
  project: {
    parent: "workshop_id",
    self: "name",
  },
  milestone: {
    parent: "project_id",
    self: "name_en"
  },
  task: {
    parent: "milestone_id",
    self: "name"
  },
  task_item: {
    parent: "task_checklist_id",
    self: "title_en"
  }
};

exports.forceComplete = async (req, res) => {
  try {
    const { entityType, entityId, undo } = req.body;

    const updates = {};
    updates.force_completed = !undo;
    updates.force_completed_at = undo ? null : new Date().toISOString();

    const Model = modelMap[entityType];

    await Model.update(entityId, updates, "id", false);

    if(entityType === "task_item" && !undo) {
      await Notifications.createNotification("warning", `Task item #${entityId} was force completed by ${req.user.name}.`)
    }
    

    res.json({ success: true, message: "", data: [] });
  } catch (error) {
    debugLog("danger", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
}


exports.factoryCreate = async (req, res) => {
  try {
    const { entityType, parentId, quantity } = req.body;

    if(!entityType || !parentId || !quantity) throw new Error("Requirements Missing!");

    const lettersArr = [];
    for (let i = 0; i < quantity; i++) {
      let str = '';
      let n = i;
      do {
        str = String.fromCharCode((n % 26) + 97) + str;
        n = Math.floor(n / 26) - 1;
      } while (n >= 0);
      if(!nameMap[entityType]) throw new Error("entityType error!")
      lettersArr.push({
        [nameMap[entityType].parent]: parentId,
        [nameMap[entityType].self]: str
      });
    }

    const Model = modelMap[entityType];

    await Model.insertMany(lettersArr);

    res.json({ success: true, message: "", data: [] });
  } catch (error) {
    console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
    res.status(500).json({ success: false, message: error.message });
  }
};