const express = require("express");
const path = require("path");

function serveSPA(route, folder) {
  const router = express.Router();
  const basePath = path.join(__dirname, "..", "public", folder); // adjust relative path

  // Serve static assets
  router.use(route, express.static(basePath));

  // Handle client-side routing by serving index.html
  router.get(new RegExp(`^${route}(\/.*)?$`), (req, res) => {
    res.sendFile(path.join(basePath, "index.html"));
  });

  return router;
}

module.exports = serveSPA;
