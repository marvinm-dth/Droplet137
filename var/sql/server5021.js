

// require("dotenv").config();
// const express = require("express");
// const { createClient } = require("@supabase/supabase-js");
// const jwt = require("jsonwebtoken");
// const cors = require("cors");
// const bodyParser = require("body-parser");

// // Initialize Express App
// const app = express();
// const PORT = 5021;

// // Use CORS and Body-Parser
// app.use(cors());
// app.use(bodyParser.json());

// // Supabase Client Setup
// const SUPABASE_URL = "http://137.184.148.164:8000";
// const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

// console.log("Initializing Supabase client...");
// const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
// console.log("Supabase client initialized successfully!");

// // At the top of your file, require the additional modules:
// const multer = require('multer');
// const fs = require('fs');
// const path = require('path');
// app.use('/media', express.static(path.join(__dirname, 'public/media')));


// // Setup multer to temporarily store uploaded files in the 'uploads' folder.
// const upload = multer({ dest: 'uploads/' });

// // ... [existing requires and configuration code] ...

// // Existing middleware and endpoints remain unchanged

// // --- New Endpoint for Sending Images/Videos ---
// // This endpoint expects a multipart/form-data request with the file field named "file"
// app.post("/conversations/:id/media", authenticateToken, upload.single('file'), async (req, res) => {
//   const conversationId = req.params.id;
//   const sender = req.user.username; // Retrieved from the authentication middleware
//   const { parent_conversation } = req.body;
//   if (!req.file) {
//     return res.status(400).json({ message: "No file uploaded." });
//   }

//   try {
//     // Generate a unique file name using a timestamp and the original name.
//     const fileName = `${Date.now()}_${req.file.originalname}`;

//     // Determine the target directory (public/media) and ensure it exists.
//     const targetDir = path.join(__dirname, 'public/media');
//     if (!fs.existsSync(targetDir)) {
//       fs.mkdirSync(targetDir, { recursive: true });
//     }
//     console.log("attempting upload");
//     // Move the file from the temporary folder to the target directory.
//     const targetPath = path.join(targetDir, fileName);
//     fs.renameSync(req.file.path, targetPath);

//     // Build a public URL for the file.
//     const publicURL = `${req.protocol}://${req.get('host')}/media/${fileName}`;

//     // Insert a new media message into the conversation.
//     const { data, error } = await supabase
//       .from("orca_conversations")
//       .insert([
//         {
//           conversation_id: conversationId,
//           message: null, // No text message
//           owner: sender,
//           created_at: new Date().toISOString(),
//           media_url: publicURL,
//           media_type: req.file.mimetype,
//           recipients: null, // Adjust as needed based on your schema
//           roles_members: null,
//           status: "active",
//           parent_conversation
//         },
//       ]);

//     if (error) {
//       return res.status(500).json({ message: "Failed to send media message.", error });
//     }

//     res.status(201).json(data);
//   } catch (err) {
//     // Remove temporary file if an error occurs.
//     if (req.file && req.file.path) {
//       fs.unlinkSync(req.file.path);
//     }
//     console.error("Error in media upload:", err);
//     res.status(500).json({ message: "Error uploading media.", error: err });
//   }
// });


// // Middleware to log incoming requests
// app.use((req, res, next) => {
//   console.log(`Incoming Request: ${req.method} ${req.url}`);
//   console.log("Request Body:", req.body);
//   next();
// });

// // Middleware to check JWT and user role
// async function authenticateToken(req, res, next) {
//   const authHeader = req.headers["authorization"];
//   const token = authHeader && authHeader.split(" ")[1];

//   if (!token) return res.status(401).json({ message: "Token is required." });

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     const username = decoded.username;

//     const { data, error } = await supabase
//       .from("all_users")
//       .select("token, user_manager")
//       .eq("username", username)
//       .single();

//     if (error || !data || data.token !== token) {
//       return res.status(403).json({ message: "Invalid or expired token." });
//     }

//     req.user = { username, user_manager: data.user_manager };
//     next();
//   } catch (err) {
//     console.error("Token validation error:", err);
//     return res.status(403).json({ message: "Invalid or expired token." });
//   }
// }

// // Middleware to check if user is a user manager
// function checkUserManager(req, res, next) {
//   if (!req.user || !req.user.user_manager) {
//     return res
//       .status(403)
//       .json({ message: "Permission denied. User is not a manager." });
//   }
//   next();
// }

