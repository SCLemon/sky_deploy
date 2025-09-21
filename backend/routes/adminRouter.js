// admin 以及空間配置操作
const express = require('express');
const router = express.Router();

const fs = require('fs');
const path = require('path');

const userModel = require('../models/userModel');
const groupModel = require('../models/groupModel');


// 檢查身份
const authMiddleware = async (req, res, next) => {
    const token = req.headers['x-user-token']
    if (!token) {
        return res.send({
            type: 'error',
            message: '未找到授權，請重新登入。',
        });
    }
    const user = await userModel.findOne({ token, status:true });
    if (!user) {
        return res.send({
            type: 'error',
            message: '未找到授權，請重新登入。',
        });
    }
    req.user = user;
    next();
};

// 以下為硬體裝置 API
// 獲取使用容量
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

router.get('/api/getUsageMemory',authMiddleware, async (req, res) => {
   
    try {
        if (req.user.type === 'teacher') {
            const group = await groupModel.findOne({group:req.user.group});
            if (!group){
                return res.send({
                    type: 'error',
                    message: '群組資料不存在，請洽客服人員。',
                });
            }
            const databaseUrl = group.databaseUrl;
            if (!fs.existsSync(databaseUrl)){
                return res.send({
                    type: 'error',
                    message: '群組資料庫不存在，請洽客服人員。',
                });
            }
            const size = getFolderSize(databaseUrl) / (1024*1024);
            return res.send({
                type:'success',
                limit: group.limit,
                size:size,
                message:'儲存空間用量資訊獲取成功！'
            })
        } 
        else {
            return res.send({
                type: 'error',
                message: '您沒有權限查看儲存空間用量。',
            });
        }
    } catch (e) {
        console.log(e);
        return res.send({
            type: 'error',
            message: '伺服器錯誤，請洽客服人員協助。',
        });
    }
});



module.exports = router;