// 全頁驗證機制
const express = require('express');
const router = express.Router();

const userModel = require('../models/userModel');

const {format} = require('date-fns')

const levelTitle = [
    '新手會員','普通會員','進階會員','高級會員','鉑金會員',
    '鑽石會員','星耀會員','頂級會員','版主','頂級版主'
]
// anonymous mode
router.post('/login/anonymous', async (req, res) => {
    const account = 'Visitor';
    const type = 'student'

    try {
        const user = await userModel.findOne({ account, type });
        if (!user) {
            return res.send({
                type:'error',
                message:'本網站暫時不開放訪客模式登入。'
            });
        }
        if (!user.status){
            return res.send({
                type:'error',
                message:'本網站暫時不開放訪客模式登入。'
            });
        }

        const fingerprint = req.headers['x-user-fingerprint'];
        if (!fingerprint || !/^[a-f0-9]{64}$/.test(fingerprint)) {
            return res.send({ type: 'error',message: '驗證失敗（參數異常錯誤）'});
        }

        const loginTime = format(new Date(), 'yyyy-MM-dd HH:mm:ss')
        user.lastOnline = loginTime;
        user.fingerprint = fingerprint;
        await user.save();

        res.cookie('authToken',user.token,{
            maxAge:86400 * 1000 * 3, // 3 天
        })
        userData = {
            idx:user.idx,
            account:user.account,
            typeEng:user.type,
            userImgUrl:user.userImgUrl.url,
            level: {
                level: user.level,
                levelTitle: levelTitle[user.level - 1]
            },
            type: user.type == 'teacher'?'教師':'學生',
            name: user.name
        }
        return res.send({
            type:'success',
            userInfo: userData,
            message:'登入成功！'
        });
        
    } catch (e) {
        console.log(e)
        return res.send({
            type:'error',
            message:'伺服器錯誤，請洽客服人員協助。'
        });
    }
});
// 登入驗證
router.post('/login/verify', async (req, res) => {
    const {account, password, type} = req.body;

    if (!account || !password || !type) {
        return res.send({
            type:'error',
            message:'登入資料不可為空。'
        });
    }

    try {
        const user = await userModel.findOne({ account, password, type });
        if (!user) {
            return res.send({
                type:'error',
                message:'帳號或密碼錯誤。'
            });
        }
        if (!user.status){
            return res.send({
                type:'error',
                message:'帳號已被凍結，請洽詢客服人員協助。'
            });
        }
        const fingerprint = req.headers['x-user-fingerprint'];
        if (!fingerprint || !/^[a-f0-9]{64}$/.test(fingerprint)) {
            return res.send({ type: 'error',message: '驗證失敗（參數異常錯誤）'});
        }
        const loginTime = format(new Date(), 'yyyy-MM-dd HH:mm:ss')
        user.lastOnline = loginTime;
        user.fingerprint = fingerprint;
        await user.save();

        res.cookie('authToken',user.token,{
            maxAge:86400 * 1000 * 3, // 3 天
        })
        userData = {
            idx:user.idx,
            account:user.account,
            typeEng:user.type,
            userImgUrl:user.userImgUrl.url,
            level: {
                level: user.level,
                levelTitle: levelTitle[user.level - 1]
            },
            type: user.type == 'teacher'?'教師':'學生',
            name: user.name
        }
        return res.send({
            type:'success',
            userInfo: userData,
            message:'登入成功！'
        });
        
    } catch (e) {
        console.log(e)
        return res.send({
            type:'error',
            message:'伺服器錯誤，請洽客服人員協助。'
        });
    }
});

// token 驗證
router.post('/login/token', async (req, res) => {
    const token = req.headers['x-user-token']
    const save = req.body.save;
    try {
        const user = await userModel.findOne({ token });
        if (!user) {
            return res.send({type:'error', message:'無效使用者，請重新登入', showAlert:true});
        }
        else if(!user.status){
            return res.send({type:'error', message:'此帳號已被凍結，請洽客服人員', showAlert:true});
        }
        userData = {
            idx:user.idx,
            account:user.account,
            typeEng:user.type,
            name: user.name,
            level: {
                level: user.level,
                levelTitle: levelTitle[user.level - 1]
            },
            userImgUrl:user.userImgUrl.url,
            type: user.type == 'teacher'?'教師':'學生'
        }

        const fingerprint = req.headers['x-user-fingerprint'];
        if (!fingerprint || !/^[a-f0-9]{64}$/.test(fingerprint)) {
            return res.send({ type: 'error',message: '驗證失敗（參數異常錯誤）'});
        }

        const loginTime = format(new Date(), 'yyyy-MM-dd HH:mm:ss')
        user.lastOnline = loginTime;
        user.fingerprint = fingerprint;
        if(save) await user.save();

        return res.send({
            type:'success',
            userInfo: userData,
            message:'登入成功！',
            showAlert: false
        });
    } 
    catch (e) {
        return res.send({type:'error', message:'伺服器錯誤' ,showAlert:true});
    }
});



module.exports = router;