// // Authentication endpoint
// app.post("/authenticate", async (req, res) => {
//   const { username, password } = req.body;

//   console.log(`Login attempt: Username: ${username}`);

//   try {
//     const { data, error } = await supabase
//       .from("all_users")
//       .select("*")
//       .eq("username", username)
//       .eq("password", password);

//     if (error || !data || data.length === 0) {
//       console.warn(`Failed login attempt: Username: ${username}`);
//       return res.status(401).json({ message: "Invalid username or password." });
//     }

//     const token = jwt.sign({ username }, process.env.JWT_SECRET, {
//       expiresIn: "1h",
//     });

//     console.log(`Successful login: Username: ${username}`);

//     const { error: updateError } = await supabase
//       .from("all_users")
//       .update({ token, status_logged: true })
//       .eq("username", username);

//     if (updateError) {
//       console.error(
//         `Failed to update token for Username: ${username}`,
//         updateError
//       );
//       return res.status(500).json({ message: "Failed to update user token." });
//     }

//     res.json({ token });
//   } catch (err) {
//     console.error("Error authenticating user:", err);
//     res.status(500).json({ message: "Internal server error." });
//   }
// });

// // --- User Management Endpoints (Manager Only) ---

// // All endpoints below here require a valid token
// app.use(authenticateToken);

// // Get all users
// app.get("/users", checkUserManager, async (req, res) => {
//   try {
//     const { data, error } = await supabase.from("all_users").select("*");
//     if (error) throw error;
//     res.json(data);
//   } catch (error) {
//     res.status(500).json({ message: "Failed to fetch users." });
//   }
// });

// // Create a new user
// app.post("/users", checkUserManager, async (req, res) => {
//   const {
//     eid,
//     username,
//     email,
//     password,
//     sites_access_level,
//     is_techdumb,
//     user_manager,
//     project_manager,
//     is_user_jacob,
//     it_access,
//     status_logged,
//     login_duration,
//   } = req.body;
//   try {
//     const { data, error } = await supabase.from("all_users").insert([
//       {
//         eid,
//         username,
//         email,
//         password,
//         sites_access_level,
//         is_techdumb,
//         user_manager,
//         project_manager,
//         is_user_jacob,
//         it_access,
//         status_logged,
//         login_duration,
//       },
//     ]);
//     if (error) throw error;
//     res.status(201).json(data);
//   } catch (error) {
//     res.status(500).json({ message: "Failed to create user." });
//   }
// });

// // Update a user (by manager)
// app.put("/users/:eid", checkUserManager, async (req, res) => {
//   const { eid } = req.params;
//   const {
//     username,
//     email,
//     password,
//     sites_access_level,
//     is_techdumb,
//     user_manager,
//     project_manager,
//     is_user_jacob,
//     it_access,
//     status_logged,
//     login_duration,
//   } = req.body;
//   try {
//     const updateData = {
//       username,
//       email,
//       sites_access_level,
//       is_techdumb,
//       user_manager,
//       project_manager,
//       is_user_jacob,
//       it_access,
//       status_logged,
//       login_duration,
//     };
//     if (password) updateData.password = password;
//     const { data, error } = await supabase
//       .from("all_users")
//       .update(updateData)
//       .eq("eid", eid);
//     if (error) throw error;
//     res.json(data);
//   } catch (error) {
//     res.status(500).json({ message: "Failed to update user." });
//   }
// });

// // Delete a user
// app.delete("/users/:eid", checkUserManager, async (req, res) => {
//   const { eid } = req.params;
//   try {
//     const { data, error } = await supabase
//       .from("all_users")
//       .delete()
//       .eq("eid", eid);
//     if (error) throw error;
//     res.json(data);
//   } catch (error) {
//     res.status(500).json({ message: "Failed to delete user." });
//   }
// });

// app.post("/validate-token", async (req, res) => {
//   const authHeader = req.headers["authorization"];
//   const token = authHeader && authHeader.split(" ")[1];

//   if (!token) {
//     return res
//       .status(401)
//       .json({ valid: false, message: "Token is required." });
//   }

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);

//     // Validate token against the database (optional, for additional security)
//     const { data, error } = await supabase
//       .from("all_users")
//       .select("username, token")
//       .eq("token", token)
//       .single();

//     if (error || !data) {
//       return res
//         .status(403)
//         .json({ valid: false, message: "Invalid or expired token." });
//     }

