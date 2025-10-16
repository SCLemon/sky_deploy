const mongoose = require('mongoose');

const studyRecordSchema = new mongoose.Schema({
    group:{
        type: String,
        required:true,
        trim: true,
    },
    detail:[
        {
            idx:{
                type: String,
                required:true,
                unique: true,
                trim: true,
            },
            date:String,
            content:{
                type: String,
                trim: true,
                default:''
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

