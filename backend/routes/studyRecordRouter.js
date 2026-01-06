const express = require('express');
const router = express.Router();

const studyRecordModel = require('../models/studyRecordModel');
const { v4: uuidv4 } = require('uuid');
const { format, parseISO, subDays, isWithinInterval, startOfDay, endOfDay, differenceInMilliseconds} = require('date-fns');
const fs = require('fs')

// 檢查身份
const authMiddleware = require('../middleware/auth.middleware')
const { upload, autoCleanupTmp } = require('../config/multer.config');

// 獲取紀錄資料
router.get('/api/studyRecord/getRecord',authMiddleware, async (req, res) => {
    try {
        const record = await studyRecordModel.findOne({ group: req.user.group});
        let send = record? record.detail.reverse().sort((a,b)=>{
            return new Date(b.date).getTime() - new Date(a.date).getTime()
        }): [];
        return res.send({
            type: 'success',
            executing: record?.tempForPreviousTask ?? null,
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

        
        if(!req.body.date || req.body.content.trim() =='' || req.body.expectTime < 15){
            return res.send({ type: 'error',message: '資料格式錯誤。'});
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

            let record = await studyRecordModel.findOneAndUpdate({ group: req.user.group, creator: req.user.token});
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
                expectTime: req.body.expectTime || 90,
                projectType: req.body.projectType || '其他',
                content: req.body.content || '-'
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
            // 不可刪除正在進行的計畫
            const record = await studyRecordModel.updateOne(
                { group: req.user.group, creator: req.user.token, 'tempForPreviousTask.idx': {$ne: req.params.idx} },
                { 
                    $set:{
                        tempForPreviousTask: null
                    },
                    $pull: { detail: { idx: req.params.idx } } 
                }
            );
            
            if (record.modifiedCount === 0) {
                return res.send({ type: 'error', message: '計畫刪除失敗。'});
            }

            return res.send({ type: 'success', message: '計畫刪除成功。'});
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
        
        if(!req.body.date || req.body.content.trim() ==''){
            return res.send({ type: 'error',message: '資料格式錯誤。'});
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

            const record = await studyRecordModel.updateOne(
                { group: req.user.group, creator: req.user.token, detail: {$elemMatch: { idx: req.params.idx, status: { $nin: ["進行中"] } } }}, // 進行中的計畫不可以修改計畫。
                {
                    $set: {
                        'detail.$[elem].date': date,
                        'detail.$[elem].content': req.body.content || '-',
                        'detail.$[elem].projectType': req.body.projectType || '其他',
                    }
                },
                {
                    arrayFilters: [{"elem.idx": req.params.idx, "elem.status": { $nin: ["進行中"] }}]
                }
            );

            if (record.matchedCount === 0) {
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
router.put('/api/studyRecord/recordTime/:idx/:taskId',authMiddleware, async (req, res) => {
    if(req.user.type == 'teacher'){

        try {

            // 查找是否正在進行計畫 --> 若為 null 則返回錯誤訊息。
            const r = await studyRecordModel.findOne({group: req.user.group, creator: req.user.token, tempForPreviousTask: { $ne: null }})
            if(!r) return res.send({type: 'warning', message:'請確認是否已從其他裝置執行紀錄。'})


            const start = parseISO(r.tempForPreviousTask.startTime);
            const end = parseISO(req.body.stopTime);
            let diff = differenceInMilliseconds(end, start)/1000 // 秒
            if (isNaN(diff) || diff < 0) diff = 0; // 防呆

            const record = await studyRecordModel.updateOne(
                { group: req.user.group, creator: req.user.token, 'tempForPreviousTask.taskId': req.params.taskId}, // 前端傳來的 taskId 必須和正在執行的任務相符才更新，以避免重複執行紀錄。
                {
                    $set:{
                        tempForPreviousTask: null
                    },
                    $inc: {
                        'detail.$[elem].statistics.total': diff
                    },
                    $push:{
                        'detail.$[elem].statistics.record':{start: r.tempForPreviousTask.startTime, end: req.body.stopTime}
                    }
                },
                {
                    arrayFilters: [{"elem.idx": req.params.idx, "elem.status": { $in: ["進行中"] }}]
                }
            );

            if (record.modifiedCount === 0) {
                return res.send({ type: 'error', message: '計畫紀錄失敗。'});
            }

            // 變更狀態
            let updateStatusResponse = {}
            if(req.body.finish){
                const updatedDoc = await studyRecordModel.findOne(
                    { group: req.user.group, creator: req.user.token, 'detail.idx': req.params.idx },
                    { 'detail.$': 1 } 
                );
                const target = updatedDoc.detail[0];

                // 閾值為 +- 30 min
                const status = (target.statistics.total/60) > target.expectTime + 30 ? '延遲完成' 
                                :(target.statistics.total/60) < target.expectTime - 30 ? '提前完成':'已完成';

                updateStatusResponse = await updateStatus(req, status);
            }
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

    const record = await studyRecordModel.updateOne(
        { group: req.user.group, creator: req.user.token, tempForPreviousTask: null, detail: {$elemMatch: { idx: req.params.idx, status: "尚未完成" } }}, // 只有在尚未完成的情況下，能夠執行任務。
        {
            $set: {
                tempForPreviousTask: {
                    idx: req.params.idx,
                    taskId : uuidv4(),
                    startTime: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
                }
            },
        },
    );

    if(record.matchedCount == 0){
        return res.send({type: 'error', message: '紀錄執行失敗。'})
    }
    await updateStatus(req, '進行中');
    return res.send({type: 'success', message: '狀態變更為進行中。'})
})

// 匯出資料
router.get('/api/studyRecord/export/:idx', authMiddleware, async (req, res) => {
    try {
        if(req.user.type != 'teacher') return res.send(JSON.stringify({type: 'error', message: '資料汲取失敗（使用者權限不足）'}));
        
        const { idx } = req.params;

        const record = await studyRecordModel.findOne({
            group: req.user.group,
            creator: req.user.token,
            "detail.idx": idx,
            "detail.status": { $ne: "進行中" },
        });

        if (!record) return res.send({ type: 'error', message: '找不到指定的紀錄。' });


        const targetDetail = record.detail.find(d => d.idx === idx);

        if (!targetDetail) return res.send({ type: 'error', message: '該子項不存在。'});

        // 匯出該子項（例如 JSON 檔）
        res.setHeader('Content-Disposition', `attachment; filename=record_${idx}.json`);
        res.setHeader('Content-Type', 'application/json');
        return res.send(JSON.stringify(targetDetail, null, 2));

    } 
    catch (err) {
        console.error(err);
        return res.send({ type: 'error', message: '伺服器錯誤，請洽客服人員協助。'});
    }
});


// 匯入資料
router.post('/api/studyRecord/import', authMiddleware, upload.single('file'), autoCleanupTmp, async (req, res) => {
    
    if(req.user.type != 'teacher') return res.send(JSON.stringify({type: 'error', message: '資料匯入失敗（使用者權限不足）'}));
    if (!req.file) return res.send({ type: 'error',  message: '未上傳檔案。'});
    const filePath = req.file.path;
    
    try {

        const fileBuffer = fs.readFileSync(filePath, 'utf-8');
        const importedData = JSON.parse(fileBuffer);

        if (!importedData.idx || !importedData.date || !importedData.projectType || !importedData.expectTime || !importedData.status || !importedData.content || !importedData.statistics) 
            return res.send({ type: 'error', message: '檔案格式不正確。'});

        const record = await studyRecordModel.findOne({ group: req.user.group });

        if (!record) {
            const newRecord = new studyRecordModel({ group: req.user.group, detail: [importedData]});
            await newRecord.save();
            return res.send({ type: 'success', message: `資料匯入成功。` });
        } 
        
        const duplicate = record.detail.some(d => d.idx === importedData.idx);
        if (duplicate) return res.send({ type: 'error', message: `資料匯入失敗（紀錄已存在）`});

        // 不重複才寫入
        record.detail.push(importedData);
        await record.save();
        return res.send({ type: 'success', message: '資料匯入成功。'});

        
    } 
    catch (err) {
        console.log(err)
        res.send({ type: 'error', message: '伺服器錯誤，請洽客服人員協助。'});
    }
});


// 變更計畫狀態 -- 已完成, 執行中, 尚未完成
async function updateStatus(req, status){
    const record = await studyRecordModel.updateOne(
        { group: req.user.group, creator: req.user.token},
        {
            $set: {
                'detail.$[elem].status': status,
            }
        },
        {
            arrayFilters: [{ 'elem.idx': req.params.idx }],
        }
    );
    if (record.matchedCount === 0) {
        return { type: 'error', message: '狀態變更失敗。'};
    }
}

module.exports = router;