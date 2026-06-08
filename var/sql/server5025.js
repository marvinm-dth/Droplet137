require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const port = process.env.PORT || 5025;

// Middleware
app.use(
  cors({
    origin: "*", // Be cautious with this in production. Specify allowed origins instead.
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log("Request Headers:", req.headers);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log("Request Body:", req.body);
  }
  next();
});

// Supabase Client using the anon key
const supabaseUrl = "http://137.184.148.164:8000";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ========== CRUD for Employees ==========

// Create a new employee
app.post("/employees", async (req, res) => {
  console.log("Creating new employee:", req.body);
  const { data, error } = await supabase.from("all_employees").insert(req.body);

  if (error) {
    console.error("Error creating employee:", error);
    res.status(400).json({ error: error.message });
  } else {
    console.log("Employee created successfully:", data);
    res.status(201).json(data);
  }
});

// Read all employees
app.get("/employees", async (req, res) => {
  console.log("Fetching all employees");
  const { data, error } = await supabase.from("all_employees").select("*");

  if (error) {
    console.error("Error fetching employees:", error);
    res.status(400).json({ error: error.message });
  } else {
    console.log(`Fetched ${data.length} employees`);
    res.json(data);
  }
});

app.get("/employees/employee_id/:employee_id", async (req, res) => {
  const { employee_id } = req.params;
  console.log(`Fetching employee with employee_id: ${employee_id}`);
  const { data, error } = await supabase
    .from("all_employees")
    .select("*")
    .eq("employee_id", employee_id)
    .single();

  if (error) {
    console.error(
      `Error fetching employee with employee_id ${employee_id}:`,
      error
    );
    res.status(404).json({ error: "Employee not found" });
  } else {
    console.log("Employee found:", data);
    res.json(data);
  }
});

// Read a single employee by ID
app.get("/employees/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`Fetching employee with ID: ${id}`);
  const { data, error } = await supabase
    .from("all_employees")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error(`Error fetching employee with ID ${id}:`, error);
    res.status(404).json({ error: "Employee not found" });
  } else {
    console.log("Employee found:", data);
    res.json(data);
  }
});

// Update an employee
app.put("/employees/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`Updating employee with ID: ${id}`, req.body);
  const { data, error } = await supabase
    .from("all_employees")
    .update(req.body)
    .eq("id", id);

  if (error) {
    console.error(`Error updating employee with ID ${id}:`, error);
    res.status(400).json({ error: error.message });
  } else {
    console.log("Employee updated successfully:", data);
    res.json(data);
  }
});

app.put("/employees/employee_id/:employee_id", async (req, res) => {
  const { employee_id } = req.params;
  console.log(`Updating employee with employee_id: ${employee_id}`, req.body);
  const { data, error } = await supabase
    .from("all_employees")
    .update(req.body)
    .eq("employee_id", employee_id);

  if (error) {
    console.error(
      `Error updating employee with employee_id ${employee_id}:`,
      error
    );
    res.status(400).json({ error: error.message });
  } else {
    console.log("Employee updated successfully:", data);
    res.json(data);
  }
});

// Delete an employee
app.delete("/employees/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`Deleting employee with ID: ${id}`);
  const { data, error } = await supabase
    .from("all_employees")
    .delete()
    .eq("id", id);

  if (error) {
    console.error(`Error deleting employee with ID ${id}:`, error);
    res.status(400).json({ error: error.message });
  } else {
    console.log("Employee deleted successfully:", data);
    res.json({ message: "Employee deleted", data });
  }
});

// ========== CRUD for Projects ==========

// Create a new project
app.post("/projects", async (req, res) => {
  console.log("Creating new project:", req.body);
  const { data, error } = await supabase.from("all_projects").insert(req.body);

  if (error) {
    console.error("Error creating project:", error);
    res.status(400).json({ error: error.message });
  } else {
    console.log("Project created successfully:", data);
    res.status(201).json(data);
  }
});

// Read all projects
// app.get("/projects", async (req, res) => {
//   console.log("Fetching all projects");
//   const { data, error } = await supabase.from("all_projects").select("*");

//   if (error) {
//     console.error("Error fetching projects:", error);
//     res.status(400).json({ error: error.message });
//   } else {
//     console.log(`Fetched ${data.length} projects`);
//     res.json(data);
//   }
// });

