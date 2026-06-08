const {
    Task,
    TaskUser
} = require('../../models/table.model'); 
const { q, qTask } = require('./_queries');
// =============================================
exports.getAll = async (req, res) => {
    try {
        const tasks = await Task.getAll(qTask.full);
        res.json({success: true, message: "", data: tasks});
    } catch (error) {
        console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getById = async (req, res) => {
    try {
        const { taskId } = req.params;
        const task = await Task.getById( taskId, qTask.full);
        res.json({success: true, message: "", data: task});
    } catch (error) {
        console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.create = async (req, res) => {
    try {
        const { milestoneId, taskName } = req.body;

        const newTask = await Task.insert({ name: taskName, milestone_id: milestoneId}, qTask.full);

        res.json({success: true, message: "", data: newTask});
    } catch (error) {
        console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
        res.status(500).json({ success: false, message: error.message });
    }
};


exports.update = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { taskName, milestoneId } = req.body;

        const updates = {};
        if (taskName) updates.name = taskName;
        if (milestoneId) updates.milestone_id = milestoneId;

        await Task.update(taskId, updates, qTask.full);
        res.json({success: true, message: "", data: []});
    } catch (error) {
        console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
        res.status(500).json({ success: false, message: error.message });
    }
}


exports.delete = async (req, res) => {
    try {
        const { taskId } = req.params;
        await Task.delete( taskId , qTask.full);
        res.json({success: true, message: "", data: []});
    } catch (error) {
        console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
        res.status(500).json({ success: false, message: error.message });
    }
}


exports.updateUsers = async (req, res) => {
  try {
      const { taskId } = req.params;
      const { userIds } = req.body;

      await TaskUser.deleteMany({task_id: taskId});

      if (userIds.length) {
        const newUserTasks = userIds.map((userId) => ({user_id: userId, task_id: taskId}));
        await TaskUser.insertMany(newUserTasks);
      }

      const taskUsers = await Task.getById(taskId, "users:dev_users(id, name)");

      res.json({success: true, message: "", data: taskUsers});
  } catch (error) {
      console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
      res.status(500).json({ success: false, message: error.message });
  }
}