//     res.json({ valid: true, username: data.username });
//   } catch (err) {
//     console.error("Token validation error:", err);
//     res
//       .status(403)
//       .json({ valid: false, message: "Invalid or expired token." });
//   }
// });

// // --- Conversation Endpoints (Any Authenticated User) ---
// app.use(authenticateToken);

// // Get all conversations
// app.get("/conversations", async (req, res) => {
//   try {
//     const { data, error } = await supabase
//       .from("orca_conversations")
//       .select("*");
//     if (error) throw error;
//     res.json(data);
//   } catch (error) {
//     console.error("Failed to fetch conversations:", error);
//     res.status(500).json({ message: "Failed to fetch conversations." });
//   }
// });

// // Create a new conversation
// app.post("/conversations", async (req, res) => {
//   const { owner, roles_members, conversation_id, message, recipients, status, channel } = req.body;


//   try {
//     const { data, error } = await supabase.from("orca_conversations").insert([
//       {
//         owner,
//         roles_members,
//         conversation_id,
//         message,
//         recipients,
//         status,
//         channel
//       },
//     ]);
//     if (error) throw error;
//     res.status(201).json(data);
//   } catch (error) {
//     console.error("Failed to create conversation:", error);
//     res.status(500).json({ message: "Failed to create conversation." });
//   }
// });

// // Update a conversation
// // app.put("/conversations/:id", async (req, res) => {
// //   const { id } = req.params;
// //   const { owner, roles_members, conversation_id, message, recipients, status, alias } =
// //     req.body;

// //   try {
// //     const updateData = {
// //       owner,
// //       roles_members,
// //       conversation_id,
// //       message,
// //       recipients,
// //       status,
// //       alias
// //     };

// //     const { data, error } = await supabase
// //       .from("orca_conversations")
// //       .update(updateData)
// //       .eq("id", id);
// //     if (error) throw error;
// //     res.json(data);
// //   } catch (error) {
// //     console.error("Failed to update conversation:", error);
// //     res.status(500).json({ message: "Failed to update conversation." });
// //   }
// // });


// app.put("/conversations/:id", async (req, res) => {
//   const { id } = req.params;  // id is now something like "conv-1739882844945"
//   const { owner, roles_members, conversation_id, message, recipients, status, alias, channel } = req.body;


//   try {
//     const updateData = {
//       owner,
//       roles_members,
//       conversation_id,
//       message,
//       recipients,
//       status,
//       alias,
//       channel  // add the channel field here
//     };

//     // Update based on the conversation_id column instead of the numeric primary key "id"
//     const { data, error } = await supabase
//       .from("orca_conversations")
//       .update(updateData)
//       .eq("conversation_id", id);

//     if (error) throw error;
//     res.json(data);
//   } catch (error) {
//     console.error("Failed to update conversation:", error);
//     res.status(500).json({ message: "Failed to update conversation." });
//   }
// });

// // Delete a conversation
// app.delete("/conversations/:id", async (req, res) => {
//   const { id } = req.params;

//   try {
//     const { data, error } = await supabase
//       .from("orca_conversations")
//       .delete()
//       .eq("id", id);
//     if (error) throw error;
//     res.json(data);
//   } catch (error) {
//     console.error("Failed to delete conversation:", error);
//     res.status(500).json({ message: "Failed to delete conversation." });
//   }
// });

// // Send a message to a conversation
// app.post("/conversations/:id/messages", async (req, res) => {
//   const { id } = req.params; // Conversation ID
//   //const { message } = req.body;
//   const { message, parent_conversation } = req.body; 
//   const sender = req.user.username; // Using the username from the token

//   try {
//     const { data, error } = await supabase.from("orca_conversations").insert([
//       {
//         conversation_id: id,
//         message,
//         owner: sender, // Use the sender's username as the message owner
//         created_at: new Date().toISOString(), // Ensure the timestamp is stored
//         recipients: null, // Optional if recipients are needed
//         roles_members: null, // Optional if roles are needed
//         status: "active",
//         parent_conversation: parent_conversation,
//       },
//     ]);

//     if (error) throw error;
//     res.status(201).json(data);
//   } catch (error) {
//     console.error("Failed to send message:", error);
//     res.status(500).json({ message: "Failed to send message." });
//   }
// });

// // Get messages for a conversation
// // app.get("/conversations/:id/messages", async (req, res) => {
// //   const { id } = req.params; // Conversation ID

