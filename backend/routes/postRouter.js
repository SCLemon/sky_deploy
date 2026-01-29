// 針對用戶貼文
const express = require('express');
const router = express.Router();
const userModel = require('../models/userModel');
const groupModel = require('../models/groupModel')
const postModel = require('../models/postModel')
const fs = require('fs');
const {format} = require('date-fns')
const { v4: uuidv4 } = require('uuid');

const path = require('path')

const authMiddleware = require('../middleware/auth.middleware')
const { checkUsageMemory } = require('../middleware/checkUsageMemory.middleware')
const { upload, autoCleanupTmp } = require('../config/multer.config');

// 推播通知
const { pushNotification } = require('./service-worker/serviceWorkerRouter')

// 創建貼文
router.post('/api/post/create',authMiddleware,upload.fields([{ name: 'attachments'}]),autoCleanupTmp,checkUsageMemory, async (req, res) => {
    
    try {
        const {content} = req.body;
        let attachments = req.files['attachments']?req.files['attachments']:[]

        if(content.trim().length == 0 && attachments.length == 0) return res.send({ type:'error', message:'貼文內容不可為空。'});

        const groupInfo = await groupModel.findOne({group: req.user.group});

        if(!groupInfo) return res.send({ type:'error', message:'貼文創建失敗（群組不存在）。'});
    
        const databaseUrl = groupInfo.databaseUrl;
        if (req.user.type === 'teacher') {
            // 創建貼文專屬 idx
            const idx = uuidv4();
        
            try{

                // 創建貼文專屬資料夾
                const folderPath = `${databaseUrl}/post/${idx}`

                // 先寫入資料庫
                const newPost = new postModel({
                    idx:idx,
                    creator:{
                        idx:req.user.idx,
                        name: req.user.name,
                        userImgUrl:req.user.userImgUrl.url
                    },
                    group: req.user.group,
                    content: content,
                    databaseUrl:folderPath,
                    createTime: format(new Date(),'yyyy-MM-dd HH:mm:ss'),
                    
                });
                await newPost.save()

                // 再創建並寫入資料夾中
                if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

                const attachmentInfo = JSON.parse(req.body.attachmentInfo);
                let availableAttachmentInfo = [];

                attachments.forEach((file,idx) => {
                    const filePath = `${folderPath}/${attachmentInfo[idx].id}${path.extname(file.originalname)}`
                    fs.renameSync(file.path, filePath);

                    const { url, ...rest } = attachmentInfo[idx];
                    availableAttachmentInfo.push({
                        filename: `${attachmentInfo[idx].id}${path.extname(file.originalname)}`,
                        ...rest
                    });
                    /*  儲存格式如下
                        {
                            "filename" : "95dfd8cc-72c9-4951-8078-61c8b48cadc9.png",
                            "id" : "95dfd8cc-72c9-4951-8078-61c8b48cadc9",
                            "position" : {
                                "x" : NumberInt(0),
                                "y" : NumberInt(0),
                                "referWidth" : NumberInt(0),
                                "scale" : NumberInt(1)
                            }
                        }
                    */

                });
                newPost.attachmentInfo = availableAttachmentInfo;
                await newPost.save();

                return res.send({ type:'success', message:'貼文創建成功。'});

            }
            catch(e){
                console.log(e)
                return res.send({ type:'error', message:'貼文創建失敗。'});
            }
        } 
        else {
            return res.send({ type: 'error', message: '您沒有權限創建貼文。'});
        }
    } catch (e) {
        console.log(e);
        return res.send({ type: 'error', message: '伺服器錯誤，請洽客服人員協助。'});
    }
});

// 刪除貼文
router.delete('/api/post/deletePost/:idx',authMiddleware,async(req,res)=>{

    try {
        if (req.user.type === 'teacher') {

            const idx = req.params.idx;
            
            if (!idx || typeof idx !== 'string' || idx.length !== 36) {
                return res.send({
                    type: 'error',
                    message: '貼文刪除失敗！'
                });
            }

            const groupInfo = await groupModel.findOne({group: req.user.group});
            if(!groupInfo){
                return res.send({
                    type:'error',
                    message:'貼文刪除失敗（群組不存在）。'
                });
            }
            
            const databaseUrl = groupInfo.databaseUrl;

            const deletedPost = await postModel.findOneAndDelete({ idx: idx, group:req.user.group });

            if (!deletedPost) {
                return res.send({
                    type: 'error',
                    message: '貼文刪除失敗！',
                });
            }
            
            // 刪除貼文專屬資料夾
            const folderPath = `${databaseUrl}/post/${idx}`
            if (fs.existsSync(folderPath)){
                fs.rmSync(folderPath, { recursive: true, force: true });
            }

            return res.send({
                type: 'success',
                message: `貼文已成功刪除。`,
            });
        } 
        else {
            return res.send({
                type: 'error',
                message: '您沒有權限刪除貼文資料。',
            });
        }
    } catch (e) {
        console.log(e);
        return res.send({
            type: 'error',
            message: '伺服器錯誤，請洽客服人員協助。',
        });
    }
})

