const express = require('express');
const compression = require('compression');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(compression());

app.set('trust proxy', 'loopback, 192.168.0.1'); 


const rateLimit = require('express-rate-limit');

// 不受限速
const whitelistRoutes = [
    '/api/learn/getCourseBanner',
    '/api/post/image',
];

const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 分鐘
    max: 120,
    message: 'Too many requests from this account, please try again after a minute.',
    keyGenerator: (req, res) => {
        return req.headers['x-user-token'] || req.headers['x-user-fingerprint'];
    },
    skip: (req, res) => {
        return whitelistRoutes.some(route => req.path.startsWith(route));
    },
    handler: (req, res, next, options) => {
        return res.redirect('/');
    }
});

app.use(limiter);

app.use((req, res, next) => {
  next();
});


// 初始化資料庫
const { connectToDatabase, disconnectFromDatabase } = require('./db/db');
connectToDatabase();

process.on('SIGINT', function() {
    disconnectFromDatabase();
    process.exit(0);
});

const adminRouter = require('./routes/adminRouter');
app.use(adminRouter);

const loginRouter = require('./routes/loginRouter');
app.use(loginRouter);

const teacher_create_courseRouter = require('./routes/teacher_create_courseRouter');
app.use(teacher_create_courseRouter);

const teacher_create_studentRouter = require('./routes/teacher_create_studentRouter');
app.use(teacher_create_studentRouter);

const studentRouter = require('./routes/studentRouter');
app.use(studentRouter);

const postRouter = require('./routes/postRouter');
app.use(postRouter);

const learnRouter = require('./routes/learnRouter');
app.use(learnRouter);

const userInfoRouter = require('./routes/userInfoRouter');
app.use(userInfoRouter);

app.listen(3007,()=>{
    console.log('server is running on port 3007')
})

// 避免系統中斷
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});