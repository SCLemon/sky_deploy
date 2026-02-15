// 使用者相關資料維護 -- 個人資料表、頭像
const express = require('express');
const router = express.Router();
const userModel = require('../models/userModel');
const groupModel = require('../models/groupModel')
const fs = require('fs');
const path = require('path');

const levelTitle = [
    '新手會員','普通會員','進階會員','高級會員','鉑金會員',
    '鑽石會員','星耀會員','頂級會員','特權貴賓','頂級版主'
]

const authMiddleware = require('../middleware/auth.middleware')
const { checkUsageMemory } = require('../middleware/checkUsageMemory.middleware')
const { upload, autoCleanupTmp } = require('../config/multer.config');

// 更改頭貼 --> 由用戶自行修改，以 token 進行驗證
router.post('/api/userInfo/updateIcon',authMiddleware,upload.fields([{ name: 'attachments', maxCount: 1}]),autoCleanupTmp,checkUsageMemory, async (req, res) => {
    const token = req.headers['x-user-token']
    try {

        if(req.user.account == 'Visitor') {
            return res.send({ type:'error', message:'訪客帳號無法修改頭像。'});
        }

        const groupInfo = await groupModel.findOne({group: req.user.group});
        if(!groupInfo){
            return res.send({
                type:'error',
                message:'頭貼上傳失敗（群組不存在）。'
            });
        }
        const databaseUrl = groupInfo.databaseUrl;
        try{

            let attachments = req.files['attachments'][0];
            
            if (!attachments) {
                return res.send({
                    type:'error',
                    message:'上傳頭像不可為空。'
                });
            }

            // 檢查資料夾是否存在
            const folderPath = `${databaseUrl}/userIcon/${req.user.idx}`;
            if (!fs.existsSync(folderPath)){
                fs.mkdirSync(folderPath, { recursive: true });
            }
            else { // 將資料夾清空並重建
                fs.rmSync(folderPath, { recursive: true });
                fs.mkdirSync(folderPath, { recursive: true });
            }

            const realPath = path.join(folderPath, attachments.originalname);
            fs.renameSync(attachments.path, realPath);

            const user = await userModel.findOneAndUpdate(
                { token: token },  // 查找條件
                { 
                    $set: { 
                        "userImgUrl.url": `/api/userInfo/getUserIcon/${req.user.idx}`, 
                        "userImgUrl.original": realPath 
                    } 
                },
                { new: true }  // 返回更新後的資料
            );
            if(!user){
                return res.send({
                    type:'success',
                    message:'頭像上傳失敗。'
                });
            }

            return res.send({
                type:'success',
                message:'頭像上傳成功。'
            });

        }
        catch(e){
            console.log(e)
            return res.send({
                type:'error',
                message:'頭像上傳失敗。'
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

// 返回頭貼
router.get('/api/userInfo/getUserIcon/:idx',async (req, res) => {

    const user = await userModel.findOne({idx: req.params.idx})
    
    const filePath = user.userImgUrl.original;

    if (fs.existsSync(filePath)) {
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    } else {
        res.status(404).send('File not found');
    }
});


// 個人資料維護
router.get('/api/userInfo/getUserInfo/:idx',authMiddleware,async (req, res) => {
    const idx = req.params.idx;

    try{
        if(req.user.type  == 'teacher' || req.user.type == 'student' && req.user.account != 'Visitor'){
            const user = await userModel.findOne({idx: idx, group: req.user.group})

            if(!user){
                return res.send({
                    type:'error',
                    message:'使用者資料獲取失敗'
                })
            }

            return res.send({
                type:'success',
                user:{
                    idx: user.idx,
                    type: user.type,
                    account: user.account,
                    password: user.password,
                    name: user.name,
                    token: user.token,
                    phone: user.detail.phoneNumber,
                    address: user.detail.address,
                    level: {
                        level: user.level,
                        levelTitle: levelTitle[user.level - 1]
                    },
                    mailAddress: user.detail.mailAddress,
                    userImgUrl: user.userImgUrl.url,
                    userPhotoStickerUrl: user.detail.photoStickers.url
                },
                levelTitleArray:levelTitle,
                message:'使用者資料獲取成功'
            })
        }
        else{
            return res.send({
                type: 'error',
                message: '您沒有權限查詢使用者資料。',
            });
        }
    }
    catch(e){
        console.log(e);
        return res.send({
            type: 'error',
            message: '伺服器錯誤，請洽客服人員協助。',
        });
    }
});

router.post('/api/userInfo/modifyUserInfo/:idx',authMiddleware,upload.fields([{ name: 'attachments', maxCount: 1}]),autoCleanupTmp,checkUsageMemory,async (req, res) => {
    const idx = req.params.idx;
    const { password, name, phone, address, level, mailAddress} = JSON.parse(req.body.userInfo);

    try{
        if(req.user.type  == 'teacher' || req.user.type  == 'student' && req.user.account != 'Visitor'){

            const groupInfo = await groupModel.findOne({group: req.user.group});
            if(!groupInfo){
                return res.send({
                    type:'error',
                    message:'使用者資料更新失敗（群組不存在）。'
                });
            }
            const databaseUrl = groupInfo.databaseUrl;
            try{

                let attachments = req.files['attachments'] ? req.files['attachments'][0] : null;

                let userImgUrl = '';
                let realPath = '';

                if (attachments) {
                    // 檢查資料夾是否存在
                    const folderPath = `${databaseUrl}/userInfo/${idx}`;
                    if (!fs.existsSync(folderPath)){
                        fs.mkdirSync(folderPath, { recursive: true });
                    }
                    else { // 將資料夾清空並重建
                        fs.rmSync(folderPath, { recursive: true });
                        fs.mkdirSync(folderPath, { recursive: true });
                    }
        
                    realPath = path.join(folderPath, attachments.originalname);
                    userImgUrl = `/api/userInfo/getPhotoStickers/${idx}`
                    fs.renameSync(attachments.path, realPath);
                    
                }
    
                const updateData = {
                    name: name,
                    password: password,
                    level: level.level,
                    "detail.phoneNumber": phone,
                    "detail.address": address,
                    "detail.mailAddress": mailAddress
                };

                if (attachments) {
                    updateData["detail.photoStickers.url"] = userImgUrl;
                    updateData["detail.photoStickers.original"] = realPath;
                }

                const user = await userModel.findOneAndUpdate(
                    { idx: idx, group: req.user.group },
                    { $set: updateData },
                    { new: true }
                );

                if (!user) {
                    return res.send({
                        type: 'error',
                        message: '使用者資料更新失敗'
                    });
                }

                return res.send({
                    type: 'success',
                    message: '使用者資料更新成功'
                });
    
            }
            catch(e){
                console.log(e)
                return res.send({
                    type:'error',
                    message:'使用者資料更新失敗。'
                });
            }
            
        }
        else{
            return res.send({
                type: 'error',
                message: '您沒有權限更新使用者資料。',
            });
        }
    }
    catch(e){
        console.log(e);
        return res.send({
            type: 'error',
            message: '伺服器錯誤，請洽客服人員協助。',
        });
    }
});

// 返回個人資料維護中的大頭照
router.get('/api/userInfo/getPhotoStickers/:idx',async (req, res) => {

    const user = await userModel.findOne({idx: req.params.idx})

    const filePath = user.detail.photoStickers.original;

    if (fs.existsSync(filePath)) {
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    } else {
        res.status(404).send('File not found');
    }
});
module.exports = router;