// //   try {
// //     const { data, error } = await supabase
// //       .from("orca_conversations")
// //       .select("*")
// //       .eq("conversation_id", id)
// //       .order("created_at", { ascending: true }); // Sort messages by timestamp

// //     if (error) throw error;
// //     res.json(data);
// //   } catch (error) {
// //     console.error("Failed to fetch messages:", error);
// //     res.status(500).json({ message: "Failed to fetch messages." });
// //   }
// // });

// // app.get("/conversations/:id/messages", async (req, res) => {
// //   const { id } = req.params;      // conversation_id

// //   try {
// //     const { data, error } = await supabase
// //       .from("orca_conversations AS m")
// //       .select(`
// //         *,
// //         quoted:orca_conversations (
// //           id,
// //           message,
// //           media_url,
// //           media_type
// //         )
// //       `)
// //       .eq("m.conversation_id", id)
// //       .order("m.created_at", { ascending: true })
// //       .leftJoin("orca_conversations AS quoted",
// //                 "quoted.id::text",
// //                 "m.parent_conversation");      // ← compare as TEXT

// //     if (error) throw error;
// //     res.json(data);
// //   } catch (err) {
// //     console.error("Failed to fetch messages:", err);
// //     res.status(500).json({ message: "Failed to fetch messages." });
// //   }
// // });
// // GET /conversations/:id/messages
// app.get("/conversations/:id/messages", async (req, res) => {
//   const { id } = req.params;                      // the thread (conversation_id)

//   try {
//     /* ── 1 ▸ pull every row in this thread ───────────────────────────── */
//     const { data: rows, error } = await supabase
//       .from("orca_conversations")
//       .select("*")
//       .eq("conversation_id", id)
//       .order("created_at", { ascending: true });

//     if (error) throw error;

//     /* ── 2 ▸ build a quick look-up table  id  →  row  ─────────────────── */
//     const byId = {};
//     rows.forEach(r => { byId[r.id] = r; });

//     /* ── 3 ▸ attach a tiny “quoted” stub to every reply row ───────────── */
//     const enriched = rows.map(r => {
//       if (!r.parent_conversation) return r;              // not a reply

//       const quoted = byId[r.parent_conversation];
//       if (!quoted) return r;                             // safety

//       /* send only light data – enough for a grey preview strip */
//       return {
//         ...r,
//         quoted: {
//           id         : quoted.id,
//           message    : (quoted.message || "").slice(0, 120),
//           media_url  : quoted.media_url,
//           media_type : quoted.media_type
//         }
//       };
//     });

//     /* ── 4 ▸ done ─────────────────────────────────────────────────────── */
//     return res.json(enriched);

//   } catch (err) {
//     console.error("Failed to fetch messages:", err);
//     return res
//       .status(500)
//       .json({ message: "Failed to fetch messages.", error: String(err) });
//   }
// });

// // --- New Profile Endpoints for Self-Service ---
// // These endpoints allow any authenticated user to get and update their own profile

// // Get current user's profile
// app.get("/profile", async (req, res) => {
//   const { username } = req.user;
//   try {
//     const { data, error } = await supabase
//       .from("all_users")
//       .select("*")
//       .eq("username", username)
//       .single();
//     if (error || !data) {
//       return res.status(404).json({ message: "User not found." });
//     }
//     res.json(data);
//   } catch (error) {
//     console.error("Failed to fetch profile:", error);
//     res.status(500).json({ message: "Failed to fetch profile." });
//   }
// });

// // Update current user's profile
// app.put("/profile", async (req, res) => {
//   const { username } = req.user;
//   // Allow the user to update only certain fields
//   const { email, password, preferred_language, default_language } = req.body;
//   let updateData = {};
//   if (email !== undefined) updateData.email = email;
//   if (preferred_language !== undefined)
//     updateData.preferred_language = preferred_language;
//   if (default_language !== undefined)
//     updateData.default_language = default_language;
//   if (password) updateData.password = password;

//   try {
//     const { data, error } = await supabase
//       .from("all_users")
//       .update(updateData)
//       .eq("username", username);
//     if (error) throw error;
//     res.json(data);
//   } catch (error) {
//     console.error("Failed to update profile:", error);
//     res.status(500).json({ message: "Failed to update profile." });
//   }
// });

// // Serve avatar folders statically
// app.use('/avatars', express.static(path.join(__dirname, 'avatars')));

