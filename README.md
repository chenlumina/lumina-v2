# ✨ Lumina-v2

**Lumina-v2** 是一个基于 Node.js 的现代化 AI 聊天应用，支持**流式对话**、**多模型切换**、**长期记忆**以及**移动端完美适配**。

这是 Lumina 的全新升级版本，采用 SQLite + JWT 架构，更稳定、更易扩展。

---

## ✨ 核心特性

- 💬 **流式输出**：基于 SSE 的实时打字效果，跨 chunk 不丢字。
- 🧠 **长期记忆**：图形化记忆管理面板，AI 在每次对话中自动加载你的偏好。
- 🔄 **多模型切换**：支持 DeepSeek 全系列 & MiMo 模型，一键更换。
- 📱 **移动端适配**：键盘弹起时聊天内容自动上推，侧边栏手势滑出。
- 📂 **多对话管理**：创建、切换、删除对话，历史记录持久保存在 SQLite。
- 🔒 **安全可靠**：JWT 鉴权、bcrypt 密码加密、路径防遍历、环境变量隔离。

---

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Node.js, Express 4, better-sqlite3 |
| 认证 | JWT, bcryptjs |
| 通信 | SSE (Server-Sent Events) |
| AI 模型 | DeepSeek / MiMo (OpenAI 兼容接口) |
| 前端 | 原生 HTML/CSS/JS (SPA), marked.js, highlight.js |
| 部署 | PM2 进程守护 |

---

## 📂 项目结构
lumina-v2/
├── server/
│ ├── index.js # 入口，路由挂载
│ ├── db/init.js # 数据库初始化 & 表结构
│ ├── middleware/auth.js # JWT 认证中间件
│ └── routes/
│ ├── auth.js # 注册/登录接口
│ └── chat.js # 对话 & 记忆管理接口
├── public/
│ ├── index.html # 前端主页面
│ ├── css/style.css # 样式
│ └── js/app.js # 前端逻辑
├── .env.example # 环境变量示例
├── .gitignore
└── package.json

text

---

## 🚀 快速开始

### 1. 克隆仓库
```bash
git clone https://github.com/chenlumina/lumina-v2.git
cd lumina-v2
2. 安装依赖
bash
npm install
3. 配置环境变量
创建 .env 文件，参考 .env.example 填入你的 API Key：

text
PORT=3000
JWT_SECRET=你的JWT密钥
DEEPSEEK_API_KEY=sk-你的DeepSeekKey
DEEPSEEK_BASE_URL=https://api.deepseek.com
MIMO_API_KEY=sk-你的MiMoKey
MIMO_BASE_URL=https://api.xiaomimimo.com/v1
4. 启动服务
bash
node server/index.js
生产环境推荐使用 PM2：

bash
npm install -g pm2
pm2 start server/index.js --name lumina-v2
5. 访问
浏览器打开 http://localhost:3000（端口可自定义）

📖 使用指南
模型切换
点击输入框右侧的 ⚙️ 图标，选择你想要的 AI 模型（DeepSeek-Chat / DeepSeek-Reasoner / MiMo 等），立即生效。

长期记忆
左侧菜单点击 “记忆管理”

输入你的偏好或要求（例如“请总是用中文回答，并给出代码示例”）

点击保存，之后所有新对话都会自动遵循这条记忆

可随时编辑或清除

多对话管理
点击 + 新对话 创建独立会话

切换对话：点击左侧对话列表中的条目

删除对话：鼠标悬停时出现删除按钮（移动端长按）

聊天操作
Enter 发送消息，Shift + Enter 换行

移动端点左上角 ☰ 打开侧边栏

⚠️ 安全提醒
API Key 存储在 .env 中，不会提交到仓库（已添加 .gitignore）

数据库文件 server/db/*.db 也被忽略，确保数据不泄露

📜 License
MIT © chenlumina

感谢 DeepSeek & MiMo 提供模型服务
