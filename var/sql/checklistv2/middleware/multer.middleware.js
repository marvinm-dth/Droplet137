const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const {BASE_PATH} = require('../_config');
const { debugLog } = require('../helpers/debug.helper');

const originalPath = path.join(BASE_PATH, 'uploads/images/original');
const scaledPath = path.join(BASE_PATH, 'uploads/images/scaled');
const thumbnailPath = path.join(BASE_PATH, 'uploads/images/thumbnail');

[originalPath, scaledPath, thumbnailPath].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

const image_sizes = {
    thumbnail: 150,
    scaled: 1024
}

const storage = multer.memoryStorage();
const upload = multer({ storage });


exports.uploadPhotos = (fieldName = "images", maxCount = 10) => {
  return async (req, res, next) => {
      try {
          const uploadHandler = upload.array(fieldName, maxCount);
          uploadHandler(req, res, async (err) => {
              if (err) {
                  return res.status(400).json({ error: err.message });
              }

              if (!req.files || req.files.length === 0) {
                  return res.status(400).json({ error: 'No files uploaded' });
              }

              try {
                  const processedImages = await Promise.all(req.files.map(async (file) => {
                      const filename = `img-${Date.now()}-${Math.round(Math.random() * 1E9)}.jpg`;

                      await Promise.all([
                          sharp(file.buffer)
                              // .jpeg({ quality: 80 })
                              .toFile(path.join(originalPath, filename)),

                          sharp(file.buffer)
                              .resize(image_sizes.scaled)
                              .jpeg({ quality: 80 })
                              .toFile(path.join(scaledPath, filename)),

                          sharp(file.buffer)
                              .resize(image_sizes.thumbnail)
                              .jpeg({ quality: 80 })
                              .toFile(path.join(thumbnailPath, filename))
                      ]);

                      return {
                          name: filename,
                          originalPath: path.join("/uploads/images/original", filename),
                          scaledPath: path.join("/uploads/images/scaled", filename),
                          thumbnailPath: path.join("/uploads/images/thumbnail", filename)
                      };
                  }));

                  req.files.uploadedPhotos = processedImages;
                  next();
              } catch (sharpError) {
                  return res.status(500).json({ error: 'Error processing images' });
              }
          });
      } catch (error) {
          debugLog("error", error.message)
          return res.status(500).json({ error: 'Photo upload middleware error' });
      }
  };
};





const videoUploadPath  = path.join(BASE_PATH, 'uploads/videos/original');

if (!fs.existsSync(videoUploadPath)) {
  fs.mkdirSync(videoUploadPath, { recursive: true });
}

const storageVid = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, videoUploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueName = `vid-${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const fileFilterVid = (req, file, cb) => {
  if (file.mimetype.startsWith('video/')) {
    cb(null, true);
  } else {
    cb(new Error('Only video files are allowed'), false);
  }
};

const uploadVid = multer({
  storage: storageVid,
  limits: { fileSize: 1024 * 1024 * 500 }, // 500 MB limit
  fileFilter: fileFilterVid
});


exports.uploadVideos = (fieldName = "videos", maxCount = 10) => {
  return async (req, res, next) => {
    try {
      const uploadHandler = uploadVid.array(fieldName, maxCount);

      uploadHandler(req, res, (err) => {
        if (err) {
          return res.status(400).json({ error: err.message });
        }

        if (!req.files || req.files.length === 0 && req.body.videoLink) {
          return next();
        }

        // Attach file info to request
        req.files.uploadedVideos = req.files.map(file => ({
          // originalName: file.originalname,
          filename: file.filename,
          originalPath: `/uploads/videos/original/${file.filename}`, // public-facing path if static served
          size: file.size,
          mimetype: file.mimetype
        }));

        next();
      });
    } catch (error) {
      debugLog("error", error.message)
      return res.status(500).json({ error: 'Video upload middleware error' });
    }
  };
};











// exports.uploadSinglePhoto = (fieldName = "image") => {
//   console.log("uploading")
//     return async (req, res, next) => {
//         try {
//             const uploadHandler = upload.single(fieldName);
//             uploadHandler(req, res, async (err) => {
//                 if (err) {
//                     return res.status(400).json({ error: err.message });
//                 }

//                 if (!req.file && (!req.files || req.files.length === 0)) {
//                     return res.status(400).json({ error: 'No file uploaded' });
//                 }

//                 try {
//                     const filename = `img-${Date.now()}.jpg`;
                    
//                     await Promise.all([
//                         sharp(req.file.buffer)
//                             .jpeg({ quality: 80 })
//                             .toFile(path.join(originalPath, filename)),
                    
//                         sharp(req.file.buffer)
//                             .resize(image_sizes.scaled)
//                             .jpeg({ quality: 80 })
//                             .toFile(path.join(scaledPath, filename)),
                    
//                         sharp(req.file.buffer)
//                             .resize(image_sizes.thumbnail)
//                             .jpeg({ quality: 80 })
//                             .toFile(path.join(thumbnailPath, filename))
//                     ]);
                    

//                     req.file.uploadedPhoto = {
//                         name: filename,
//                         originalPath: path.join("/uploads/images/original", filename),
//                         scaledPath: path.join("/uploads/images/scaled", filename),
//                         thumbnailPath: path.join("/uploads/images/thumbnail", filename)
//                     };
//                     next();
//                 } catch (sharpError) {
//                     return res.status(500).json({ error: 'Error processing images' });
//                 }
//             });
//         } catch (error) {
//             return res.status(500).json({ error: 'Middleware error' });
//         }
//     };
// };
