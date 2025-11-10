// 針對 Learn 課程列表
const express = require('express');
const router = express.Router();
const userModel = require('../models/userModel');
const courseModel = require('../models/courseModel');
const groupModel = require('../models/groupModel');
const fs = require('fs');
const path = require('path');
const upload = require('../config/multer.config.js')

const { v4: uuidv4 } = require('uuid');

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


router.get('/api/learn/getCourse', authMiddleware, async (req, res) => {
    try {
        let courses = [];

        if (req.user.type === 'teacher') {
            courses = await courseModel.find({ group: req.user.group});
        } 
        else if (req.user.type === 'student') {
            courses = await courseModel.find({
                group: req.user.group,
                status: true,
            });
        }
        else {
            return res.send({
                type: 'error',
                message: '課程資料查詢失敗。',
            })
        }

        if (courses.length === 0) {
            return res.send({
                type: 'success',
                courses: [],
                message: '課程資料查詢成功。',
            });
        }

        courses = await Promise.all(
            courses.map(async (course) => {
                let bannerImg = [];
                
                const folderPath = course.folderPath;
                const bannerFolderPath = `${folderPath}/banner`

                if (fs.existsSync(bannerFolderPath)) {
                    bannerImg = fs.readdirSync(bannerFolderPath).map((file) => {
                        return {
                            name: file,
                            url: `/api/learn/getCourseBanner/${course.idx}/${file}`, // 使用相對URL返回圖片
                        };
                    });
                }
                // 若無 banner
                if(bannerImg.length == 0) bannerImg.push({name:'default_course_banner',url:'img/default_course_banner.jpg'})
                
                
                let idx,lock;
                if(course.studentList.includes(req.user.idx) || req.user.type == 'teacher'){
                    idx = course.idx
                    lock = false
                }
                else{
                    idx = null
                    lock = true
                }
                return {
                    idx: idx,
                    createTime: course.createTime,
                    courseId: course.courseId,
                    courseName: course.courseName,
                    courseType: course.courseType,
                    lecturer: course.lecturer,
                    status: course.status,
                    bannerImg: bannerImg,
                    lock:lock,
                };
            })
        );

        reorder_courses  = [
            ...courses.filter(c => !c.lock),
            ...courses.filter(c => c.lock)
        ];

        return res.send({
            type: 'success',
            courses: reorder_courses,
            message: '課程資料查詢成功。',
        });
    } catch (e) {
        console.log(e);
        return res.send({
            type: 'error',
            message: '伺服器錯誤，請洽客服人員協助。',
        });
    }
});

// 返回圖片
router.get('/api/learn/getCourseBanner/:idx/:imageName',async (req, res) => {
    const { idx, imageName } = req.params;
    
    const course = await courseModel.findOne({ idx: idx });
    const folderPath = course.folderPath;
    const filePath = path.join(folderPath, 'banner', imageName);

    if (fs.existsSync(filePath)) {

        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    } else {
        res.status(404).send('File not found');
    }
});


