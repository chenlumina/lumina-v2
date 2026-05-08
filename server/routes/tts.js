const express = require('express');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

router.post('/', authMiddleware, async (req, res) => {
  const { text, voice = 'mimo_default', format = 'wav', style = '' } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text 不能为空' });
  }

  const apiKey = process.env.MIMO_API_KEY;
  const baseURL = process.env.MIMO_BASE_URL || 'https://token-plan-cn.xiaomimimo.com/v1';
  if (!apiKey) return res.status(500).json({ error: 'MiMo API Key 未配置' });

  try {
    const fetchResp = await fetch(`${baseURL}/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'mimo-v2.5-tts',
        input: text.trim(),
        voice,
        response_format: format,
        ...(style ? { style } : {})
      })
    });

    if (!fetchResp.ok) {
      const errBody = await fetchResp.json().catch(() => ({}));
      console.error('MiMo TTS API error:', fetchResp.status, errBody);
      return res.status(fetchResp.status).json({ error: '语音合成失败' });
    }

    res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'audio/wav');
    const reader = fetchResp.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();

  } catch (error) {
    console.error('TTS proxy error:', error.message);
    res.status(500).json({ error: '语音合成失败，请稍后重试' });
  }
});

module.exports = router;
