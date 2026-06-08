require("dotenv").config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const app = express();
const port = 5030;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

const checklistRoutes = require("./routes/checklistRoutes");
const apiChecklistRoutes = require("./routes/apiChecklistRoutes");
const apiItemRoutes = require("./routes/apiItemRoutes");
const apiChecklistTemplateRoutes = require("./routes/apiChecklistTemplateRoutes");
const apiItemTemplateRoutes = require("./routes/apiItemTemplateRoutes");
const apiEmployeeRoutes = require("./routes/apiEmployeeRoutes");
const apiProjects = require("./routes/apiProjectsRoutes");

app.use('/checklists', checklistRoutes);
app.use('/api/checklists', apiChecklistRoutes);
app.use('/api/items', apiItemRoutes);
app.use('/api/checklist-templates', apiChecklistTemplateRoutes);
app.use('/api/item-templates', apiItemTemplateRoutes);
app.use('/api/employees', apiEmployeeRoutes);
app.use('/api/projects', apiProjects);



app.get('/photo/view', (req, res) => {
  res.sendFile(path.join(__dirname, `/pages/photo-view.html`));
});
app.get('/checklist-templates/edit', (req, res) => {
  res.sendFile(path.join(__dirname, `/pages/manager/checklist-templates-edit.html`));
});



app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});