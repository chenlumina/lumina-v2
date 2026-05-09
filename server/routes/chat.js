const express = require('express');
const crypto = require('crypto');
const db = require('../db/init');
const authMiddleware = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

const ALLOWED_MODELS = [
  'deepseek-chat', 'deepseek-reasoner',
  'deepseek-v4-pro', 'deepseek-v4-flash',
  'mimo-v2-omni', 'mimo-v2-pro',
  'mimo-v2.5', 'mimo-v2.5-pro'
];

function getAPIConfig(model) {
  if (model.startsWith('deepseek-')) {
    return {
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
    };
  }
  if (model.startsWith('mimo-')) {
    return {
      apiKey: process.env.MIMO_API_KEY,
      baseURL: process.env.MIMO_BASE_URL || 'https://token-plan-cn.xiaomimimo.com/v1'
    };
  }
  return null;
}

function getMemory(userId) {
  const row = db.prepare('SELECT memory FROM user_memory WHERE user_id = ?').get(userId);
  return row ? row.memory : '';
}

function setMemory(userId, memory) {
  db.prepare('INSERT OR REPLACE INTO user_memory (user_id, memory) VALUES (?, ?)').run(userId, memory);
}

function saveMemoryCommandMessage(conversationId, userContent, assistantContent) {
  db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(conversationId, 'user', userContent);
  db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(conversationId, 'assistant', assistantContent);
  const isFirstMessage = db.prepare('SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?').get(conversationId).count <= 2;
  if (isFirstMessage) {
    const title = userContent.length > 20 ? userContent.substring(0, 20) + '...' : userContent;
    db.prepare('UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(title, conversationId);
  }
}

router.get('/conversations', (req, res) => {
  const conversations = db.prepare('SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC').all(req.userId);
  res.json({ conversations });
});

router.post('/conversations', (req, res) => {
  const id = crypto.randomUUID();
  const { title } = req.body;
  db.prepare('INSERT INTO conversations (id, user_id, title) VALUES (?, ?, ?)').run(id, req.userId, title || '新对话');
  const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  res.json({ conversation });
});

router.delete('/conversations/:id', (req, res) => {
  const { id } = req.params;
  const conversation = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(id, req.userId);
  if (!conversation) return res.status(404).json({ error: '对话不存在' });
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  res.json({ message: '对话已删除' });
});

router.put('/conversations/:id', (req, res) => {
  const { id } = req.params;
  const { title } = req.body;
  const conversation = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(id, req.userId);
  if (!conversation) return res.status(404).json({ error: '对话不存在' });
  db.prepare('UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(title, id);
  res.json({ message: '更新成功' });
});

router.get('/conversations/:id/messages', (req, res) => {
  const { id } = req.params;
  const conversation = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(id, req.userId);
  if (!conversation) return res.status(404).json({ error: '对话不存在' });
  const messages = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(id);
  res.json({ messages });
});

router.post('/conversations/:id/messages', async (req, res) => {
  const { id } = req.params;
  const { content, model } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: '消息内容不能为空' });

  const conversation = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(id, req.userId);
  if (!conversation) return res.status(404).json({ error: '对话不存在' });

  // ---- 记忆命令（无需 abortController，直接返回）----
  if (/^\/记忆\s/.test(content)) {
    const memory = content.replace(/^\/记忆\s*/, '').trim();
    setMemory(req.userId, memory);
    const reply = '✅ 长期记忆已更新！';
    saveMemoryCommandMessage(id, content, reply);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`data: ${JSON.stringify({ content: reply })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  if (content === '/查看记忆') {
    const mem = getMemory(req.userId);
    const reply = mem ? '📝 当前记忆：' + mem : '暂无记忆';
    saveMemoryCommandMessage(id, content, reply);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`data: ${JSON.stringify({ content: reply })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  if (content === '/清除记忆') {
    setMemory(req.userId, '');
    const reply = '✅ 长期记忆已清除！';
    saveMemoryCommandMessage(id, content, reply);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`data: ${JSON.stringify({ content: reply })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  // ---- 正常流式对话 ----
  const selectedModel = ALLOWED_MODELS.includes(model) ? model : 'deepseek-chat';
  const config = getAPIConfig(selectedModel);
  if (!config || !config.apiKey) {
    return res.status(500).json({ error: `模型 ${selectedModel} 的 API Key 未配置` });
  }

  db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(id, 'user', content);
  const isFirstMessage = db.prepare('SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?').get(id).count === 1;
  if (isFirstMessage) {
    const title = content.length > 20 ? content.substring(0, 20) + '...' : content;
    db.prepare('UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(title, id);
  }

  const history = db.prepare('SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(id);
  const memoryText = getMemory(req.userId);
  if (memoryText) {
    history.unshift({ role: 'system', content: memoryText });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const abortController = new AbortController();
  req.on('close', () => abortController.abort());

  try {
    const fetchResp = await fetch(`${config.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: history.map(m => ({ role: m.role, content: m.content })),
        temperature: 0.7,
        max_tokens: 2000,
        stream: true
      }),
      signal: abortController.signal
    });

    if (!fetchResp.ok) {
      let errMsg = 'AI 服务调用失败';
      try {
        const errBody = await fetchResp.json();
        errMsg = errBody.error?.message || errBody.message || errMsg;
      } catch {}
      res.write(`data: ${JSON.stringify({ content: '❌ ' + errMsg })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    let fullReply = '';
    const reader = fetchResp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]') {
            db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(id, 'assistant', fullReply);
            db.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
            res.write('data: [DONE]\n\n');
            res.end();
            return;
          }
          try {
            const json = JSON.parse(dataStr);
            const delta = json.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullReply += delta;
              res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
              if (res.flush) res.flush();
            }
          } catch (e) {}
        }
      }
    }

    if (fullReply && !res.writableEnded) {
      db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(id, 'assistant', fullReply);
      db.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error('API Error:', error.message);
      res.write(`data: ${JSON.stringify({ content: '❌ 网络或服务异常，请稍后重试' })}\n\n`);
      res.write('data: [DONE]\n\n');
    }
    res.end();
  }
});

// 记忆管理 API
router.get('/memory', (req, res) => {
  const memory = getMemory(req.userId);
  res.json({ memory });
});

router.put('/memory', (req, res) => {
  const { memory } = req.body;
  if (typeof memory !== 'string') return res.status(400).json({ error: '记忆内容不能为空' });
  setMemory(req.userId, memory);
  res.json({ message: '记忆已更新' });
});

router.delete('/memory', (req, res) => {
  setMemory(req.userId, '');
  res.json({ message: '记忆已清除' });
});

// 导出对话为 Markdown（安全处理文件名）
router.get('/conversations/:id/export', (req, res) => {
  const { id } = req.params;
  const conversation = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(id, req.userId);
  if (!conversation) return res.status(404).json({ error: '对话不存在' });
  const messages = db.prepare('SELECT role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(id);
  let md = `# ${conversation.title}\n\n`;
  md += `> 导出时间：${new Date().toLocaleString('zh-CN')}\n\n---\n\n`;
  messages.forEach(m => {
    const role = m.role === 'user' ? '我' : 'AI';
    md += `### ${role}\n\n${m.content}\n\n*${new Date(m.created_at).toLocaleString('zh-CN')}*\n\n---\n\n`;
  });
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  const safeName = conversation.title.replace(/[\\/:*?"<>|\n\r]/g, '_').substring(0, 100) || '对话';
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeName)}.md"`);
  res.send(md);
});

// 设置接口（仅保留 GET，移除危险的 PUT）
router.get('/settings', (req, res) => {
  res.json({
    apiKeyConfigured: !!(process.env.DEEPSEEK_API_KEY || process.env.MIMO_API_KEY),
    availableModels: ALLOWED_MODELS,
  });
});

module.exports = router;