// 修改貼文內容
router.post('/api/post/modifyPost/:idx',authMiddleware,async(req,res)=>{

    try {
        if (req.user.type === 'teacher') {

            const idx = req.params.idx;

            if (!idx || typeof idx !== 'string' || idx.length !== 36) {
                return res.send({
                    type: 'error',
                    message: '貼文修改失敗！'
                });
            }

            const post = await postModel.findOneAndUpdate({idx:idx, 'creator.idx':req.user.idx, group:req.user.group},{
                $set:{
                    content: req.body.content
                }
            },{new:true})

            if(!post){
                return res.send({
                    type: 'error',
                    message: `貼文修改失敗！`,
                });
            }

            return res.send({
                type: 'success',
                message: `貼文已成功修改。`,
            });
        } 
        else {
            return res.send({
                type: 'error',
                message: '您沒有權限修改貼文資料。',
            });
        }
    } catch (e) {
        console.log(e);
        return res.send({
            type: 'error',
            message: '伺服器錯誤，請洽客服人員協助。',
        });
    }
})

// 獲取貼文資料
router.get('/api/post/getPost', authMiddleware, async (req, res) => {
    const page = req.query.page || 1;
    const pageSize = 5;
    const offset = (page - 1) * pageSize;
    const q = req.query.q || ''
    try {
        let posts = [];
        
        if (req.user.type === 'teacher') {
            posts = (await postModel.find({ group: req.user.group, content: { $regex: q, $options: 'i' }  }).sort({ _id: -1 }).skip(offset).limit(pageSize)).reverse();
        } 
        else if (req.user.type === 'student') {
            posts = (await postModel.find({ group: req.user.group, content: { $regex: q, $options: 'i' }, status: true }).sort({ _id: -1 }).skip(offset).limit(pageSize)).reverse();
        }
        else {
            return res.send({
                type: 'error',
                message: '貼文資料查詢失敗。',
            })
        }

        if (posts.length === 0) {
            return res.send({
                type: 'success',
                posts: [],
                message: '貼文資料查詢成功。',
            });
        }

        posts = await Promise.all(
            posts.map(async (post) => {
                let postImg = [];
                const databaseUrl = post.databaseUrl;

                if (fs.existsSync(databaseUrl)) {

                    // 支援 v1.5.0.0 後續的讀取版本
                    if(post.attachmentInfo && post.attachmentInfo.length > 0){
                        postImg = post.attachmentInfo.map((p) => {
                           return {
                                name: p.filename,
                                url: `/api/post/image/${post.idx}/${p.filename}`,
                                position: p.position
                           }
                        })
                    }
                    else { // 支援 v1.5.0.0 以前的讀取版本
                        let attachmentInfo = fs.readdirSync(databaseUrl).map((file) => {

                            // 更改原先檔案的資料儲存結構
                            const uuid = uuidv4();
                            const newFilename = uuid + path.extname(file);
                            const defaultPosition = {x:0, y:0, referWidth: 0, scale: 1}
                            
                            const oldPath = path.join(databaseUrl, file);
                            const newPath = path.join(databaseUrl, newFilename);
                            fs.renameSync(oldPath, newPath);

                            // 同時撰寫要回傳的資料
                            postImg.push({
                                name: newFilename,
                                url: `/api/post/image/${post.idx}/${newFilename}`,
                                position: defaultPosition
                            })

                            return {
                                filename: newFilename,
                                id: uuid,
                                position: defaultPosition
                            };
                        })

                        post.attachmentInfo = attachmentInfo
                        await post.save();

                    }
                }

                // 創建者
                const creator = await userModel.findOne({idx:post.creator.idx})
                let creatorInfo = {
                    name : creator.name,
                    userImgUrl: creator.userImgUrl.url
                }

                const isLike = post.meta.like.some((likeUser) => likeUser.idx === req.user.idx);

                // 留言

                const userIdxSet = new Set(post.meta.message.map(m => m.idx));

                const users = await userModel.find(
                    { idx: { $in: [...userIdxSet] }, status: true },
                    { idx: 1, name: 1, level: 1, userImgUrl: 1 }
                );

                const userMap = new Map(users.map(u => [u.idx, u]));

                const message = post.meta.message.map(i => {
                    const user = userMap.get(i.idx);
                    if (!user) return null;

                    return {
                        name: user.name,
                        level: user.level,
                        userImgUrl: user.userImgUrl.url,
                        createTime: i.createTime,
                        message: i.message
                    };
                }).filter(Boolean);
                
                return {
                    idx: post.idx,
                    createTime: post.createTime,
                    creator: creatorInfo,
                    content: post.content,
                    status: post.status,
                    message: message,
                    postImg: postImg,
                    isLike: isLike,
                    likeCount:post.meta.like.length
                };
            })
        );

        return res.send({
            type: 'success',
            posts:posts.reverse(),
            message: '用戶資料查詢成功。',
        });
    } catch (e) {
        console.log(e);
        return res.send({
            type: 'error',
            message: '伺服器錯誤，請洽客服人員協助。',
        });
    }
});

