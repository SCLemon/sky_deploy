const groupModel = require('../models/groupModel')
const fs = require('fs');
const path = require('path')

function getFolderSize(folderPath) {
    let totalSize = 0;
    const files = fs.readdirSync(folderPath);
    files.forEach((file) => {
      const filePath = path.join(folderPath, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) totalSize += getFolderSize(filePath);
      else totalSize += stat.size;
    });
  
    return totalSize;
}
const checkUsageMemory = async(req,res,next)=>{
    try{
        const group = await groupModel.findOne({group: req.user.group})
        if (!group) {
            return res.send({
                type: 'error',
                message: '用戶群組不存在。',
            });
        }
        const limitMemory = group.limit.memory;
        const databaseUrl = group.databaseUrl;
        
        // 1. 目前群組已用空間 (MB)
        const usedSizeMB = getFolderSize(databaseUrl) / (1024 * 1024);

        // 2. 本次上傳檔案的大小 (MB)
        let uploadSizeMB = 0;
        if (req.files && req.files.attachments && req.files.attachments.length > 0) {
            uploadSizeMB = req.files.attachments.reduce((sum, file) => sum + file.size, 0) / (1024 * 1024);
        }

        const totalAfterUpload = usedSizeMB + uploadSizeMB;
        if (totalAfterUpload > limitMemory) {
            return res.send({
                type: 'error',
                message: `空間用量已超過限制 ${limitMemory} MB，如需調額請洽客服人員。`,
            });
        }
        next()
    }
    catch(e){
        console.error(e);
        return res.send({
            type: 'error',
            message: '伺服器錯誤，請洽客服人員協助。',
        });
    }
}

module.exports = { checkUsageMemory, getFolderSize }