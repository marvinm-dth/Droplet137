require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const port = 5016;

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

// CRUD for all_tags

// Create a new tag
app.post("/tags", async (req, res) => {
  const { data, error } = await supabase.from("all_tags").insert(req.body);

  if (error) {
    res.status(400).json({ error: error.message });
  } else {
    res.status(201).json(data);
  }
});

// Read all tags
app.get("/tags", async (req, res) => {
  const { data, error } = await supabase.from("all_tags").select("*");
  console.log(data);
  if (error) {
    res.status(400).json({ error: error.message });
  } else {
    res.json(data);
  }
});

// Read a single tag by ID
app.get("/tags/:id", async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from("all_tags")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    res.status(404).json({ error: "Tag not found" });
  } else {
    res.json(data);
  }
});

// Update a tag
app.put("/tags/:id", async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from("all_tags")
    .update(req.body)
    .eq("id", id);

  if (error) {
    res.status(400).json({ error: error.message });
  } else {
    res.json(data);
  }
});

// Delete a tag
app.delete("/tags/:id", async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase.from("all_tags").delete().eq("id", id);

  if (error) {
    res.status(400).json({ error: error.message });
  } else {
    res.json({ message: "Tag deleted", data });
  }
});

// Serve static files from the 'public' directory
app.use(express.static("public"));

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