// // New endpoint for uploading profile avatars
// app.post("/profile/avatar", authenticateToken, upload.single('avatar'), async (req, res) => {
//   if (!req.file) {
//     return res.status(400).json({ message: "No avatar file uploaded." });
//   }
//   try {
//     // Generate a unique file name using a timestamp and original name.
//     const fileName = `${Date.now()}_${req.file.originalname}`;
//     const targetDir = path.join(__dirname, 'avatars', 'users');
//     if (!fs.existsSync(targetDir)) {
//       fs.mkdirSync(targetDir, { recursive: true });
//     }
//     const targetPath = path.join(targetDir, fileName);
//     fs.renameSync(req.file.path, targetPath);

//     // Build public URL for the uploaded avatar
//     const publicURL = `${req.protocol}://${req.get('host')}/avatars/users/${fileName}`;
// a
//     // Update the user's profile with the new avatar URL
//     const { error } = await supabase
//       .from("all_users")
//       .update({ user_avatar: publicURL })
//       .eq("username", req.user.username);
//     if (error) {
//       return res.status(500).json({ message: "Failed to update avatar in profile.", error });
//     }
//     res.status(201).json({ avatar_url: publicURL });
//   } catch (err) {
//     // Clean up temp file on error
//     if (req.file && req.file.path) {
//       fs.unlinkSync(req.file.path);
//     }
//     console.error("Error uploading avatar:", err);
//     res.status(500).json({ message: "Error uploading avatar.", error: err });
//   }
// });


// // Start Server
// app.listen(PORT, () => {
//   console.log(`Server running on http://localhost:${PORT}`);
// });
// server.js (HTTPS-enabled)
require("dotenv").config();

const fs = require("fs");
const https = require("https");
const path = require("path");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 5021;

const SUPABASE_URL = "http://137.184.148.164:8000";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_KEY) {
  console.error("❌ Missing SUPABASE_ANON_KEY in environment");
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.error("❌ Missing JWT_SECRET in environment");
  process.exit(1);
}

console.log("Initializing Supabase client...");
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
console.log("Supabase client initialized successfully!");

// If you're behind a proxy/load balancer (nginx, etc.)
app.set("trust proxy", 1);

// ─────────────────────────────────────────────────────────────
app.use(cors());
app.use(bodyParser.json());

// Request logger (keep near the top)
app.use((req, res, next) => {
  console.log(`\n[${new Date().toISOString()}] ▶ ${req.method} ${req.originalUrl}`);
  if (req.body && Object.keys(req.body).length) {
    console.log("   ⮞ Body:", JSON.stringify(req.body));
  }
  next();
});

// Static assets
app.use("/media", express.static(path.join(__dirname, "public/media")));
app.use("/avatars", express.static(path.join(__dirname, "avatars")));

// Multer for temp uploads (used by media & avatar endpoints)
const upload = multer({ dest: "uploads/" });

// ─────────────────────────────────────────────────────────────
// Auth helpers
// ─────────────────────────────────────────────────────────────
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

function checkUserManager(req, res, next) {
  if (!req.user || !req.user.user_manager) {
    return res
      .status(403)
      .json({ message: "Permission denied. User is not a manager." });
  }
  next();
}

// ─────────────────────────────────────────────────────────────
// Public auth endpoints
// ─────────────────────────────────────────────────────────────
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

app.post("/validate-token", async (req, res) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res
      .status(401)
      .json({ valid: false, message: "Token is required." });
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET);

    const { data, error } = await supabase
      .from("all_users")
      .select("username, token")
      .eq("token", token)
      .single();

    if (error || !data) {
      return res
        .status(403)
        .json({ valid: false, message: "Invalid or expired token." });
    }

    res.json({ valid: true, username: data.username });
  } catch (err) {
    console.error("Token validation error:", err);
    res
      .status(403)
      .json({ valid: false, message: "Invalid or expired token." });
  }
});

// ─────────────────────────────────────────────────────────────
// Protected routes (everything below requires a valid JWT)
// ─────────────────────────────────────────────────────────────
app.use(authenticateToken);

// User management (manager-only)
app.get("/users", checkUserManager, async (_req, res) => {
  try {
    const { data, error } = await supabase.from("all_users").select("*");
    if (error) throw error;
    res.json(data);
  } catch (_error) {
    res.status(500).json({ message: "Failed to fetch users." });
  }
});

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
  } catch (_error) {
    res.status(500).json({ message: "Failed to create user." });
  }
});

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
  } catch (_error) {
    res.status(500).json({ message: "Failed to update user." });
  }
});

