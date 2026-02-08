const express = require('express');
const router = express.Router();

const paperRecordModel = require('../models/paperRecordModel');
const { v4: uuidv4 } = require('uuid');

// 檢查身份
const authMiddleware = require('../middleware/auth.middleware')

// 獲取紀錄資料
router.get('/api/paperRecord/getRecord',authMiddleware, async (req, res) => {
    try {
        const record = await paperRecordModel.findOne({ group: req.user.group});

        return res.send({
            type: 'success',
            record: record?.record ?? [],
            message: '資料查詢成功。',
        });

    } catch (e) {
        console.log(e);
        return res.send({
            type: 'error',
            message: '伺服器錯誤，請洽客服人員協助。',
        });
    }
});

// 新增紀錄
router.post('/api/paperRecord/add',authMiddleware, async (req, res) => {
    const uuid = uuidv4();
    if(req.user.type == 'teacher'){

        if(!req.body || !req.body.name || req.body.name.trim() ==''){
            return res.send({ type: 'error',message: '資料格式錯誤。'});
        }

        try {

            let record = await paperRecordModel.findOne({ group: req.user.group, creator: req.user.token});
            if (!record) {
                record = new paperRecordModel({
                    group: req.user.group,
                    creator: req.headers['x-user-token'],
                    detail: [],
                });
            }
            record.record.push({
                idx:uuid,
                name: req.body.name || '-'
            })
            await record.save();

            return res.send({
                type: 'success',
                message: '閱讀紀錄新增成功。',
            });
        } catch (e) {
            console.log(e);
            return res.send({
                type: 'error',
                message: '伺服器錯誤，請洽客服人員協助。',
            });
        }
    }
    else{
        res.send({
            type:'error',
            message:'您沒有權限新增閱讀紀錄。'
        })
    }
});

// 刪除紀錄
router.delete('/api/paperRecord/delete/:idx',authMiddleware, async (req, res) => {
    if(req.user.type == 'teacher'){

        try {
            const record = await paperRecordModel.findOne({ group: req.user.group, creator: req.user.token});
            
            if (!record) {
                return res.send({ type: 'error', message: '閱讀紀紀錄刪除失敗。'});
            }
            
            let targetIndex = record.record.findIndex(i => i.idx == req.params.idx);
            
            if(targetIndex !== -1){
                record.record.splice(targetIndex, 1);
                await record.save();
            }

            else {
                return res.send({ type: 'error', message: '閱讀紀紀錄刪除失敗。'});
            }

            return res.send({ type: 'success', message: '閱讀紀錄刪除成功。'});
        } catch (e) {
            console.log(e);
            return res.send({
                type: 'error',
                message: '伺服器錯誤，請洽客服人員協助。',
            });
        }
    }
    else{
        res.send({
            type:'error',
            message:'您沒有權限刪除計畫。'
        })
    }
});



module.exports = router;