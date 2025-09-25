// 針對用戶貼文
const express = require('express');
const router = express.Router();
const userModel = require('../models/userModel');
const groupModel = require('../models/groupModel')
const postModel = require('../models/postModel')
const courseModel = require('../models/courseModel')
const fs = require('fs');
const {format} = require('date-fns')
const { v4: uuidv4 } = require('uuid');
const multer = require('multer')
const path = require('path')

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

// 檢查是否超過空間用量
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
        const size = getFolderSize(databaseUrl) / (1024*1024);

        if (size >= limitMemory) {
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



// 創建貼文
const upload = multer();
router.post('/api/post/create',upload.fields([{ name: 'attachments'}]),authMiddleware,checkUsageMemory, async (req, res) => {
    
    const {content} = req.body;
    let attachments = req.files['attachments']?req.files['attachments']:[]

    if(content.trim().length == 0 && attachments.length == 0){
        return res.send({
            type:'error',
            message:'貼文內容不可為空。'
        });
    }
    const groupInfo = await groupModel.findOne({group: req.user.group});
    if(!groupInfo){
        return res.send({
            type:'error',
            message:'貼文創建失敗（群組不存在）。'
        });
    }
    
    const databaseUrl = groupInfo.databaseUrl;
    try {
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
                if (!fs.existsSync(folderPath)){
                    fs.mkdirSync(folderPath, { recursive: true });
                }

                attachments.forEach((file) => {
                    const filePath = `${folderPath}/${file.originalname}`
                    fs.writeFileSync(filePath, file.buffer);
                });

                return res.send({
                    type:'success',
                    message:'貼文創建成功。'
                });

            }
            catch(e){
                console.log(e)
                return res.send({
                    type:'error',
                    message:'貼文創建失敗。'
                });
            }
        } 
        else {
            return res.send({
                type: 'error',
                message: '您沒有權限創建貼文。',
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
    try {
        let posts = [];
        
        if (req.user.type === 'teacher') {
            posts = (await postModel.find({ group: req.user.group }).sort({ _id: -1 }).skip(offset).limit(pageSize)).reverse();
        } 
        else if (req.user.type === 'student') {
            posts = (await postModel.find({ group: req.user.group, status: true }).sort({ _id: -1 }).skip(offset).limit(pageSize)).reverse();
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
                    postImg = fs.readdirSync(databaseUrl).map((file) => {
                        return {
                            name: file,
                            url: `/api/post/image/${post.idx}/${file}`,
                        };
                    });
                }

                // 創建者
                const creator = await userModel.findOne({idx:post.creator.idx})
                let creatorInfo = {
                    name : creator.name,
                    userImgUrl: creator.userImgUrl.url
                }

                const isLike = post.meta.like.some((likeUser) => likeUser.idx === req.user.idx);

                // 留言
                let message = [];
                for (const i of post.meta.message) {
                    const user = await userModel.findOne({ idx: i.idx });
                    if (!user) continue;
                    message.push({
                        name: user.name,
                        level: user.level,
                        userImgUrl: user.userImgUrl.url,
                        createTime: i.createTime,
                        message: i.message
                    });
                }
                
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
    const page = req.query.page || 1;
    const pageSize = 5;
    const offset = (page - 1) * pageSize;
    try {
        let posts = [];
        
        const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const share = req.params.share;

        if(uuidV4Regex.test(share)){
            const post = await postModel.findOne({ group: req.user.group, idx: share });
            if(post) posts.push(post)
            if(posts.length == 0){
                return res.send({
                    type: 'success',
                    posts:[],
                    message: '用戶資料查詢成功。',
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
                    postImg = fs.readdirSync(databaseUrl).map((file) => {
                        return {
                            name: file,
                            url: `/api/post/image/${post.idx}/${file}`,
                        };
                    });
                }

                // 創建者
                const creator = await userModel.findOne({idx:post.creator.idx})
                let creatorInfo = {
                    name : creator.name,
                    userImgUrl: creator.userImgUrl.url
                }

                const isLike = post.meta.like.some((likeUser) => likeUser.idx === req.user.idx);

                // 留言
                let message = [];
                for (const i of post.meta.message) {
                    const user = await userModel.findOne({ idx: i.idx });
                    if (!user) continue;
                    message.push({
                        name: user.name,
                        level: user.level,
                        userImgUrl: user.userImgUrl.url,
                        createTime: i.createTime,
                        message: i.message
                    });
                }
                
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
// 按讚
router.get('/api/post/toggleLikePost/:idx', authMiddleware, async (req, res) => {
    try {
        const postIdx = req.params.idx;
    
        const post = await postModel.findOne({
            idx: postIdx,
            group: req.user.group,
            'meta.like.idx': req.user.idx
        });
    
        let updatedPost;
        if (post) {
            updatedPost = await postModel.findOneAndUpdate(
            { idx: postIdx, group: req.user.group },
            {
                $pull: {
                    'meta.like': { idx: req.user.idx }
                }
            },
            { new: true }
            );
    
            if (!updatedPost) return res.send({ type: 'error', message: '取消按讚失敗' });
        } 
        else {
            // 如果沒按過讚，則按讚（$push）
            updatedPost = await postModel.findOneAndUpdate(
            { idx: postIdx, group: req.user.group },
            {
                $push: {
                'meta.like': { idx: req.user.idx }
                }
            },
            { new: true }
            );
    
            if (!updatedPost) return res.send({ type: 'error', message: '貼文按讚失敗' });
        }

        return res.send({ type: 'success', message: '貼文按讚執行完畢', likeCount: updatedPost.meta.like.length});
  
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
        const postIdx = req.body.postIdx;
        const message = req.body.message;
        const fingerprint = req.headers['x-user-fingerprint'];
        const createTime = format(new Date(),'yyyy-MM-dd HH:mm:ss');
        if(!postIdx || message.trim() == ''){
            return res.send({
                type: 'error',
                message: '留言失敗（訊息不可為空）',
            });
        }
        if (!fingerprint || !/^[a-f0-9]{64}$/.test(fingerprint)) {
            return res.send({
                type: 'error',
                message: '留言失敗（參數異常錯誤）',
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
        if(!post){
            return res.send({
                type: 'error',
                message: '留言失敗',
            });
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