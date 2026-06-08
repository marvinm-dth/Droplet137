// // require("dotenv").config();
// // const express = require("express");
// // const { createClient } = require("@supabase/supabase-js");
// // const cors = require("cors");
// // const bodyParser = require("body-parser");

// // // Initialize Express App
// // const app = express();
// // const PORT = 5022;

// // // Use CORS and Body-Parser
// // app.use(cors());
// // app.use(bodyParser.json());

// // // Supabase Client Setup
// // const SUPABASE_URL = process.env.SUPABASE_URL || "http://137.184.148.164:8000";
// // const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

// // console.log("Initializing Supabase client...");
// // const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
// // console.log("Supabase client initialized successfully!");

// // // Middleware to log incoming requests
// // app.use((req, res, next) => {
// //   console.log(`Incoming Request: ${req.method} ${req.url}`);
// //   console.log("Request Body:", req.body);
// //   next();
// // });

// // // CRUD Endpoints for all_tasks table

// // // POST create a new task (Relay)
// // app.post("/tasks", async (req, res) => {
// //   try {
// //     // Insert the request body directly into the database without assuming its structure
// //     const { data, error } = await supabase.from("all_tasks").insert([req.body]);
// //     if (error) throw error;
// //     res.status(201).json(data); // Relay the response from Supabase
// //   } catch (error) {
// //     res.status(500).json({ message: "Failed to create task." });
// //   }
// // });

// // // Start Server
// // app.listen(PORT, () => {
// //   console.log(`Server running on http://localhost:${PORT}`);
// // });

// require("dotenv").config();
// const express = require("express");
// const { createClient } = require("@supabase/supabase-js");
// const cors = require("cors");
// const bodyParser = require("body-parser");

// // Initialize Express App
// const app = express();
// const PORT = 5022;

// // Use CORS and Body-Parser
// app.use(cors());
// app.use(bodyParser.json());

// // Supabase Client Setup
// const SUPABASE_URL = process.env.SUPABASE_URL || "http://137.184.148.164:8000";
// const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

// console.log("Initializing Supabase client...");
// const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
// console.log("Supabase client initialized successfully!");

// // Middleware to log incoming requests
// app.use((req, res, next) => {
//   console.log(`Incoming Request: ${req.method} ${req.url}`);
//   console.log("Request Body:", req.body);
//   next();
// });

// // CRUD Endpoints for all_tasks table

// // GET all tasks (Relay)
// app.get("/tasks", async (req, res) => {
//   try {
//     const { data, error } = await supabase.from("all_tasks").select("*"); // Fetch all records
//     if (error) throw error;
//     res.json(data); // Relay the response from Supabase
//   } catch (error) {
//     res.status(500).json({ message: "Failed to fetch tasks." });
//   }
// });

// // POST create a new task (Relay)
// app.post("/tasks", async (req, res) => {
//   try {
//     // Insert the request body directly into the database without assuming its structure
//     const { data, error } = await supabase.from("all_tasks").insert([req.body]);
//     if (error) throw error;
//     res.status(201).json(data); // Relay the response from Supabase
//   } catch (error) {
//     res.status(500).json({ message: "Failed to create task." });
//   }
// });

// // PUT update a task (Relay)
// app.put("/tasks/:id_specific ", async (req, res) => {
//   const { id_specific } = req.params; // Extract the ID from the URL
//   try {
//     // Update the record by ID using the data from the request body
//     const { data, error } = await supabase
//       .from("all_tasks")
//       .update(req.body) // Use the request body directly without assuming structure
//       .eq("id", id_specific); // Match the task by ID

//     if (error) throw error;
//     res.json(data); // Relay the response from Supabase
//   } catch (error) {
//     res.status(500).json({ message: "Failed to update task." });
//   }
// });

// // DELETE a task (Relay)
// app.delete("/tasks/:id_specific ", async (req, res) => {
//   const { id_specific } = req.params; // Extract the ID from the URL
//   try {
//     const { data, error } = await supabase
//       .from("all_tasks")
//       .delete() // Perform delete operation
//       .eq("id", id_specific); // Match the task by ID

//     if (error) throw error;
//     res.json(data); // Relay the response from Supabase
//   } catch (error) {
//     res.status(500).json({ message: "Failed to delete task." });
//   }
// });

// // Start Server
// app.listen(PORT, () => {
//   console.log(`Server running on http://localhost:${PORT}`);
// });

require("dotenv").config();
const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const cors = require("cors");
const bodyParser = require("body-parser");

// Initialize Express App
const app = express();
const PORT = 5022;

// Use CORS and Body-Parser
app.use(cors());
app.use(bodyParser.json());

// Supabase Client Setup
const SUPABASE_URL = process.env.SUPABASE_URL || "http://137.184.148.164:8000";
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

// Middleware to check if the user is a manager
const checkManager = async (req, res, next) => {
  const { token } = req.headers; // Token should be passed in headers

  if (!token) {
    return res
      .status(401)
      .json({ message: "Authentication token is required." });
  }

  try {
    // Fetch the user from the `all_users` table using the provided token
    const { data, error } = await supabase
      .from("all_users")
      .select("project_manager, token")
      .eq("token", token)
      .single(); // Get a single user record matching the token

    if (error || !data) {
      return res.status(401).json({ message: "Invalid or missing token." });
    }

    // Check if the user is a project manager
    if (!data.project_manager) {
      return res
        .status(403)
        .json({ message: "Access denied. Not a project manager." });
    }

    // Attach user data to the request object for further use if needed
    req.user = data;
    next(); // Proceed to the next middleware or route handler
  } catch (error) {
    res.status(500).json({ message: "Failed to authenticate user." });
  }
};

// GET all tasks (Relay) with manager check
app.get("/tasks", checkManager, async (req, res) => {
  try {
    const { data, error } = await supabase.from("all_tasks").select("*"); // Fetch all records
    if (error) throw error;
    res.json(data); // Relay the response from Supabase
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch tasks." });
  }
});

// POST create a new task (Relay)
app.post("/tasks", checkManager, async (req, res) => {
  try {
    // Insert the request body directly into the database without assuming its structure
    const { data, error } = await supabase.from("all_tasks").insert([req.body]);
    if (error) throw error;
    res.status(201).json(data); // Relay the response from Supabase
  } catch (error) {
    res.status(500).json({ message: "Failed to create task." });
  }
});

// PUT update a task (Relay)
app.put("/tasks/:id_specific", checkManager, async (req, res) => {
  const { id_specific } = req.params; // Extract the ID from the URL
  try {
    // Update the record by ID using the data from the request body
    const { data, error } = await supabase
      .from("all_tasks")
      .update(req.body) // Use the request body directly without assuming structure
      .eq("id", id_specific); // Match the task by ID

    if (error) throw error;
    res.json(data); // Relay the response from Supabase
  } catch (error) {
    res.status(500).json({ message: "Failed to update task." });
  }
});

// DELETE a task (Relay)
app.delete("/tasks/:id_specific", checkManager, async (req, res) => {
  const { id_specific } = req.params; // Extract the ID from the URL
  try {
    const { data, error } = await supabase
      .from("all_tasks")
      .delete() // Perform delete operation
      .eq("id", id_specific); // Match the task by ID

    if (error) throw error;
    res.json(data); // Relay the response from Supabase
  } catch (error) {
    res.status(500).json({ message: "Failed to delete task." });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
