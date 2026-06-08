require("dotenv").config();
const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const bodyParser = require("body-parser");

// Initialize Express App
const app = express();
const PORT = 5017;

// Use CORS and Body-Parser
app.use(cors());
app.use(bodyParser.json());

// Supabase Client Setup
const SUPABASE_URL = "http://137.184.148.164:8000"; // Replace with your Supabase URL
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

console.log("Initializing Supabase client...");
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
console.log("Supabase client initialized successfully!");

// Middleware to log incoming requests
app.use((req, res, next) => {
  console.log(`Incoming Request: ${req.method} ${req.url}`);
  console.log("Request Body:", req.body);
  next();
});

// Middleware to authenticate JWT token
async function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ message: "Token is required." });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const username = decoded.username;

    const { data, error } = await supabase
      .from("all_users")
      .select("token, user_manager")
      .eq("username", username)
      .single();

    if (error || !data || data.token !== token) {
      return res.status(403).json({ message: "Invalid or expired token." });
    }

    req.user = { username, user_manager: data.user_manager };
    next();
  } catch (err) {
    console.error("Token validation error:", err);
    return res.status(403).json({ message: "Invalid or expired token." });
  }
}

// Authentication endpoint
app.post("/authenticate", async (req, res) => {
  const { username, password } = req.body;

  console.log(`Login attempt: Username: ${username}`);

  try {
    const { data, error } = await supabase
      .from("all_users")
      .select("*")
      .eq("username", username)
      .eq("password", password);

    if (error || !data || data.length === 0) {
      console.warn(`Failed login attempt: Username: ${username}`);
      return res.status(401).json({ message: "Invalid username or password." });
    }

    const token = jwt.sign({ username }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    console.log(`Successful login: Username: ${username}`);

    const { error: updateError } = await supabase
      .from("all_users")
      .update({ token, status_logged: true })
      .eq("username", username);

    if (updateError) {
      console.error(
        `Failed to update token for Username: ${username}`,
        updateError
      );
      return res.status(500).json({ message: "Failed to update user token." });
    }

    res.json({ token });
  } catch (err) {
    console.error("Error authenticating user:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});

// Apply authentication middleware
app.use(authenticateToken);

// CRUD Endpoints for all_tasks

// Get all tasks
app.get("/tasks", async (req, res) => {
  try {
    const { data, error } = await supabase.from("all_tasks").select("*");
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch tasks." });
  }
});

// Get a specific task by id_specific
app.get("/tasks/:id_specific", async (req, res) => {
  const { id_specific } = req.params;
  try {
    const { data, error } = await supabase
      .from("all_tasks")
      .select("*")
      .eq("id_specific", id_specific)
      .single();
    if (error || !data) {
      return res.status(404).json({ message: "Task not found." });
    }
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch task." });
  }
});

// Create a new task
app.post("/tasks", async (req, res) => {
  const {
    id_general,
    id_specific,
    task_parents,
    task_children,
    task_creator,
    task_start_date,
    task_end_date,
    is_evergreen,
    is_untimed,
    tasks_assignments,
    material_need,
    project_parent,
    task_desc,
    is_task_done,
    color,
    tag,
    task_desc_chinese,
    task_status,
    estimated_time,
    comments,
    priority,
    attachments,
    checklists,
    percent_completed,
    is_template,
    task_shortname,
  } = req.body;

  // Optionally, validate required fields
  if (!id_specific || !task_creator || !task_desc) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  try {
    const { data, error } = await supabase.from("all_tasks").insert([
      {
        id_general,
        id_specific,
        task_parents,
        task_children,
        task_creator,
        task_start_date,
        task_end_date,
        is_evergreen,
        is_untimed,
        tasks_assignments,
        material_need,
        project_parent,
        task_desc,
        is_task_done,
        color,
        tag,
        task_desc_chinese,
        task_status,
        estimated_time,
        comments,
        priority,
        attachments,
        checklists,
        percent_completed,
        is_template,
        task_shortname,
      },
    ]);
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error("Error creating task:", error);
    res.status(500).json({ message: "Failed to create task." });
  }
});

// Update a task
app.put("/tasks/:id_specific", async (req, res) => {
  const { id_specific } = req.params;
  const {
    id_general,
    task_parents,
    task_children,
    task_creator,
    task_start_date,
    task_end_date,
    is_evergreen,
    is_untimed,
    tasks_assignments,
    material_need,
    project_parent,
    task_desc,
    is_task_done,
    color,
    tag,
    task_desc_chinese,
    task_status,
    estimated_time,
    comments,
    priority,
    attachments,
    checklists,
    percent_completed,
    is_template,
    task_shortname,
  } = req.body;

  try {
    const updateData = {
      id_general,
      task_parents,
      task_children,
      task_creator,
      task_start_date,
      task_end_date,
      is_evergreen,
      is_untimed,
      tasks_assignments,
      material_need,
      project_parent,
      task_desc,
      is_task_done,
      color,
      tag,
      task_desc_chinese,
      task_status,
      estimated_time,
      comments,
      priority,
      attachments,
      checklists,
      percent_completed,
      is_template,
      task_shortname,
    };

    const { data, error } = await supabase
      .from("all_tasks")
      .update(updateData)
      .eq("id_specific", id_specific);
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error("Error updating task:", error);
    res.status(500).json({ message: "Failed to update task." });
  }
});

// Delete a task
app.delete("/tasks/:id_specific", async (req, res) => {
  const { id_specific } = req.params;
  try {
    const { data, error } = await supabase
      .from("all_tasks")
      .delete()
      .eq("id_specific", id_specific);
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error("Error deleting task:", error);
    res.status(500).json({ message: "Failed to delete task." });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