app.delete("/users/:eid", checkUserManager, async (req, res) => {
  const { eid } = req.params;
  try {
    const { data, error } = await supabase
      .from("all_users")
      .delete()
      .eq("eid", eid);
    if (error) throw error;
    res.json(data);
  } catch (_error) {
    res.status(500).json({ message: "Failed to delete user." });
  }
});

// ─────────────────────────────────────────────────────────────
// Profile (self-service)
// ─────────────────────────────────────────────────────────────
app.get("/profile", async (req, res) => {
  const { username } = req.user;
  try {
    const { data, error } = await supabase
      .from("all_users")
      .select("*")
      .eq("username", username)
      .single();
    if (error || !data) {
      return res.status(404).json({ message: "User not found." });
    }
    res.json(data);
  } catch (error) {
    console.error("Failed to fetch profile:", error);
    res.status(500).json({ message: "Failed to fetch profile." });
  }
});

app.put("/profile", async (req, res) => {
  const { username } = req.user;
  const { email, password, preferred_language, default_language } = req.body;
  const updateData = {};
  if (email !== undefined) updateData.email = email;
  if (preferred_language !== undefined)
    updateData.preferred_language = preferred_language;
  if (default_language !== undefined)
    updateData.default_language = default_language;
  if (password) updateData.password = password;

  try {
    const { data, error } = await supabase
      .from("all_users")
      .update(updateData)
      .eq("username", username);
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error("Failed to update profile:", error);
    res.status(500).json({ message: "Failed to update profile." });
  }
});

// Upload avatar
app.post("/profile/avatar", upload.single("avatar"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No avatar file uploaded." });
  }
  try {
    const fileName = `${Date.now()}_${req.file.originalname}`;
    const targetDir = path.join(__dirname, "avatars", "users");
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const targetPath = path.join(targetDir, fileName);
    fs.renameSync(req.file.path, targetPath);

    const publicURL = `${req.protocol}://${req.get("host")}/avatars/users/${fileName}`;

    const { error } = await supabase
      .from("all_users")
      .update({ user_avatar: publicURL })
      .eq("username", req.user.username);
    if (error) {
      return res
        .status(500)
        .json({ message: "Failed to update avatar in profile.", error });
    }
    res.status(201).json({ avatar_url: publicURL });
  } catch (err) {
    if (req.file && req.file.path) {
      fs.unlinkSync(req.file.path);
    }
    console.error("Error uploading avatar:", err);
    res.status(500).json({ message: "Error uploading avatar.", error: err });
  }
});

// ─────────────────────────────────────────────────────────────
// Conversations & messaging
// ─────────────────────────────────────────────────────────────

// Create a new conversation row (used for channels or first message)
app.post("/conversations", async (req, res) => {
  const { owner, roles_members, conversation_id, message, recipients, status, channel } = req.body;
  try {
    const { data, error } = await supabase.from("orca_conversations").insert([
      {
        owner,
        roles_members,
        conversation_id,
        message,
        recipients,
        status,
        channel,
      },
    ]);
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error("Failed to create conversation:", error);
    res.status(500).json({ message: "Failed to create conversation." });
  }
});

// Get all conversations (raw table scan; filter in client or adjust query)
app.get("/conversations", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("orca_conversations")
      .select("*");
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error("Failed to fetch conversations:", error);
    res.status(500).json({ message: "Failed to fetch conversations." });
  }
});

// Update a conversation by conversation_id (note: :id is the conversation_id)
app.put("/conversations/:id", async (req, res) => {
  const { id } = req.params; // conversation_id
  const {
    owner,
    roles_members,
    conversation_id,
    message,
    recipients,
    status,
    alias,
    channel,
  } = req.body;

  try {
    const updateData = {
      owner,
      roles_members,
      conversation_id,
      message,
      recipients,
      status,
      alias,
      channel,
    };

    const { data, error } = await supabase
      .from("orca_conversations")
      .update(updateData)
      .eq("conversation_id", id);

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error("Failed to update conversation:", error);
    res.status(500).json({ message: "Failed to update conversation." });
  }
});

// Delete a conversation row by numeric primary key id
app.delete("/conversations/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("orca_conversations")
      .delete()
      .eq("id", id);
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error("Failed to delete conversation:", error);
    res.status(500).json({ message: "Failed to delete conversation." });
  }
});

