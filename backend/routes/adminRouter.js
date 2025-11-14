// admin 以及空間配置操作
const express = require('express');
const router = express.Router();

const fs = require('fs');

const groupModel = require('../models/groupModel');


const authMiddleware = require('../middleware/auth.middleware')
const { getFolderSize } = require('../middleware/checkUsageMemory.middleware')


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