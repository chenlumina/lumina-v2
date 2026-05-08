require('dotenv').config();

// JWT_SECRET 安全检查
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your_jwt_secret_here_change_this') {
  console.error('❌ 请在 .env 中设置 JWT_SECRET（不能使用默认值）');
  process.exit(1);
}

const express = require('express');
const compression = require('compression');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const ttsRoutes = require('./routes/tts');
const app = express();
const PORT = process.env.PORT || 3000;

// gzip 压缩
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// 全局速率限制
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

// 注册/登录更严格的限制
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: '请求过于频繁，请稍后再试' }
});
app.use('/api/auth/', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/tts', ttsRoutes);

// SPA 路由兜底
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`AI Chat 服务已启动: http://localhost:${PORT}`);
});