// Send a text message in a conversation
app.post("/conversations/:id/messages", async (req, res) => {
  const { id } = req.params; // conversation_id
  const { message, parent_conversation } = req.body;
  const sender = req.user.username;

  try {
    const { data, error } = await supabase.from("orca_conversations").insert([
      {
        conversation_id: id,
        message,
        owner: sender,
        created_at: new Date().toISOString(),
        recipients: null,
        roles_members: null,
        status: "active",
        parent_conversation,
      },
    ]);

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error("Failed to send message:", error);
    res.status(500).json({ message: "Failed to send message." });
  }
});

// Send media (image/video) message with multipart/form-data field "file"
app.post("/conversations/:id/media", upload.single("file"), async (req, res) => {
  const conversationId = req.params.id;
  const sender = req.user.username;
  const { parent_conversation } = req.body;

  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded." });
  }

  try {
    // Ensure target dir exists
    const targetDir = path.join(__dirname, "public/media");
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const fileName = `${Date.now()}_${req.file.originalname}`;
    const targetPath = path.join(targetDir, fileName);
    fs.renameSync(req.file.path, targetPath);

    const publicURL = `${req.protocol}://${req.get("host")}/media/${fileName}`;

    const { data, error } = await supabase.from("orca_conversations").insert([
      {
        conversation_id: conversationId,
        message: null,
        owner: sender,
        created_at: new Date().toISOString(),
        media_url: publicURL,
        media_type: req.file.mimetype,
        recipients: null,
        roles_members: null,
        status: "active",
        parent_conversation,
      },
    ]);

    if (error) {
      return res
        .status(500)
        .json({ message: "Failed to send media message.", error });
    }

    res.status(201).json(data);
  } catch (err) {
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
    console.error("Error in media upload:", err);
    res.status(500).json({ message: "Error uploading media.", error: err });
  }
});

// Get all messages for a conversation (enriched with light quoted preview)
app.get("/conversations/:id/messages", async (req, res) => {
  const { id } = req.params; // conversation_id

  try {
    const { data: rows, error } = await supabase
      .from("orca_conversations")
      .select("*")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const byId = {};
    rows.forEach((r) => {
      byId[r.id] = r;
    });

    const enriched = rows.map((r) => {
      if (!r.parent_conversation) return r;
      const quoted = byId[r.parent_conversation];
      if (!quoted) return r;
      return {
        ...r,
        quoted: {
          id: quoted.id,
          message: (quoted.message || "").slice(0, 120),
          media_url: quoted.media_url,
          media_type: quoted.media_type,
        },
      };
    });

    return res.json(enriched);
  } catch (err) {
    console.error("Failed to fetch messages:", err);
    return res
      .status(500)
      .json({ message: "Failed to fetch messages.", error: String(err) });
  }
});

// Health check
app.get("/", (_req, res) => {
  res.send("Orca conversations API up (HTTPS)");
});

// ─────────────────────────────────────────────────────────────
// HTTPS server startup
// ─────────────────────────────────────────────────────────────
const httpsOptions = {
  key: fs.readFileSync(
    "/etc/letsencrypt/live/inventory.orcagroup.io/privkey.pem"
  ),
  cert: fs.readFileSync(
    "/etc/letsencrypt/live/inventory.orcagroup.io/fullchain.pem"
  ),
  // If you have an intermediate chain file, add:
  // ca: fs.readFileSync("/etc/letsencrypt/live/inventory.orcagroup.io/chain.pem"),
};

https.createServer(httpsOptions, app).listen(PORT, () => {
  console.log(`🚀 HTTPS server listening on https://0.0.0.0:${PORT}`);
});

/* Optional: redirect plain HTTP → HTTPS using a tiny side server
   (Enable only if port 80 is free and you want global redirect)
//
// const http = require("http");
// const REDIRECT_PORT = process.env.HTTP_REDIRECT_PORT || 80;
// http.createServer((req, res) => {
//   const host = req.headers.host || "";
//   const bareHost = host.replace(/:\d+$/, "");
//   res.writeHead(301, { Location: `https://${bareHost}:${PORT}${req.url}` });
//   res.end();
// }).listen(REDIRECT_PORT, () => {
//   console.log(`↪ HTTP → HTTPS redirect listening on :${REDIRECT_PORT}`);
// });
*/
