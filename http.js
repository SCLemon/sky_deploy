const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 80;

// 配置代理
app.use('/api/', createProxyMiddleware({
  target: 'http://127.0.0.1:3007/api/',
  changeOrigin: true
}));

app.use('/login/', createProxyMiddleware({
  target: 'http://127.0.0.1:3007/login/',
  changeOrigin: true
}));

app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.listen(PORT,'0.0.0.0', () => {
  console.log(`Server is running on  http://127.0.0.1:${PORT}`);
});
