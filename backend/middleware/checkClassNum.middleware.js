const groupModel = require('../models/groupModel')
const courseModel = require('../models/courseModel');

const checkClassNum = async(req,res,next)=>{
    try{
        const group = await groupModel.findOne({group: req.user.group})

        if (!group) {
            return res.send({
                type: 'error',
                message: '課程群組不存在。',
            });
        }
        const limitNum = group.limit.classNum;

        let course = await courseModel.find({ group: req.user.group });

        if (course.length >= limitNum) {
            return res.send({
                type: 'error',
                message: `創建課程已達限制 ${limitNum} 堂，如需調額請洽客服人員。`,
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

module.exports = checkClassNum