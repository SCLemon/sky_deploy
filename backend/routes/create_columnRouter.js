const express = require('express');
const router = express.Router();
const courseModel = require('../models/courseModel');
const groupModel = require('../models/groupModel')
const fs = require('fs');
const {format} = require('date-fns')
const { v4: uuidv4 } = require('uuid');
const path = require('path')

const authMiddleware = require('../middleware/auth.middleware')
const { checkUsageMemory } = require('../middleware/checkUsageMemory.middleware')
const checkClassNum = require('../middleware/checkClassNum.middleware')
const { upload, autoCleanupTmp } = require('../config/multer.config');


// 創建課程
router.post('/api/infoPage/createCourse',authMiddleware,upload.fields([{ name: 'attachments', maxCount: 2}]),autoCleanupTmp,checkClassNum,checkUsageMemory, async (req, res) => {
    
    const {courseId,courseName, courseType,lecturer} = req.body;

    const groupInfo = await groupModel.findOne({group: req.user.group});
    if(!groupInfo){
        return res.send({
            type:'error',
            message:'課程創建失敗（群組不存在）。'
        });
    }

    const databaseUrl = groupInfo.databaseUrl;
    try {
        if (req.user.type === 'teacher') {
            // 創建課程專屬 idx
            const idx = uuidv4();
            
            
            try{
                // 創建課程專屬資料夾
                const folderPath = `${databaseUrl}/course/${idx}`
                const bannerFolderPath = `${folderPath}/banner`

                // 先寫入資料庫
                const newCourse = new courseModel({
                    idx:idx,
                    folderPath:folderPath,
                    courseId,
                    courseName,
                    courseType: (courseType && courseType.trim() != '') ? courseType : '其他類別',
                    lecturer,
                    group: req.user.group,
                    createTime: format(new Date(),'yyyy-MM-dd HH:mm:ss'),
                });

                // 再創建和將 Banner 寫入資料夾中
                if (!fs.existsSync(folderPath)){
                    fs.mkdirSync(folderPath, { recursive: true });
                }
                if(!fs.existsSync(bannerFolderPath)){
                    fs.mkdirSync(bannerFolderPath, { recursive: true });
                }
                
                // 將 banner 移入到資料夾中
                let attachments = req.files['attachments']?req.files['attachments']:[]
                attachments.forEach((file) => {
                    const filePath = `${bannerFolderPath}/${file.originalname}`
                    fs.renameSync(file.path, filePath);
                });

                // 預設第一份文件
                const materialIdx = uuidv4();
                const filePath = `${folderPath}/${materialIdx}.pdf`
                
                const defaultFileUrl = path.join(__dirname, '../assets/User_Guideline.pdf');

                // 若預設文件不存在，則直接跳過
                if (!fs.existsSync(defaultFileUrl)) {
                    await newCourse.save();
                    return res.send({
                        type:'success',
                        message:'課程創建成功。'
                    });
                }

                // 若存在預設文件，則直接寫入。
                fs.copyFileSync(defaultFileUrl, filePath);
                const url = `/api/learn/getMaterial/${idx}/${materialIdx}`
                newCourse.meta.push({
                    idx: materialIdx,
                    title: 'User Guideline',
                    attachmentUrl:{
                        name: 'User_Guideline',
                        url:url,
                        original: filePath
                    }
                });
                
                await newCourse.save();

                return res.send({
                    type:'success',
                    message:'課程創建成功。'
                });

            }
            catch(e){
                console.log(e)
                return res.send({
                    type:'error',
                    message:'課程創建失敗。'
                });
            }
        } 
        else {
            return res.send({
                type: 'error',
                message: '您沒有權限創建課程資料。',
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

// 獲取課程資料
router.get('/api/infoPage/getCourse',authMiddleware, async (req, res) => {

    try {

        if (req.user.type === 'teacher') {

            let courses = (await courseModel.find({ group: req.user.group })).reverse();

            if(courses.length == 0) {
                return res.send({
                    type: 'success',
                    courses:[],
                    message: '資料查詢成功。',
                });
            }
            
            courses = courses.map(obj=>{
                return {
                    idx:obj.idx,
                    createTime:obj.createTime,
                    courseId:obj.courseId,
                    courseName:obj.courseName,
                    courseTime:obj.courseTime,
                    courseType: obj.courseType,
                    lecturer:obj.lecturer,
                    status:obj.status,
                    studentList:obj.studentList
                }
            })

            return res.send({
                type: 'success',
                courses:courses,
                message: '資料查詢成功。',
            });
        } 
        else {
            return res.send({
                type: 'error',
                message: '您沒有權限查看課程資料。',
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

// 刪除課程
router.delete('/api/infoPage/deleteCourse/:idx',authMiddleware,async(req,res)=>{

    try {
        if (req.user.type === 'teacher') {

            const idx = req.params.idx;
            
            if (!idx || typeof idx !== 'string' || idx.length !== 36) {
                return res.send({
                    type: 'error',
                    message: '課程刪除失敗！'
                });
            }

            const groupInfo = await groupModel.findOne({group: req.user.group});
            if(!groupInfo){
                return res.send({
                    type:'error',
                    message:'課程刪除失敗（群組不存在）。'
                });
            }

            const deletedCourse = await courseModel.findOne({ idx: idx, group:req.user.group });

            if (!deletedCourse) {
                return res.send({
                    type: 'error',
                    message: '課程刪除失敗！',
                });
            }

            // 先刪除課程專屬資料夾
            const folderPath = deletedCourse.folderPath;

            if (fs.existsSync(folderPath)){
                fs.rmSync(folderPath, { recursive: true, force: true });
            }

            // 再刪除課程
            await deletedCourse.deleteOne();

            return res.send({
                type: 'success',
                message: `課程 ${deletedCourse.courseId} 已成功刪除。`,
            });
        } 
        else {
            return res.send({
                type: 'error',
                message: '您沒有權限刪除課程資料。',
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

// 隱藏課程
router.put('/api/infoPage/stopCourse/:idx',authMiddleware,async(req,res)=>{
    try {
        if (req.user.type === 'teacher') {

            const idx = req.params.idx;
            
            if (!idx || typeof idx !== 'string' || idx.length !== 36) {
                return res.send({
                    type: 'error',
                    message: '用戶權限變更失敗！'
                });
            }
            const course = await courseModel.findOne({ idx: idx, group:req.user.group });

            if (!course) {
                return res.send({
                    type: 'error',
                    message: '課程權限變更失敗！',
                });
            }

            const updatedCourse = await courseModel.findOneAndUpdate({ idx: idx, group:req.user.group },{ $set: { status: !course.status } },{ new: true });

            if (!updatedCourse) {
                return res.send({
                    type: 'error',
                    message: '用戶權限變更失敗！',
                });
            }

            return res.send({
                type: 'success',
                message: `課程 ${updatedCourse.courseId} 權限變更成功。`,
            });
        } 
        else {
            return res.send({
                type: 'error',
                message: '您沒有權限修改課程資料。',
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

// 指派課程
router.post('/api/infoPage/setStudentToCourse',authMiddleware,async(req,res)=>{
    let {idx, courseId, courseName, courseType, lecturer, studentList} = req.body;

    try {
        if (req.user.type === 'teacher') {
            const setCourse = await courseModel.findOneAndUpdate({idx:idx, group:req.user.group},{
                $set: { 
                    courseId:courseId,
                    courseName: courseName,
                    courseType: courseType,
                    lecturer:lecturer,
                    studentList: studentList 
                }
            })

            if (!setCourse) {
                return res.send({
                    type: 'error',
                    message: '課程修改失敗！',
                });
            }

            return res.send({
                type: 'success',
                message: `課程 ${setCourse.courseId} 修改成功。`,
            });
        } 
        else {
            return res.send({
                type: 'error',
                message: '您沒有權限修改課程。',
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

// 獲取特定課程的修課名單
router.get('/api/infoPage/getCourseStudentList/:idx',authMiddleware, async (req, res) => {
    const idx = req.params.idx;
    try {

        if (req.user.type === 'teacher') {

            let target = await courseModel.findOne({ idx:idx, group: req.user.group });

            if (!target) {
                return res.send({
                    type: 'error',
                    message: '修課資料查詢失敗。',
                });
            }

            return res.send({
                type: 'success',
                studentList:target.studentList,
                message: '修課資料查詢成功。',
            });
        } 
        else {
            return res.send({
                type: 'error',
                message: '您沒有權限查看修課名單。',
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