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
                    const newId = uuidv4();
                    const filePath = `${folderPath}/${newId}${path.extname(file.originalname)}`
                    fs.renameSync(file.path, filePath);

                    availableAttachmentInfo.push({
                        filename: `${newId}${path.extname(file.originalname)}`,
                        id: newId,
                        position: attachmentInfo[idx].position
                    });

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
router.post('/api/post/modifyPost/:idx',authMiddleware, upload.fields([{ name: 'attachments'}]),async(req,res)=>{

    try {
        if (req.user.type === 'teacher') {

            const idx = req.params.idx;
            
            let attachments = req.files['attachments']?req.files['attachments']:[]
            
            if (!idx || typeof idx !== 'string' || idx.length !== 36) return res.send({ type: 'error', message: '貼文修改失敗！'});

            const post = await postModel.findOne({idx:idx, 'creator.idx':req.user.idx, group:req.user.group});

            if(!post) return res.send({ type: 'error',  message: `貼文修改失敗 (貼文不存在)`});
            
            post.content = req.body.content;
            await post.save();
        
            try{

                // 貼文專屬資料夾
                const folderPath = `${post.databaseUrl}`

                // 重新創建並寫入資料夾中
                if (fs.existsSync(folderPath)) fs.rmdirSync(folderPath, { recursive: true }); 
                fs.mkdirSync(folderPath, { recursive: true });

                // 寫入圖片
                const attachmentInfo = JSON.parse(req.body.attachmentInfo);
                let availableAttachmentInfo = [];

                attachments.forEach((file,idx) => {

                    const newId = uuidv4();
                    const filePath = `${folderPath}/${newId}${path.extname(file.originalname)}`
                    fs.renameSync(file.path, filePath);

                    availableAttachmentInfo.push({
                        filename: `${newId}${path.extname(file.originalname)}`,
                        id: newId,
                        position: attachmentInfo[idx].position
                    });

                });
                post.attachmentInfo = availableAttachmentInfo;
                await post.save();

                const postResponse = await getPostResponse([post], req.user);

                return res.send({ type:'success', message:'貼文修改成功。', post: postResponse[0]});

            }
            catch(e){
                console.log(e)
                return res.send({ type:'error', message:'貼文修改失敗。'});
            }
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

        posts = await getPostResponse(posts, req.user);

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

        posts = await getPostResponse(posts, req.user);

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

// （返回對應貼文呈現內容）
async function getPostResponse(posts, currentUser) {
    
    const userIdxSet = new Set();

    for (const post of posts) {
        // creator
        if (post.creator?.idx) {
            userIdxSet.add(post.creator.idx);
        }

        // message users
        for (const m of post.meta.message) {
            if (m.idx) {
                userIdxSet.add(m.idx);
            }
        }
    }

    // 一次汲取所有會用到的 users
    const users = await userModel.find(
        { idx: { $in: [...userIdxSet] }, status: true },
        { idx: 1, name: 1, level: 1, userImgUrl: 1 }
    );

    // 建立 Map
    const userMap = new Map(users.map(u => [u.idx, u]));

    return Promise.all(
        posts.map(async (post) => {
            let postImg = [];
            const databaseUrl = post.databaseUrl;

            if (fs.existsSync(databaseUrl)) {

                // v1.5.0.0 之後
                if (post.attachmentInfo && post.attachmentInfo.length > 0) {
                    postImg = post.attachmentInfo.map(p => ({
                        name: p.filename,
                        url: `/api/post/image/${post.idx}/${p.filename}`,
                        position: p.position
                    }));
                }
                // v1.5.0.0 以前（migration）
                else {
                    const attachmentInfo = fs.readdirSync(databaseUrl).map(file => {
                        const uuid = uuidv4();
                        const newFilename = uuid + path.extname(file);
                        const defaultPosition = { x: 0, y: 0, referWidth: 0, scale: 1 };

                        fs.renameSync(
                            path.join(databaseUrl, file),
                            path.join(databaseUrl, newFilename)
                        );

                        postImg.push({
                            name: newFilename,
                            url: `/api/post/image/${post.idx}/${newFilename}`,
                            position: defaultPosition
                        });

                        return {
                            filename: newFilename,
                            id: uuid,
                            position: defaultPosition
                        };
                    });

                    post.attachmentInfo = attachmentInfo;
                    await post.save();
                }
            }

            // 創建者
            const creator = userMap.get(post.creator?.idx);
            const creatorInfo = creator ? {
                name: creator.name,
                userImgUrl: creator.userImgUrl.url
            } : {
                name: '已刪除使用者',
                userImgUrl: null
            };

            // like
            const isLike = post.meta.like.some(
                likeUser => likeUser.idx === currentUser.idx
            );

            // 留言
            const message = post.meta.message
                .map(i => {
                    const user = userMap.get(i.idx);
                    if (!user) return null;

                    return {
                        name: user.name,
                        level: user.level,
                        userImgUrl: user.userImgUrl.url,
                        createTime: i.createTime,
                        message: i.message
                    };
                })
                .filter(Boolean);

            return {
                idx: post.idx,
                createTime: post.createTime,
                creator: creatorInfo,
                content: post.content,
                status: post.status,
                message,
                postImg,
                isLike,
                likeCount: post.meta.like.length
            };
        })
    );
}


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
    try{
        const { idx, imageName } = req.params;
    
        const post = await postModel.findOne({ idx: idx });

        if(!post || !post.databaseUrl){
            return res.status(404).send('File not found');
        }

        const baseDir = path.resolve(post.databaseUrl);
        const requestedPath = path.resolve(baseDir, imageName);
    
        // 防止跳躍出指定資料夾路徑
        if (!requestedPath.startsWith(baseDir + path.sep)) {
            return res.status(403).send('Access denied');
        }

        // 限制讀取副檔名
        const allowedExt = ['.jpg', '.jpeg', '.png', '.webp'];
        if (!allowedExt.includes(path.extname(imageName).toLowerCase())) {
            return res.status(400).send('Invalid file type');
        }

        if (fs.existsSync(requestedPath)) {
            const fileStream = fs.createReadStream(requestedPath);
            fileStream.pipe(res);
        } else {
            return res.status(404).send('File not found');
        }
    }
    catch(e){
        console.error(e);
        return res.status(500).send('Internal server error when retrieving image');
    }
});

module.exports = router;