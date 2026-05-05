const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDir = "assets/uploads";

// auto-create folder
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir); // 🔥 FILE GOES HERE
  },
  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueName + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

const uploadFields = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "logo", maxCount: 1 },
  { name: "favicon", maxCount: 1 },
  { name: "bannerImage", maxCount: 2 },
  { name: "icon", maxCount: 1 },
]);

uploadFields.any = upload.any();

module.exports = uploadFields;