// 教材建立
router.post('/api/learn/createMaterial',upload.fields([{ name: 'attachments', maxCount: 1}]),authMiddleware,checkUsageMemory, async (req, res) => {
    
    const {idx, title} = req.body;

    const courses = await courseModel.findOne({idx:idx, group:req.user.group});

    if(!courses){
        return res.send({
            type:'error',
            message:'文件上傳失敗（專欄不存在）。'
        });
    }

    const databaseUrl = courses.folderPath;
    
    try {
        if (req.user.type === 'teacher') {
            
            // 創建文件專屬 idx
            const materialIdx = uuidv4();
            
            try{
                // 創建文件
                const filePath = `${databaseUrl}/${materialIdx}.pdf`
                let file = req.files['attachments'][0];
                if(file) fs.renameSync(file.path, filePath);

                const url = `/api/learn/getMaterial/${idx}/${materialIdx}`

                courses.meta.push({
                    idx: materialIdx,
                    title:title,
                    attachmentUrl:{
                        name:title,
                        url:url,
                        original: filePath
                    }
                });

                await courses.save();

                return res.send({
                    type:'success',
                    message:'文件上傳成功。'
                });

            }
            catch(e){
                console.log(e)
                return res.send({
                    type:'error',
                    message:'文件上傳失敗。'
                });
            }
        } 
        else {
            return res.send({
                type: 'error',
                message: '您沒有權限創建文件資料。',
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

// 教材更新
router.post('/api/learn/modifyMaterial',upload.fields([{ name: 'attachments', maxCount: 1}]),authMiddleware,checkUsageMemory, async (req, res) => {
    
    const {idx, materialIdx, title} = req.body;
    const result = await courseModel.updateOne(
        { idx: idx, group: req.user.group, 'meta.idx': materialIdx }, // 查找符合條件的課程
        {
            $set: {
                'meta.$.title': title,
            }
        }
    ,{ returnDocument: 'after' } );

    if(!result){
        return res.send({
            type:'error',
            message:'文件更新失敗（文件不存在）。'
        });
    }
    
    try {
        if (req.user.type === 'teacher') {
            
            try{

                const updatedCourse = await courseModel.findOne({ idx: idx, group: req.user.group });
                const updatedMaterial = updatedCourse.meta.find(item => item.idx === materialIdx);
            
                // 若有新文件才覆蓋舊文件
                let file = req.files['attachments'] ? req.files['attachments'][0]: null;
                if(file){
                    const filePath = updatedMaterial.attachmentUrl.original
                    if (fs.existsSync(filePath))fs.unlinkSync(filePath);
                    fs.renameSync(file.path, filePath);
                }

                // 返回更新項
                const output = {
                    attachmentUrl: updatedMaterial.attachmentUrl.url,
                    idx: updatedMaterial.idx,
                    title: updatedMaterial.title,
                    _id: updatedMaterial._id
                }

                return res.send({
                    type:'success',
                    material : output,
                    message:'文件更新成功。'
                });

            }
            catch(e){
                console.log(e)
                return res.send({
                    type:'error',
                    message:'文件更新失敗。'
                });
            }
        } 
        else {
            return res.send({
                type: 'error',
                message: '您沒有權限更新文件資料。',
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

// 教材順序更新
router.put('/api/learn/modifyIndex',authMiddleware, async (req, res) => {
    

    const {idx, method, materialIdx} = req.body;
    
    try {
        if (req.user.type === 'teacher') {
            const course = await courseModel.findOne({ idx, group: req.user.group });
            if (!course) return res.send({ type:'error', message: '專欄不存在' });
            
            let meta = course.meta;
            const index = meta.findIndex(m => m.idx === materialIdx);
            if (index === -1) return res.send({ type:'error', message: '找不到指定的專欄資料' });

            if (method === 'up' && index > 0) {
                // 往上移一位
                [meta[index - 1], meta[index]] = [meta[index], meta[index - 1]];
            } 
            else if (method === 'down' && index < meta.length - 1) {
                // 往下移一位
                [meta[index + 1], meta[index]] = [meta[index], meta[index + 1]];
            }

            await course.save();

            const simplifiedMaterial = course.meta.map(material => {
                return {
                    ...material._doc,
                    attachmentUrl:material.attachmentUrl.url
                };
            });

            res.send({type:'success', message:'專欄序列更新成功。', materials: simplifiedMaterial})
        } 
        else {
            return res.send({
                type: 'error',
                message: '您沒有權限更新文件資料。',
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

// 刪除教材
router.get('/api/learn/deleteMaterial/:idx/:materialIdx', authMiddleware, async (req, res) => {
    const { idx, materialIdx } = req.params;

    const courses = await courseModel.findOne({ idx: idx, group: req.user.group });

    if (!courses) {
        return res.send({
            type: 'error',
            message: '找不到專欄資料。',
        });
    }

    const material = courses.meta.find(item => item.idx === materialIdx);

    if (!material) {
        return res.send({
            type: 'error',
            message: '文件未找到。',
        });
    }

    try {
        if (req.user.type === 'teacher') {
            try {
                const filePath = material.attachmentUrl.original;

                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath)
                }

                const result = await courseModel.findOneAndUpdate(
                    { idx: idx, group: req.user.group, 'meta.idx': materialIdx },
                    {
                        $pull: {
                            meta: { idx: materialIdx }
                        }
                    },
                    { new: true }
                );

                if (!result) {
                    return res.send({
                        type: 'error',
                        message: '文件刪除失敗（文件不存在）。'
                    });
                }

                return res.send({
                    type: 'success',
                    message: '文件刪除成功。'
                });

            } catch (e) {
                console.log(e);
                return res.send({
                    type: 'error',
                    message: '文件刪除失敗。',
                });
            }
        } else {
            return res.send({
                type: 'error',
                message: '您沒有權限刪除文件資料。',
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

// pdf 文件閱覽
router.get('/api/learn/getMaterial/:idx/:materialIdx',authMiddleware, async (req, res) => {
    try {
        const { idx, materialIdx } = req.params;

        let filterCondition = null;
        if (req.user.type == 'teacher'){
            filterCondition = { 
                idx:idx, 
                group: req.user.group,
                status: true,
            }
        }
        else if (req.user.type == 'student'){
            filterCondition = { 
                idx:idx, 
                group: req.user.group,
                studentList: req.user.idx,
                status: true,
            }
        }
        
        if(!filterCondition) return res.send({ type: 'error',message: '未找到授權，請重新登入。'});

        const course = await courseModel.findOne(filterCondition);

        if (!course) return res.send({ type: 'error',message: '未找到授權，請重新登入。'});

        const material = course.meta.find(m => m.idx === materialIdx);
        if (!material) return res.send({ type: 'error',message: '專欄資源不存在。'});

        const filePath = material.attachmentUrl.original;
        if (!fs.existsSync(filePath)) return res.send({ type: 'error',message: '專欄資源不存在（文件不存在）。'});
        
        // 擷取進度條
        const stat = fs.statSync(filePath);
        res.setHeader('Content-Length', stat.size);

        res.setHeader('Content-Type', 'application/pdf');

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);

        stream.on('error', (err) => {
            console.error(err);
            return res.send({ type: 'error',message: '專欄資源不存在（文件讀取失敗）。'});
        });
    } 
    catch (err) {
        console.error(err);
        return res.send({ type: 'error',message: '系統內部異常，請聯絡客服人員。'});
    }
});
// 獲取教材列表
router.get('/api/learn/getCourseMaterial/:idx', authMiddleware, async (req, res) => {
    try {
        const idx = req.params.idx;

        const course = await courseModel.findOne({ idx:idx, group: req.user.group});
        
        if (!course) {
            return res.send({
                type: 'success',
                message: '課程教材查詢失敗。',
            });
        }

        const simplifiedMaterial = course.meta.map(material => {
            return {
                ...material._doc,
                attachmentUrl:material.attachmentUrl.url
            };
        });

        return res.send({
            type: 'success',
            materials: simplifiedMaterial,
            message: '課程教材查詢成功。',
        });
    } catch (e) {
        console.log(e);
        return res.send({
            type: 'error',
            message: '伺服器錯誤，請洽客服人員協助。',
        });
    }
});


module.exports = router;