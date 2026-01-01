const mongoose = require('mongoose');

const paperRecordSchema = new mongoose.Schema({
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
    record:[
        {
            idx:{
                type: String,
                required:true,
                unique: true,
                trim: true,
            },
            name:{
                type: String,
                trim: true,
                default:'-'
            },
            meta:{
                type: Object,
                default:{},
            }
        }
    ]
    
});
const paperRecordModel = mongoose.model('paperRecord', paperRecordSchema);

module.exports = paperRecordModel;