// Read all projects or filter by project_name
app.get("/projects", async (req, res) => {
  const { project_name } = req.query;

  if (project_name) {
    console.log(`Fetching project with name: ${project_name}`);
    const { data, error } = await supabase
      .from("all_projects")
      .select("*")
      .eq("project_name", project_name)
      .single();

    if (error) {
      console.error(`Error fetching project with name ${project_name}:`, error);
      res.status(404).json({ error: "Project not found" });
    } else {
      console.log("Project found:", data);
      res.json(data);
    }
  } else {
    console.log("Fetching all projects");
    const { data, error } = await supabase.from("all_projects").select("*");

    if (error) {
      console.error("Error fetching projects:", error);
      res.status(400).json({ error: error.message });
    } else {
      console.log(`Fetched ${data.length} projects`);
      res.json(data);
    }
  }
});

// Read a single project by ID
app.get("/projects/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`Fetching project with ID: ${id}`);
  const { data, error } = await supabase
    .from("all_projects")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error(`Error fetching project with ID ${id}:`, error);
    res.status(404).json({ error: "Project not found" });
  } else {
    console.log("Project found:", data);
    res.json(data);
  }
});

// Update a project
app.put("/projects/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`Updating project with ID: ${id}`, req.body);
  const { data, error } = await supabase
    .from("all_projects")
    .update(req.body)
    .eq("id", id);

  if (error) {
    console.error(`Error updating project with ID ${id}:`, error);
    res.status(400).json({ error: error.message });
  } else {
    console.log("Project updated successfully:", data);
    res.json(data);
  }
});

// Delete a project
app.delete("/projects/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`Deleting project with ID: ${id}`);
  const { data, error } = await supabase
    .from("all_projects")
    .delete()
    .eq("id", id);

  if (error) {
    console.error(`Error deleting project with ID ${id}:`, error);
    res.status(400).json({ error: error.message });
  } else {
    console.log("Project deleted successfully:", data);
    res.json({ message: "Project deleted", data });
  }
});

// ========== CRUD for Tasks ==========

// Create a new task
app.post("/tasks", async (req, res) => {
  console.log("Creating new task:", req.body);
  const { data, error } = await supabase.from("all_tasks").insert(req.body);

  if (error) {
    console.error("Error creating task:", error);
    res.status(400).json({ error: error.message });
  } else {
    console.log("Task created successfully:", data);
    res.status(201).json(data);
  }
});

// Read all tasks
// app.get("/tasks", async (req, res) => {
//   console.log("Fetching all tasks");
//   const { data, error } = await supabase.from("all_tasks").select("*");

//   if (error) {
//     console.error("Error fetching tasks:", error);
//     res.status(400).json({ error: error.message });
//   } else {
//     console.log(`Fetched ${data.length} tasks`);
//     res.json(data);
//   }
// });

// Read all tasks or filter by project_parent (project name)
app.get("/tasks", async (req, res) => {
  const { project_parent } = req.query;

  if (project_parent) {
    console.log(`Fetching tasks for project with parent: ${project_parent}`);
    const { data, error } = await supabase
      .from("all_tasks")
      .select("*")
      .eq("project_parent", project_parent); // Use project_parent column for filtering

    if (error) {
      console.error(
        `Error fetching tasks for project with parent ${project_parent}:`,
        error
      );
      res.status(400).json({ error: error.message });
    } else if (data.length === 0) {
      res.status(404).json({ error: "No tasks found for this project" });
    } else {
      console.log(
        `Fetched ${data.length} tasks for project with parent ${project_parent}`
      );
      res.json(data);
    }
  } else {
    console.log("Fetching all tasks");
    const { data, error } = await supabase.from("all_tasks").select("*");

    if (error) {
      console.error("Error fetching tasks:", error);
      res.status(400).json({ error: error.message });
    } else {
      console.log(`Fetched ${data.length} tasks`);
      res.json(data);
    }
  }
});

// Read a single task by ID
app.get("/tasks/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`Fetching task with ID: ${id}`);
  const { data, error } = await supabase
    .from("all_tasks")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error(`Error fetching task with ID ${id}:`, error);
    res.status(404).json({ error: "Task not found" });
  } else {
    console.log("Task found:", data);
    res.json(data);
  }
});

