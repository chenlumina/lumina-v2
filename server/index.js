require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
// SPA 路由兜底
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});
app.listen(PORT, () => {
  console.log(`AI Chat 服务已启动: http://localhost:${PORT}`);
});
