const express = require('express');
const router = express.Router();

const studyRecordModel = require('../models/studyRecordModel');
const userModel = require('../models/userModel')
const { v4: uuidv4 } = require('uuid');
const { format, parseISO, subDays, isWithinInterval, startOfDay, endOfDay, differenceInMilliseconds} = require('date-fns');
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

// 獲取紀錄資料
router.get('/api/studyRecord/getRecord',authMiddleware, async (req, res) => {
    try {
        const record = await studyRecordModel.findOne({ group: req.user.group});
        let send = record? record.detail.reverse(): [];
        return res.send({
            type: 'success',
            record: send,
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

// 統計數據
router.get('/api/studyRecord/getStatistics', authMiddleware, async (req, res) => {
  try {
    const record = await studyRecordModel.findOne({ group: req.user.group });
    let arr = record ? record.detail : [];

    // 取得今日與七天前的日期區間
    const today = new Date();
    const sevenDaysAgo = subDays(today, 6);

    // 篩選近七天資料
    arr = arr.filter(cur => {
      const d = new Date(cur.date);
      return isWithinInterval(d, { start: startOfDay(sevenDaysAgo), end: endOfDay(today) });
    });

    // 以日期（MM:dd）累加 total
    const summary = arr.reduce((acc, cur) => {
      const dateKey = format(new Date(cur.date), 'MM/dd');
      const total = cur.statistics?.total || 0;
      acc[dateKey] = (acc[dateKey] || 0) + total;
      return acc;
    }, {});

    // 生成近七天日期清單，若沒資料補 0
    const send = Array.from({ length: 7 }, (_, i) => {
      const d = subDays(today, 6 - i); // 從七天前到今天
      const key = format(d, 'MM/dd');
      return { date: key, total: summary[key] || 0 };
    });
    // 拆成兩個陣列 date, total
    const dateArr = send.map(item => item.date);
    const totalArr = send.map(item => item.total / 60); // 由 sec 轉換為 min

    return res.send({
      type: 'success',
      record: {
        dateArr, totalArr
      },
      message: '資料查詢成功。',
    });
  } 
  catch (e) {
    console.error(e);
    return res.send({
      type: 'error',
      message: '伺服器錯誤，請洽客服人員協助。',
    });
  }
});


// 新增計畫
router.post('/api/studyRecord/create',authMiddleware, async (req, res) => {
    const uuid = uuidv4();
    if(req.user.type == 'teacher'){

        
        if(req.body.date.trim() =='' || req.body.content.trim() ==''){
            return res.send({ type: 'error',message: '資料不可為空。'});
        }

        // 檢查日期格式以及自動轉換
        let date;
        try{
            date = format(req.body.date, 'yyyy-MM-dd')
        }
        catch{
            return res.send({ type: 'error', message: '資料格式錯誤。'});
        }

        try {

            let record = await studyRecordModel.findOneAndUpdate({ group: req.user.group});
            if (!record) {
                record = new studyRecordModel({
                    group: req.user.group,
                    creator: req.headers['x-user-token'],
                    detail: [],
                });
            }
            record.detail.push({
                idx:uuid,
                date: date,
                content: req.body.content
            })
            await record.save();

            return res.send({
                type: 'success',
                message: '計畫新增成功。',
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
            message:'您沒有權限創建計畫。'
        })
    }
});

// 刪除計畫
router.delete('/api/studyRecord/delete/:idx',authMiddleware, async (req, res) => {
    if(req.user.type == 'teacher'){

        try {

            const record = await studyRecordModel.updateOne(
                { group: req.user.group },
                { $pull: { detail: { idx: req.params.idx } } },
                { new: true }
            );
            
            if (record.modifiedCount === 0) {
                return res.send({ type: 'error', message: '計畫刪除失敗。'});
            }

            return res.send({ type: 'success', message: '計畫新增成功。'});
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

// 修改計畫
router.put('/api/studyRecord/update/:idx',authMiddleware, async (req, res) => {
    if(req.user.type == 'teacher'){

        try {

            const record = await studyRecordModel.updateOne(
                { group: req.user.group },
                {
                    $set: {
                        'detail.$[elem].date': req.body.date,
                        'detail.$[elem].content': req.body.content,
                    }
                },
                {
                    arrayFilters: [{ 'elem.idx': req.params.idx }], // 選擇特定元素
                    new: true
                }
            );
            
            if (record.modifiedCount === 0) {
                return res.send({ type: 'error', message: '計畫變更失敗。'});
            }

            return res.send({ type: 'success', message: '計畫變更成功。'});
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
            message:'您沒有權限變更計畫。'
        })
    }
});

// 暫停 or 完成計畫
router.put('/api/studyRecord/recordTime/:idx',authMiddleware, async (req, res) => {
    if(req.user.type == 'teacher'){

        try {
            const start = parseISO(req.body.startTime);
            const end = parseISO(req.body.stopTime);
            let diff = differenceInMilliseconds(end, start)/1000
            if (isNaN(diff) || diff < 0) diff = 0; // 防呆

            const record = await studyRecordModel.updateOne(
                { group: req.user.group },
                {
                    $inc: {
                        'detail.$[elem].statistics.total': diff
                    },
                    $push:{
                        'detail.$[elem].statistics.record':{start: req.body.startTime, end: req.body.stopTime}
                    }
                },
                {
                    arrayFilters: [{ 'elem.idx': req.params.idx ,'elem.status': { $ne: '已完成' }}], // 選擇特定元素
                    new: true
                }
            );

            if (record.modifiedCount === 0) {
                return res.send({ type: 'error', message: '計畫紀錄失敗。'});
            }

            // 變更狀態
            let updateStatusResponse = {}
            if(req.body.finish) updateStatusResponse =  await updateStatus(req,'已完成');
            else updateStatusResponse = await updateStatus(req,'尚未完成');

            if(updateStatusResponse) res.send(updateStatusResponse)
            else return res.send({ type: 'success', message: '計畫紀錄成功。'});

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
            message:'您沒有權限變更計畫。'
        })
    }
});

// 開始進行計畫 --> 將該計畫狀態變更為 進行中
router.put('/api/studyRecord/startProcessing/:idx',authMiddleware, async (req, res) => {
    await updateStatus(req, '進行中');
    res.send({type: 'success', message: '狀態變更為進行中。'})
})


// 變更計畫狀態 -- 已完成, 執行中, 尚未完成
async function updateStatus(req, status){
    const record = await studyRecordModel.updateOne(
        { group: req.user.group },
        {
            $set: {
                'detail.$[elem].status': status,
            }
        },
        {
            arrayFilters: [{ 'elem.idx': req.params.idx }],
            new: true
        }
    );
    if (record.matchedCount === 0) {
        return { type: 'error', message: '狀態變更失敗。'};
    }
}

module.exports = router;