// Fetch a single task by id_specific
app.get("/tasks/id_specific/:id_specific", async (req, res) => {
  const { id_specific } = req.params;
  console.log(`Fetching task with id_specific: ${id_specific}`);

  const { data, error } = await supabase
    .from("all_tasks")
    .select("*")
    .eq("id_specific", id_specific)
    .single();

  if (error) {
    console.error(
      `Error fetching task with id_specific ${id_specific}:`,
      error
    );
    res.status(404).json({ error: "Task not found" });
  } else {
    console.log("Task found:", data);
    res.json(data);
  }
});

app.put("/tasks/id_specific/:id_specific", async (req, res) => {
  const { id_specific } = req.params;
  const updatedData = req.body;
  console.log(`Updating task with id_specific: ${id_specific}`);

  const { data, error } = await supabase
    .from("all_tasks")
    .update(updatedData)
    .eq("id_specific", id_specific)
    .single();

  if (error) {
    console.error(
      `Error updating task with id_specific ${id_specific}:`,
      error
    );
    res.status(400).json({ error: "Failed to update task" });
  } else {
    console.log("Task updated successfully:", data);
    res.json(data);
  }
});

// Update a task
app.put("/tasks/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`Updating task with ID: ${id}`, req.body);
  const { data, error } = await supabase
    .from("all_tasks")
    .update(req.body)
    .eq("id", id);

  if (error) {
    console.error(`Error updating task with ID ${id}:`, error);
    res.status(400).json({ error: error.message });
  } else {
    console.log("Task updated successfully:", data);
    res.json(data);
  }
});

// Delete a task
app.delete("/tasks/id_specific/:id_specific", async (req, res) => {
  const { id_specific } = req.params;
  console.log(`Deleting task with ID: ${id_specific}`);
  const { data, error } = await supabase
    .from("all_tasks")
    .delete()
    .eq("id_specific", id_specific);

  if (error) {
    console.error(`Error deleting task with ID ${id_specific}:`, error);
    res.status(400).json({ error: error.message });
  } else {
    console.log("Task deleted successfully:", data);
    res.json({ message: "Task deleted", data });
  }
});

app.delete("/tasks/id_generic/:id_generic", async (req, res) => {
  const { id_specific } = req.params;
  console.log(`Deleting task with ID: ${id_specific}`);
  const { data, error } = await supabase
    .from("all_tasks")
    .delete()
    .eq("id_specific", id_specific);

  if (error) {
    console.error(`Error deleting task with ID ${id}:`, error);
    res.status(400).json({ error: error.message });
  } else {
    console.log("Task deleted successfully:", data);
    res.json({ message: "Task deleted", data });
  }
});

// DELETE by employee_id  ── matches the URL your front-end calls
app.delete("/employees/employee_id/:employee_id", async (req, res) => {
  const { employee_id } = req.params;

  const { data, error } = await supabase
    .from("all_employees")
    .delete()
    .eq("employee_id", employee_id);

  if (error) {
    console.error(`Delete failed for ${employee_id}:`, error);
    return res.status(400).json({ error: error.message });
  }

  res.json({ message: "Employee deleted", data });
});


app.get("/tasks/assigned_to/:employee_id", async (req, res) => {
  const { employee_id } = req.params;

  console.log(`Fetching tasks assigned to employee ID: ${employee_id}`);

  // Ensure employee_id is a string
  const formattedEmployeeId = String(employee_id);

  const { data, error } = await supabase
    .from("all_tasks")
    .select("*")
    .contains("task_assignments", [formattedEmployeeId]); // Ensure it's an array of strings

  console.log("Query response:", { data, error });

  if (error) {
    console.error(
      `Error fetching tasks assigned to employee ID ${employee_id}:`,
      error
    );
    res.status(400).json({ error: error.message });
  } else if (data.length === 0) {
    res.status(404).json({ error: "No tasks found for this employee" });
  } else {
    console.log(
      `Fetched ${data.length} tasks assigned to employee ID ${employee_id}`
    );
    res.json(data);
  }
});

// Serve static files from the 'public' directory
app.use(express.static("public"));

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
