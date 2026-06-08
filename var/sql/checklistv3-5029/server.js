require("dotenv").config({ path: `.env.${process.env.NODE_ENV}` });
const express = require("express");
const cookieParser = require("cookie-parser");


const { verifyToken } = require("./middleware/auth.middleware");
const { logger, loggerVerbose } = require("./middleware/logger.middleware");
const notFoundHandler = require("./middleware/not-found.middleware");
const errorHandler = require("./middleware/error-handler.middleware");
const serveSPA = require("./middleware/serve-spa.middleware");

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(logger);
app.use(express.static(__dirname + "/public"));

const authRouter = require("./domain/auth/auth.routes");
const thowRouter = require("./domain/business/thow/thow.routes");
const workshopRouter = require("./domain/business/workshop/workshop.routes");
const projectRouter = require("./domain/business/project/project.routes");
const milestoneRouter = require("./domain/business/milestone/milestone.routes");
const taskRouter = require("./domain/business/task/task.routes");
const checklistRouter = require("./domain/business/checklist/checklist.routes");
const itemRouter = require("./domain/business/item/item.routes");
const userRouter = require("./domain/user/user.routes");
const mediaRouter = require("./domain/media/media.routes");
const dynamicFieldRouter = require("./domain/dynamic-field/dynamic-field.routes");
const submissionRouter = require("./domain/business/submission/submission.routes");
const router = require("./routes");
// const entityRelationRouter = require("./domain/entity-relation/entity-relation.routes");
// const userDelegationModel = require("./domain/user-delegation/user-delegation.model");

app.use("/api/v1/auth", authRouter);
app.get("/api/v1/public", (req, res) => res.json({ data: "public" }));
app.get("/api/v1/private", verifyToken, (req, res) =>
  res.json({ data: "private" })
);

// remove middleware bypass
app.use("/api/v1", verifyToken, router); //special routes
app.use("/api/v1/thows", verifyToken, thowRouter);
app.use("/api/v1/workshops", verifyToken, workshopRouter);
app.use("/api/v1/projects", verifyToken, projectRouter);
app.use("/api/v1/milestones", verifyToken, milestoneRouter);
app.use("/api/v1/tasks", verifyToken, taskRouter);
app.use("/api/v1/checklists", verifyToken, checklistRouter);
app.use("/api/v1/items", verifyToken, itemRouter);
app.use("/api/v1/users", verifyToken, userRouter);
app.use("/api/v1/media", verifyToken, mediaRouter);
app.use("/api/v1/fields", verifyToken, dynamicFieldRouter);
app.use("/api/v1/submissions", verifyToken, submissionRouter);



// app.use("/api/v1/relations", verifyToken, entityRelationRouter);
// app.use("/api/v1/delegations", verifyToken, userDelegationModel);
// app.use("/api/v1/attachments", verifyToken, mediAttach);

app.get("/", (req, res) =>
  res.send(`
  <a href="/admin">/admin</a> </br>
  <a href="/builders">/builders</a>
  `)
);

app.use(serveSPA("/admin", "admin"));
app.use(serveSPA("/builders", "builders"));

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT_CK;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});