// 獲取分享貼文
router.get('/api/post/share/:share', authMiddleware, async (req, res) => {

    try {
        let posts = [];
        let targetPost = null;

        const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const share = req.params.share;

        if(uuidV4Regex.test(share)){
            if (req.user.type === 'teacher'){
                targetPost = await postModel.findOne({ group: req.user.group, idx: share });
            }
            else if (req.user.type === 'student'){
                targetPost = await postModel.findOne({ group: req.user.group, idx: share, status: true });
            }
            
            if(targetPost) posts.push(targetPost)
            if(posts.length == 0){
                return res.send({
                    type: 'success',
                    posts:[],
                    message: '貼文資料查詢成功。',
                });
            }
        }
        else {
            return res.send({
                type: 'error',
                message: '貼文內容不存在或權限不足無法閱覽。',
            })
        }

        posts = await Promise.all(
            posts.map(async (post) => {
                let postImg = [];
                const databaseUrl = post.databaseUrl;

                if (fs.existsSync(databaseUrl)) {

                    // 支援 v1.5.0.0 後續的讀取版本
                    if(post.attachmentInfo && post.attachmentInfo.length > 0){
                        postImg = post.attachmentInfo.map((p) => {
                           return {
                                name: p.filename,
                                url: `/api/post/image/${post.idx}/${p.filename}`,
                                position: p.position
                           }
                        })
                    }
                    else { // 支援 v1.5.0.0 以前的讀取版本
                        let attachmentInfo = fs.readdirSync(databaseUrl).map((file) => {

                            // 更改原先檔案的資料儲存結構
                            const uuid = uuidv4();
                            const newFilename = uuid + path.extname(file);
                            const defaultPosition = {x:0, y:0, referWidth: 0, scale: 1}
                            
                            const oldPath = path.join(databaseUrl, file);
                            const newPath = path.join(databaseUrl, newFilename);
                            fs.renameSync(oldPath, newPath);

                            // 同時撰寫要回傳的資料
                            postImg.push({
                                name: newFilename,
                                url: `/api/post/image/${post.idx}/${newFilename}`,
                                position: defaultPosition
                            })

                            return {
                                filename: newFilename,
                                id: uuid,
                                position: defaultPosition
                            };
                        })

                        post.attachmentInfo = attachmentInfo
                        await post.save();

                    }
                }

                // 創建者
                const creator = await userModel.findOne({idx:post.creator.idx})
                let creatorInfo = {
                    name : creator.name,
                    userImgUrl: creator.userImgUrl.url
                }

                const isLike = post.meta.like.some((likeUser) => likeUser.idx === req.user.idx);

                // 留言

                const userIdxSet = new Set(post.meta.message.map(m => m.idx));

                const users = await userModel.find(
                    { idx: { $in: [...userIdxSet] }, status: true },
                    { idx: 1, name: 1, level: 1, userImgUrl: 1 }
                );

                const userMap = new Map(users.map(u => [u.idx, u]));

                const message = post.meta.message.map(i => {
                    const user = userMap.get(i.idx);
                    if (!user) return null;

                    return {
                        name: user.name,
                        level: user.level,
                        userImgUrl: user.userImgUrl.url,
                        createTime: i.createTime,
                        message: i.message
                    };
                }).filter(Boolean);
                
                return {
                    idx: post.idx,
                    createTime: post.createTime,
                    creator: creatorInfo,
                    content: post.content,
                    status: post.status,
                    message: message,
                    postImg: postImg,
                    isLike: isLike,
                    likeCount:post.meta.like.length
                };
            })
        );

        return res.send({
            type: 'success',
            posts:posts,
            message: '用戶資料查詢成功。',
        });
    } catch (e) {
        console.log(e);
        return res.send({
            type: 'error',
            message: '伺服器錯誤，請洽客服人員協助。',
        });
    }
});

