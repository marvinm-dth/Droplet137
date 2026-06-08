const {
    User,
    Project
} = require('../../models/table.model'); 
const { qTask, q, qProject, qMilestone, qTaskChecklist, qTaskItem } = require('./_queries');
const queryType = {
  full: ``,
  basic: `id, name`,
}
// =============================================
exports.getAll = async (req, res) => {
  try {
      const users = await User.getAll(queryType.basic);
      res.json({success: true, message: "", data: users});
  } catch (error) {
      console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
      res.status(500).json({ success: false, message: error.message });
  }
};




// AUTH USER
exports.whoami = async (req, res) => {
  try {
      const user = req.user;
      res.json({success: true, message: "", data: user});
  } catch (error) {
      console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
      res.status(500).json({ success: false, message: error.message });
  }
};

exports.getTasks = async (req, res) => {
  try {
      const user = req.user;

      const {tasks} = await User.getById(user.id, `id, name, tasks:dev_tasks(${q(qTask.full)})`);

      res.json({success: true, message: "", data: tasks});
  } catch (error) {
      console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
      res.status(500).json({ success: false, message: error.message });
  }
};

exports.getProjects = async (req, res) => {
  try {
      const user = req.user;

      const projects = await Project.getByFilter({"milestones.tasks.users.id": user.id}, `
        ${qProject.self},
        milestones:dev_milestones!inner(${qMilestone.self},
          tasks:dev_tasks!inner(${qTask.self},
            task_checklist:dev_task_checklists(${qTaskChecklist.self},
              task_items:dev_task_items(${qTaskItem.self})  
            ),
            users:dev_users!inner(id, name)
          )
        )`
      );

      res.json({success: true, message: "", data: projects});
  } catch (error) {
      console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
      res.status(500).json({ success: false, message: error.message });
  }
};