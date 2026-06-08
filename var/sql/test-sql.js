const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const cors = require("cors");
const bodyParser = require("body-parser");

// Initialize Express App
const app = express();
const PORT = 5010;

// Use CORS and Body-Parser
app.use(cors());
app.use(bodyParser.json());

// Supabase Client Setup
const SUPABASE_URL = "http://137.184.148.164:8000"; // Replace with your Supabase URL
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || "";

console.log("Initializing Supabase client...");
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
console.log("Supabase client initialized successfully!");

// Middleware to log incoming requests
app.use((req, res, next) => {
  console.log(`Incoming Request: ${req.method} ${req.url}`);
  console.log("Request Body:", req.body);
  next();
});

// GET all tasks
app.get("/tasks", async (req, res) => {
  console.log("Fetching all tasks...");
  const { data, error } = await supabase.from("all_tasks").select("*");

  if (error) {
    console.error("Error fetching tasks:", error.message);
    return res.status(500).json({ error: error.message });
  }

  console.log("Tasks fetched successfully:", data);
  res.json(data);
});

// CREATE a new task
app.post("/tasks", async (req, res) => {
  const taskData = req.body;
  console.log("Creating a new task:", taskData);

  const { data, error } = await supabase.from("all_tasks").insert([taskData]);

  if (error) {
    console.error("Error creating task:", error.message);
    return res.status(500).json({ error: error.message });
  }

  console.log("Task created successfully:", data);
  res.status(201).json(data);
});

// UPDATE a task
app.put("/tasks/:id", async (req, res) => {
  const { id } = req.params;
  const taskData = req.body;
  console.log(`Updating task with ID ${id}:`, taskData);

  const { data, error } = await supabase
    .from("all_tasks")
    .update(taskData)
    .eq("id", id);

  if (error) {
    console.error("Error updating task:", error.message);
    return res.status(500).json({ error: error.message });
  }

  console.log(`Task with ID ${id} updated successfully:`, data);
  res.json(data);
});

// DELETE a task
app.delete("/tasks/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`Deleting task with ID ${id}...`);

  const { error } = await supabase.from("all_tasks").delete().eq("id", id);

  if (error) {
    console.error("Error deleting task:", error.message);
    return res.status(500).json({ error: error.message });
  }

  console.log(`Task with ID ${id} deleted successfully.`);
  res.status(204).send();
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://137.184.148.164:${PORT}`);
});
