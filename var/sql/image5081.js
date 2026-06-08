const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 5081;

// ✅ Define allowed folders
const allowedFolders = [
  '/var/sql/kanban',
  // Add more folders if needed
];

const cors = require('cors');

// Configure CORS
app.use(cors({
  origin: '*', // Replace with your frontend origin for better security
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

// ✅ Middleware to check if folder is allowed
function isFolderAllowed(folderPath) {
  return allowedFolders.some(allowed => folderPath.startsWith(allowed));
}

// 🔽 File upload handling
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const targetFolder = path.join(req.body.folder || '');
    if (!isFolderAllowed(targetFolder)) {
      return cb(new Error('Folder not allowed'), false);
    }
    fs.mkdirSync(targetFolder, { recursive: true });
    cb(null, targetFolder);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// 🔼 Upload image
app.post('/upload', upload.single('image'), (req, res) => {
  res.json({ message: 'Image uploaded successfully', file: req.file });
});

// 🔄 Serve image
app.get('/images/:folder/:filename', (req, res) => {
  const folder = req.params.folder;
  const filename = req.params.filename;

  const folderPath = path.join('/var/sql', folder);
  const filePath = path.join(folderPath, filename);

  if (!isFolderAllowed(folderPath)) {
    return res.status(403).send('Access to this folder is not allowed.');
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Image not found.');
  }

  res.sendFile(filePath);
});

app.listen(PORT, () => {
  console.log(`Image server running at http://localhost:${PORT}`);
});


// 🧾 List all images in a folder
app.get('/list/:folder', (req, res) => {
  const folder = req.params.folder;
  const folderPath = path.join('/var/sql', folder);

  if (!isFolderAllowed(folderPath)) {
    return res.status(403).send('Access to this folder is not allowed.');
  }

  fs.readdir(folderPath, (err, files) => {
    if (err) return res.status(500).send('Could not read directory.');
    const images = files.filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f));
    res.json({ folder, images });
  });
});
