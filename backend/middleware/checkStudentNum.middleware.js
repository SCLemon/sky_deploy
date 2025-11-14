const userModel = require('../models/userModel');
const groupModel = require('../models/groupModel')

const checkStudentNum = async(req,res,next)=>{
    try{
        const group = await groupModel.findOne({group: req.user.group})

        if (!group) {
            return res.send({
                type: 'error',
                message: '課程群組不存在。',
            });
        }
        const limitNum = group.limit.studentNum;

        let students = await userModel.find({ type: 'student', group: req.user.group });

        if (students.length >= limitNum) {
            return res.send({
                type: 'error',
                message: `創建人數已達限制 ${limitNum} 人，如需調額請洽客服人員。`,
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

module.exports = checkStudentNum