// 隱藏貼文
router.put('/api/post/hidePost/:idx', authMiddleware, async (req, res) => {
    try {
        if (req.user.type === 'teacher') {
            const idx = req.params.idx;
            try{

                const targetPost = await postModel.findOne({
                    idx:idx,
                    group: req.user.group,
                });
                
                targetPost.status = !targetPost.status

                targetPost.save();

                return res.send({
                    type:'success',
                    postStatus: targetPost.status,
                    message:`貼文${targetPost.status?'公開':'隱藏'}成功。`
                });

            }
            catch(e){
                console.log(e)
                return res.send({
                    type:'error',
                    message:'貼文閱覽權限調整失敗。'
                });
            }
        } 
        else {
            return res.send({
                type: 'error',
                message: '您沒有權限調整閱覽權限。',
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

// 推播貼文
router.get('/api/post/notify/:idx', authMiddleware, async (req, res) => {
    try {
        if (req.user.type === 'teacher') {
            const idx = req.params.idx;

            try{

                const targetPost = await postModel.findOne({ idx:idx, group: req.user.group, status: true });
                if(!targetPost) return res.send({ type:'error',message:`貼文推播失敗（貼文不存在）。`});

                // 推播貼文
                pushNotification("檸檬小天地", "檸檬推播了一則有趣的貼文！", "./#/academic/post/" + targetPost.idx);
                
                return res.send({ type:'success',message:`貼文推播執行。`});

            }
            catch(e){
                console.log(e)
                return res.send({
                    type:'error',
                    message:'貼文推播失敗。'
                });
            }
        } 
        else {
            return res.send({
                type: 'error',
                message: '您沒有權限進行貼文推播。',
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

// 按讚
router.get('/api/post/toggleLikePost/:idx', authMiddleware, async (req, res) => {
    try {
        if(req.user.account == 'Visitor'){
            return res.send({ type: 'error', message: '訪客帳號不開放按讚功能。' });
        }
        const postIdx = req.params.idx;
    
        const post = await postModel.findOne({
            idx: postIdx,
            group: req.user.group,
        });

        if(!post || (req.user.type!='teacher' && !post.status)){
            return res.send({ type: 'error', message: '目前無法對貼文進行操作（貼文暫時關閉中）。' }); 
        }
        
        let likedList = (post.meta.like);
        const targetInListIdx = likedList.findIndex(like => like.idx === req.user.idx);

        if (targetInListIdx !== -1) {
            likedList.splice(targetInListIdx, 1);
        } 
        else {
            likedList.push({idx: req.user.idx})
        }

        await post.save();
        return res.send({ type: 'success', message: '貼文按讚執行完畢', likeCount: (post.meta.like).length});
  
    } catch (e) {
        console.error(e);
        return res.send({
            type: 'error',
            message: '伺服器錯誤，請洽客服人員協助。',
        });
    }
});

// 留言
router.post('/api/post/message', authMiddleware, async (req, res) => {
    try {
        if(req.user.account == 'Visitor'){
            return res.send({ type: 'error', message: '訪客帳號不開放留言功能。' });
        }
        const postIdx = req.body.postIdx;
        const message = req.body.message;
        const fingerprint = req.headers['x-user-fingerprint'];
        const createTime = format(new Date(),'yyyy-MM-dd HH:mm:ss');
        if (!postIdx ||!fingerprint || !/^[a-f0-9]{64}$/.test(fingerprint)) {
            return res.send({
                type: 'error',
                message: '留言失敗（參數異常錯誤）',
            });
        }
        if(message.trim() == ''){
            return res.send({
                type: 'error',
                message: '留言失敗（訊息不可為空）',
            });
        }
        const post = await postModel.findOneAndUpdate({idx:postIdx, group:req.user.group},
            {
                $push:{
                    'meta.message':{
                        idx: req.user.idx,
                        createTime: createTime,
                        fingerprint: fingerprint,
                        message: message
                    }
                }
            }
        )
        if(!post || (req.user.type!='teacher' && !post.status)){
            return res.send({ type: 'error', message: '目前無法對貼文進行操作（貼文暫時關閉中）。' }); 
        }

        return res.send({
            type: 'success',
            data: {
                name: req.user.name,
                level: req.user.level,
                createTime: createTime,
                userImgUrl: req.user.userImgUrl.url,
                message: message
            },
            message: '留言成功',
        });
  
    } catch (e) {
        console.error(e);
        return res.send({
            type: 'error',
            message: '伺服器錯誤，請洽客服人員協助。',
        });
    }
});

// 返回貼文圖片
router.get('/api/post/image/:idx/:imageName',async (req, res) => {
    const { idx, imageName } = req.params;
    
    const post = await postModel.findOne({ idx: idx });
    const databaseUrl = post.databaseUrl;
    const filePath = path.join(databaseUrl, imageName);

    if (fs.existsSync(filePath)) {

        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    } else {
        res.status(404).send('File not found');
    }
});

module.exports = router;