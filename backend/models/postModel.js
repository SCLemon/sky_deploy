const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
    createTime:String,
    idx:{
        type: String,
        required:true,
        unique: true,
        trim: true,
    },
    creator:{
        type: {
            idx:String,
        },
        required:true,
        trim: true,
    },
    group:{
        type: String,
        required:true,
        trim: true,
    },
    content:{
        type: String,
        trim: true,
        default:''
    },
    databaseUrl:{
        type: String,
        required:true,
        trim: true,
        unique: true,
    },
    status: {
        type: Boolean,
        default: true,
    },
    meta:{
        like:{
            type:[
                {
                    idx:{
                        type:String,
                    }
                }
            ],
            default:[]
        },
        message:{
            type:[
                {
                    idx: String,
                    createTime: String,
                    fingerprint:String,
                    message:String
                }
            ],
            default:[]
        }
    },
    attachmentInfo:{
        type: Array,
        default: [
            
        ],
    }
});
const postModel = mongoose.model('posts', postSchema);

module.exports = postModel;

/*
    "attachmentInfo" : [
        {
            "filename" : "6f139b0f-700f-4bdf-9f6b-a20bcb68f726.png",
            "id" : "6f139b0f-700f-4bdf-9f6b-a20bcb68f726",
            "url" : "blob:http://localhost:8080/c866d671-3b58-41ad-9254-66eaa10b4e4e",
            "position" : {
                "x" : NumberInt(0),
                "y" : 148.625,
                "referWidth" : NumberInt(710),
                "scale" : NumberInt(1)
            }
        }
    ],
*/