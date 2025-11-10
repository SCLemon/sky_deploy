const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');


const uploadDir = path.join(os.tmpdir(), 'sky_uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});


// 限制檔案大小 (例如 10MB)
const upload = multer({
  storage,
//   limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

module.exports = upload;
