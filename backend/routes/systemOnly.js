const fs = require('fs');
const path = require('path');
const {format} = require('date-fns')
const { v4: uuidv4 } = require('uuid');

const userModel = require('../models/userModel');
const groupModel = require('../models/groupModel');

const { connectToDatabase } = require('../db/db');
connectToDatabase();

// 新增教師
async function createTeacher(){
    const account = 'blc0000421';
    const password = '34864015';
    const type = 'teacher';
    const groupNum = '0001'
    const name = 'SCLemon'
    
    // 檢查群組是否已建立
    const group = await groupModel.findOne({group:groupNum});
    if(!group){
        return console.log('群組尚未建立。')
    }

    const newUser = new userModel({
        idx: uuidv4(),
        token:uuidv4(),
        account: account,
        password: password,
        name: name,
        group: groupNum,
        userImgUrl:{
            url:'img/user.png',
        },
        level:10,
        createTime: format(new Date(),'yyyy-MM-dd HH:mm:ss'),
        type:type
    });

    await newUser.save();

    console.log('教師資料創建完畢')
}

// 新增群組資料庫
async function createDatabase(){
    const group = '0001'

    // 跨平台基準路徑
    let baseDir;
    if (process.platform === 'win32') {
        // Windows → 可以固定槽字母，或用硬碟標籤找槽
        baseDir = 'D:/sky_database';
    } 
    else if (process.platform === 'darwin') {
        // macOS → 外接硬碟通常掛載在 /Volumes
        baseDir = '/Volumes/sky_database';
    } 
    else {
        // Linux → 掛載在 /mnt 或 /media
        baseDir = '/mnt/sky_database';
    }

    // 最終資料庫路徑
    const databaseUrl = path.join(baseDir, group);

    if (!fs.existsSync(databaseUrl)) fs.mkdirSync(databaseUrl, { recursive: true });
    
    const newGroup = new groupModel({
        group:group,
        databaseUrl:databaseUrl,
        limit:{
            memory:1024*1024,
            classNum:1000,
            studentNum:1000,
        }
    })

    await newGroup.save();
    console.log(`${group} 群組創建完畢`)
}

async function create(){
    await createDatabase();
    await createTeacher();
}

create();


// 額外新增欄位
const update = async () => {
    try {
        const users = await userModel.find();

        for (let user of users) {
            await userModel.updateOne({ _id: user._id, type: 'teacher' }, { $set: { group: '0001' } });
        }

        console.log('所有文件的欄位已更新');
    } catch (error) {
        console.error('更新失敗:', error);
    }
};