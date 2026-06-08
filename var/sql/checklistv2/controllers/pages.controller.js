const {
    Workshop,
    Project,
    TaskChecklist,
    Checklist,
    ChecklistTemplate,
    Task,
    User
    } = require('../models/table.model');
const { qWorkshop, q, qTask } = require('./api/_queries');

exports.adminMain = async (req, res) => {
    try {
        res.render("admin/dashboard", {});
    } catch (error) {
        res.status(500).json({success: false, message: error.message});
    }
}

exports.showProject = async (req, res) => {
    try {
        const { projectId } = req.params;
        const selectedProject = {id: projectId}
        
        const viewData = {
          selectedProject,
        }

        res.render("admin/show-project", viewData)
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.showChecklist = async (req, res) => {
    try {
        const { checklistId } = req.params;
        
        const selectedChecklist = await ChecklistTemplate.getById(checklistId, `*, items:dev_item_templates(*)`);

        const viewData = {
            selectedChecklist,
        }

        res.render("admin/show-checklist", viewData)
    } catch (error) {
        res.status(500).json({success: false, message: error.message});
    }
};

// ================ [PWA PAGES] ================ //
exports.workerMain = async (req, res) => {
    try {
        res.render("worker/dashboard", {});
    } catch (error) {
        res.status(500).json({success: false, message: error.message});
    }
}


exports.showTask = async (req, res) => {
    try {
        const { taskId } = req.params;
        // const selectedTask = {id: taskId}
        const selectedTask = await Task.getById( taskId , qTask.full);
        const viewData = {
            selectedTask,
        }

        res.render("worker/show-task", viewData)
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};


// ================ [OTHER PAGES] ================ //
exports.developer = async (req, res) => {
    try {
        const viewData = {
            
        }
        res.render("/developer", viewData);
    } catch (error) {
        res.status(500).json({success: false, message: error.message});
    }
}

exports.dataDashboard = async (req, res) => {
  try {
      res.render("databoard", {});
  } catch (error) {
      res.status(500).json({success: false, message: error.message});
  }
}

exports.dataDashboardApi = async (req, res) => {
  try {
    const workshop = await Workshop.getAll(q(qWorkshop.self, qWorkshop.downstream));

    res.json({success: true, message: "", data: workshop});
  } catch (error) {
      res.status(500).json({success: false, message: error.message});
  }
}

exports.watcher = async (req, res) => {
    try {
        res.render("admin/watcher", {});
    } catch (error) {
        res.status(500).json({success: false, message: error.message});
    }
}




function makeTreantNodeStructure(everyWorkshop) {
    
    const mapTaskItems = (taskItems) => {
        if(!taskItems) return null;
        return taskItems.map(({ template, status }) => ({
            text: { name: template.title_en, title: `Status: ${status}`
        }}))
    }

    const mapTaskChecklist = (taskChecklist) => {
        if(!taskChecklist.length) return null;
        return taskChecklist.map(({ template, task_items }) => ({
            text: { name: template.name_en },
            stackChildren: true,
            collapsable: true,
            children: mapTaskItems(task_items),
        }));
    };


    const mapTasks = (tasks) => {
        if(!tasks.length) return null;
        return tasks.map(({ name, task_checklist }) => ({
            text: { name },
            stackChildren: true,
            collapsable: true,
            children: mapTaskChecklist(task_checklist),
        }));
    }
        

    const mapMilestones = (milestones) => {
        if(!milestones.length) return null;
        return milestones.map(({ name, tasks }) => ({
            text: { name },
            stackChildren: true,
            collapsable: true,
            children: mapTasks(tasks),
        }));
    }
        

    const mapProjects = (projects) => {
        if(!projects.length) return null;
        return projects.map(({ tracking_id, model, milestones }) => ({
            text: { name: tracking_id, title: model?.name },
            stackChildren: true,
            collapsable: true,
            children: mapMilestones(milestones),
        }));
    }

    if(!everyWorkshop.length) return {};

    return {
        text: "root",
        children: everyWorkshop.map(({ name, projects }) => ({
            text: { name },
            stackChildren: true,
            collapsable: true,
            children: mapProjects(projects),
        })),
    };
}