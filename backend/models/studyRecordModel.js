const mongoose = require('mongoose');

const studyRecordSchema = new mongoose.Schema({
    group:{
        type: String,
        required:true,
        trim: true,
    },
    creator:{
        type: String,
        required:true,
        unique: true,
        trim: true,
    },
    // 暫存前一項進行中的任務以避免資料遺失
    tempForPreviousTask: Object,
    
    detail:[
        {
            idx:{
                type: String,
                required:true,
                unique: true,
                trim: true,
            },
            date:String,
            projectType:{
                type: String,
                default: '其他'
            },
            expectTime:{
                type: Number,
                default: 90,
            },
            status:{
                type:String,
                default: '尚未完成'
            },
            content:{
                type: String,
                trim: true,
                default:'-'
            },
            statistics:{
                total:{ // 總時間
                    type:Number,
                    default:0,
                },
                record:[{ // 分段紀錄
                    start:String,
                    end:String,
                }]
            }
        }
    ]
    
});
const studyRecordModel = mongoose.model('studyRecord', studyRecordSchema);

module.exports = studyRecordModel;

