
// require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
require('dotenv').config();
// const PORT = process.env.CHECKLIST_SERVER_PORT;
const PORT = 5030;

const express = require('express');
const jwt = require('jsonwebtoken');
const { setupConfig } = require('./_config');
const { authenticateToken } = require("./middleware/auth.middleware");
const { uploadPhotos, uploadVideos } = require("./middleware/multer.middleware");
const { jsonview } = require("./middleware/jsonview.middleware");


const app = express();

setupConfig(app);
app.use(jsonview);


// ========================= //
const Pages = require("./controllers/pages.controller");
const Auth = require("./controllers/auth.controller");

// const Workshops = require("./controllers/workshops.controller");

const Projects = require("./controllers/api/projects.controller");//
const Milestones = require("./controllers/api/milestones.controller");//
const Tasks = require("./controllers/api/tasks.controller");//

const TaskChecklists = require("./controllers/api/task-checklists.controller");//
const TaskItems = require("./controllers/api/task-items.controller");//

const ChecklistTemplates = require("./controllers/api/checklist-templates.controller");//
const ItemTemplates = require("./controllers/api/item-templates.controller");//

const Users = require("./controllers/api/users.controller");

const Special = require("./controllers/api/special.controller");


// Pages
app.get("/login/", Auth.login); // page
app.get("/checklists/watcher/", Pages.watcher); // page
app.get("/checklists/developer/data/", Pages.dataDashboard); // page
app.get("/checklists/api/developer/data/", Pages.dataDashboardApi); //api

app.get("/checklists/", Pages.workerMain); // page
app.get("/checklists/admin/", Pages.adminMain); // page

app.get("/checklists/:checklistId/", Pages.showChecklist); // page
app.get("/checklists/tasks/:taskId/", Pages.showTask); // page
app.get("/checklists/projects/:projectId/", Pages.showProject); // page

// AUTH API
app.get('/', (req, res) => res.redirect("/checklists/admin"));
app.post("/login/", Auth.authenticate);
app.post("/logout/", Auth.logout);

// PROJECTS API
app.get("/checklists/api/projects/", Projects.getAll);
app.post("/checklists/api/projects/", Projects.create);

app.get("/checklists/api/projects/:projectId/", Projects.getById);
app.post("/checklists/api/projects/:projectId/patch/", Projects.update);
app.post("/checklists/api/projects/:projectId/delete/", Projects.delete);

// MILESTONE API
app.get("/checklists/api/milestones/", Milestones.getAll);
app.post("/checklists/api/milestones/", Milestones.create);

app.post("/checklists/api/milestones/relationships/", Milestones.createRelationship);
app.post("/checklists/api/milestones/relationships/delete/", Milestones.deleteRelationship);
app.post("/checklists/api/milestones/relationships/patch/", Milestones.updateRelationship);

app.get("/checklists/api/milestones/:milestoneId/", Milestones.getById);
app.post("/checklists/api/milestones/:milestoneId/patch/", Milestones.update);
app.post("/checklists/api/milestones/:milestoneId/delete/", Milestones.delete);

app.post("/checklists/api/milestones/:milestoneId/users/", Milestones.updateUsers);



// TASK API
app.get("/checklists/api/tasks/", Tasks.getAll);
app.post("/checklists/api/tasks/", Tasks.create);

app.get("/checklists/api/tasks/:taskId/", Tasks.getById);
app.post("/checklists/api/tasks/:taskId/patch/", Tasks.update);
app.post("/checklists/api/tasks/:taskId/delete/", Tasks.delete);

app.post("/checklists/api/tasks/:taskId/users/", Tasks.updateUsers);


// TASK-CHECKLISTS API
app.get("/checklists/api/task-checklists/", TaskChecklists.getAll);
app.post("/checklists/api/task-checklists/", TaskChecklists.create);

app.get("/checklists/api/task-checklists/:taskChecklistId/", TaskChecklists.getById);
app.post("/checklists/api/task-checklists/:taskChecklistId/patch/", TaskChecklists.update);
app.post("/checklists/api/task-checklists/:taskChecklistId/delete/", TaskChecklists.delete);


// TASK-ITEMS API
app.get("/checklists/api/task-items/", TaskItems.getAll);
app.post("/checklists/api/task-items/", TaskItems.create);

app.post("/checklists/api/task-items/photos/:photoType/", uploadPhotos(), TaskItems.uploadPhotos);
app.post("/checklists/api/task-items/photos/:photoType/:photoId/delete/", TaskItems.deletePhoto);

app.post("/checklists/api/task-items/videos/:videoType/", uploadVideos(), TaskItems.uploadVideos);
app.post("/checklists/api/task-items/videos/:videoType/:videoId/patch/", TaskItems.updateVideo);
app.post("/checklists/api/task-items/videos/:videoType/:videoId/delete/", TaskItems.deleteVideo);

app.get("/checklists/api/task-items/:taskItemId/", TaskItems.getById);
app.post("/checklists/api/task-items/:taskItemId/patch/", TaskItems.update);
app.post("/checklists/api/task-items/:taskItemId/delete/", TaskItems.delete);

app.post("/checklists/api/task-items/:taskItemId/status/", TaskItems.updateStatus);


// CHECKLIST-TEMPLATES API
app.get("/checklists/api/checklist-templates/", ChecklistTemplates.getAll);
app.post("/checklists/api/checklist-templates/", ChecklistTemplates.create);

app.get("/checklists/api/checklist-templates/:checklistTemplateId/", ChecklistTemplates.getById);
app.post("/checklists/api/checklist-templates/:checklistTemplateId/patch/", ChecklistTemplates.update);
app.post("/checklists/api/checklist-templates/:checklistTemplateId/delete/", ChecklistTemplates.delete);

// ITEM-TEMPLATES API
app.get("/checklists/api/item-templates/", ItemTemplates.getAll);
app.post("/checklists/api/item-templates/", ItemTemplates.create);

app.get("/checklists/api/item-templates/:itemTemplateId/", ItemTemplates.getById);
app.post("/checklists/api/item-templates/:itemTemplateId/patch/", ItemTemplates.update);
app.post("/checklists/api/item-templates/:itemTemplateId/delete/", ItemTemplates.delete);


// USERS API
app.get("/checklists/api/users/", Users.getAll);


// AUTH USER APIS
app.get("/checklists/api/myself/", Users.whoami);
app.get("/checklists/api/myself/tasks/", Users.getTasks);
app.get("/checklists/api/myself/projects/", Users.getProjects);



// SPECIAL APIS
app.post("/checklists/api/special/force/", Special.forceComplete);
app.post("/checklists/api/special/factory/", Special.factoryCreate);


// SERVER SENT EVENTS (SSE)
const Notifications = require("./controllers/sse/notifications.controller");
app.get('/checklists/sse/notifications/', Notifications.subscribe);
const { Project, Milestone } = require("./models/table.model");
const { qMilestone, qProject } = require('./controllers/api/_queries');

app.get("/checklists/api/test/", async (req, res) => {

  try {
    const result = await Project.getAll(qProject.full);
    res.json(result)
  } catch (error) {
    res.json({error: error.message})
  }
});

// ========================= //

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
