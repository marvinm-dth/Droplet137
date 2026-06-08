require("dotenv").config();
const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const bodyParser = require("body-parser");

// Initialize Express App
const app = express();
const PORT = 5019;

// Use CORS and Body-Parser
app.use(cors());
app.use(bodyParser.json());

// Supabase Client Setup
const SUPABASE_URL = "http://137.184.148.164:8000";
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

// Middleware to check JWT and user role
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

// Middleware to check if user is a user manager
function checkUserManager(req, res, next) {
  if (!req.user || !req.user.user_manager) {
    return res
      .status(403)
      .json({ message: "Permission denied. User is not a manager." });
  }
  next();
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

// CRUD Endpoints for User Management
app.use(authenticateToken);

// Get all users
app.get("/users", checkUserManager, async (req, res) => {
  try {
    const { data, error } = await supabase.from("all_users").select("*");
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch users." });
  }
});

// Create a new user
app.post("/users", checkUserManager, async (req, res) => {
  const {
    eid,
    username,
    email,
    password,
    sites_access_level,
    is_techdumb,
    user_manager,
    project_manager,
    is_user_jacob,
    it_access,
    status_logged,
    login_duration,
  } = req.body;
  try {
    const { data, error } = await supabase.from("all_users").insert([
      {
        eid,
        username,
        email,
        password,
        sites_access_level,
        is_techdumb,
        user_manager,
        project_manager,
        is_user_jacob,
        it_access,
        status_logged,
        login_duration,
      },
    ]);
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to create user." });
  }
});

// Update a user
app.put("/users/:eid", checkUserManager, async (req, res) => {
  const { eid } = req.params;
  const {
    username,
    email,
    password,
    sites_access_level,
    is_techdumb,
    user_manager,
    project_manager,
    is_user_jacob,
    it_access,
    status_logged,
    login_duration,
  } = req.body;
  try {
    const updateData = {
      username,
      email,
      sites_access_level,
      is_techdumb,
      user_manager,
      project_manager,
      is_user_jacob,
      it_access,
      status_logged,
      login_duration,
    };
    if (password) updateData.password = password;
    const { data, error } = await supabase
      .from("all_users")
      .update(updateData)
      .eq("eid", eid);
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to update user." });
  }
});

// Delete a user
app.delete("/users/:eid", checkUserManager, async (req, res) => {
  const { eid } = req.params;
  try {
    const { data, error } = await supabase
      .from("all_users")
      .delete()
      .eq("eid", eid);
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to delete user." });
  }
});

// Additional Endpoint for fetching all employees
app.get("/employees", authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from("all_employees").select("*");
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch employee data." });
  }
});

// Endpoint to get employee_id and all_tasks_assigned for all employees
app.get("/employees-tasks", authenticateToken, async (req, res) => {
  try {
    // Select employee_id and all_tasks_assigned fields
    const { data, error } = await supabase
      .from("all_employees")
      .select("employee_id, all_tasks_assigned");

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch employee tasks." });
  }
});

// Endpoint to get employee shortname and task details
// Endpoint to get employee shortname and task details
app.get("/employees-with-tasks", authenticateToken, async (req, res) => {
  try {
    // Fetch all employees with employee_id, shortname, and assigned tasks
    const { data: employees, error: employeeError } = await supabase
      .from("all_employees")
      .select("employee_id, employee_shortname, all_tasks_assigned");

    if (employeeError) throw employeeError;

    // Prepare a response structure
    let employeeTasks = [];

    // Iterate over each employee
    for (let employee of employees) {
      const { employee_id, employee_shortname, all_tasks_assigned } = employee;

      // If the employee has tasks assigned
      if (all_tasks_assigned && all_tasks_assigned.length > 0) {
        // Fetch details for each task assigned to the employee
        const { data: tasks, error: tasksError } = await supabase
          .from("all_tasks")
          .select("*") // Select all fields from the task table
          .in("id_specific", all_tasks_assigned); // Use the 'in' operator to match task IDs

        if (tasksError) throw tasksError;

        // Log all task details for debugging
        console.log(`Tasks for employee ${employee_shortname}:`, tasks);

        // Add employee info and their associated tasks to the result
        employeeTasks.push({
          employee_shortname,
          tasks, // Include the task details here
        });
      } else {
        // If no tasks are assigned, still add the employee without tasks
        employeeTasks.push({
          employee_shortname,
          tasks: [], // No tasks
        });
      }
    }

    // Send the result back to the client
    res.json(employeeTasks);
  } catch (error) {
    console.error("Error fetching employee tasks:", error);
    res.status(500).json({ message: "Failed to fetch employee tasks." });
  }
});

// Endpoint to get employee_id, shortname, all_tasks_assigned, and task details for each employee
// app.get("/employees-tasks-details", authenticateToken, async (req, res) => {
//   try {
//     // Fetch employee details including task assignments
//     const { data: employees, error: employeeError } = await supabase
//       .from("all_employees")
//       .select("employee_id, employee_shortname, all_tasks_assigned");

//     if (employeeError) throw employeeError;

//     // Prepare the result object with employee details and their tasks
//     const employeeTasksDetails = [];

//     // Loop through each employee to fetch the task details
//     for (const employee of employees) {
//       const tasks = [];

//       // Fetch each task's details from all_tasks table
//       for (const taskId of employee.all_tasks_assigned) {
//         const { data: taskData, error: taskError } = await supabase
//           .from("all_tasks")
//           .select("*")
//           .eq("id_specific", taskId)
//           .single();

//         if (taskError) {
//           console.error(`Error fetching task ${taskId}:`, taskError);
//         } else {
//           tasks.push(taskData); // Add task details to the employee's task list
//         }
//       }

//       // Add the employee and their tasks to the final result
//       employeeTasksDetails.push({
//         employee_shortname: employee.employee_shortname,
//         tasks,
//       });
//     }

//     res.json(employeeTasksDetails); // Send the final combined data
//   } catch (error) {
//     console.error("Error fetching employee tasks and details:", error);
//     res.status(500).json({ message: "Failed to fetch employee tasks." });
//   }
// });

// Endpoint to get employee_id, shortname, all_tasks_assigned, and task details for each employee
app.get("/employees-tasks-details", authenticateToken, async (req, res) => {
  try {
    // Fetch employee details including task assignments
    const { data: employees, error: employeeError } = await supabase
      .from("all_employees")
      .select("employee_id, employee_shortname, all_tasks_assigned");

    if (employeeError) throw employeeError;

    // Prepare the result object with employee details and their tasks
    const employeeTasksDetails = [];

    // Loop through each employee to fetch the task details
    for (const employee of employees) {
      const tasks = [];

      // Fetch each task's details from all_tasks table
      for (const taskId of employee.all_tasks_assigned) {
        const { data: taskData, error: taskError } = await supabase
          .from("all_tasks")
          .select("*")
          .eq("id_specific", taskId)
          .single();

        if (taskError) {
          console.error(`Error fetching task ${taskId}:`, taskError);
        } else {
          tasks.push(taskData); // Add task details to the employee's task list
        }
      }

      // Add the employee and their tasks to the final result
      employeeTasksDetails.push({
        employee_id: employee.employee_id, // Include employee_id
        employee_shortname: employee.employee_shortname,
        tasks,
      });
    }

    res.json(employeeTasksDetails); // Send the final combined data
  } catch (error) {
    console.error("Error fetching employee tasks and details:", error);
    res.status(500).json({ message: "Failed to fetch employee tasks." });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
