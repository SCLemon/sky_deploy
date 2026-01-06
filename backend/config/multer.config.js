const multer = require('multer');
const path = require('path');
const fs = require('fs');


// 跨平台基準路徑
let tmpDir;
if (process.platform === 'win32') {
    tmpDir = 'D:/sky_database/sky_tmp';
} 
else if (process.platform === 'darwin') {
    tmpDir = '/Volumes/sky_database/sky_tmp';
} 
else {
    tmpDir = '/mnt/sky_database/sky_tmp';
}

if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tmpDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
});


function autoCleanupTmp(req, res, next) {
  const cleanup = () => {

    const removeFile = (file) => {
      if (!file?.destination || !file?.filename) return;

      const realPath = path.join(file.destination, file.filename);

      if (fs.existsSync(realPath)) {
        fs.unlinkSync(realPath);
      }
    };

    if (req.file) removeFile(req.file);
    if (req.files) Object.values(req.files).flat().forEach(removeFile);

  };

  res.on('finish', cleanup);
  res.on('close', cleanup);

  next();
}

module.exports = {
  upload,
  autoCleanupTmp
};
