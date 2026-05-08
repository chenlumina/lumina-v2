(function () {
  const API_BASE = '/api';
  let token = localStorage.getItem('token');
  let currentUser = null;
  let currentConversationId = null;
  let currentModel = localStorage.getItem('selectedModel') || 'deepseek-chat';
  let currentTheme = localStorage.getItem('theme') || 'dark';
  let abortController = null; // 用于停止生成

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // 主题初始化
  document.documentElement.setAttribute('data-theme', currentTheme);
  updateThemeButton();

  // API 请求
  async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(API_BASE + path, { ...options, headers });
    if (res.headers.get('content-type')?.includes('text/markdown')) return res.blob();
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '请求失败');
    return data;
  }

  // 页面切换
  function showPage(pageId) {
    $$('.page').forEach(p => p.classList.remove('active'));
    $(`#${pageId}`).classList.add('active');
  }

  function showError(elementId, message) {
    const el = $(`#${elementId}`);
    el.textContent = message;
    setTimeout(() => { el.textContent = ''; }, 4000);
  }

  // 主题切换
  function updateThemeButton() {
    const btn = $('#theme-toggle-btn');
    if (btn) btn.textContent = currentTheme === 'dark' ? '🌙 暗色' : '☀️ 亮色';
  }

  $('#theme-toggle-btn').addEventListener('click', () => {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);
    updateThemeButton();
  });

  // 认证
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      $$('.auth-form').forEach(f => f.classList.remove('active'));
      $(`#${tab.dataset.tab}-form`).classList.add('active');
    });
  });

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: $('#login-username').value.trim(), password: $('#login-password').value })
      });
      token = data.token; currentUser = data.user;
      localStorage.setItem('token', token);
      enterChat();
    } catch (err) { showError('login-error', err.message); }
  });

  $('#register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const data = await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username: $('#reg-username').value.trim(), password: $('#reg-password').value })
      });
      token = data.token; currentUser = data.user;
      localStorage.setItem('token', token);
      enterChat();
    } catch (err) { showError('reg-error', err.message); }
  });

  $('#logout-btn').addEventListener('click', () => {
    token = null; currentUser = null; currentConversationId = null;
    localStorage.removeItem('token');
    showPage('auth-page');
  });

  async function enterChat() {
    if (!currentUser) {
      try {
        const data = await api('/auth/me');
        currentUser = data.user;
      } catch {
        token = null; localStorage.removeItem('token');
        showPage('auth-page'); return;
      }
    }
    showPage('chat-page');
    loadConversations();
    if (window.visualViewport) visualViewport.addEventListener('resize', onViewportResize);
    function onViewportResize() {
      $('#chat-page').style.height = visualViewport.height + 'px';
      requestAnimationFrame(() => scrollToBottom());
    }
  }

  // 侧边栏
  function openSidebar() { $('#sidebar').classList.add('open'); const o = $('#sidebar-overlay'); if (o) o.classList.add('open'); }
  function closeSidebar() { $('#sidebar').classList.remove('open'); const o = $('#sidebar-overlay'); if (o) o.classList.remove('open'); }
  if (!$('#sidebar-overlay')) {
    const overlay = document.createElement('div'); overlay.id = 'sidebar-overlay';
    overlay.addEventListener('click', closeSidebar);
    document.getElementById('chat-page').appendChild(overlay);
  }
  function bindSidebarToggle() {
    const btn = $('#sidebar-toggle');
    if (btn) btn.addEventListener('click', openSidebar);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindSidebarToggle);
  else bindSidebarToggle();

  // 对话列表
  async function loadConversations() {
    try {
      const data = await api('/chat/conversations');
      renderConversations(data.conversations);
    } catch (err) { console.error(err); }
  }

  function renderConversations(conversations) {
    const list = $('#conversation-list');
    list.innerHTML = conversations.map(c => `
      <li data-id="${c.id}" class="${c.id === currentConversationId ? 'active' : ''}">
        <span class="conv-title">${escapeHtml(c.title)}</span>
        <button class="conv-delete" data-id="${c.id}" title="删除">×</button>
      </li>
    `).join('');
    list.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', (e) => { if (e.target.classList.contains('conv-delete')) return; selectConversation(li.dataset.id); closeSidebar(); });
    });
    list.querySelectorAll('.conv-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('确定删除吗？')) {
          try { await api(`/chat/conversations/${btn.dataset.id}`, { method: 'DELETE' }); if (currentConversationId === btn.dataset.id) { currentConversationId = null; resetChatView(); } loadConversations(); }
          catch (err) { alert(err.message); }
        }
      });
    });
  }

  $('#new-chat-btn').addEventListener('click', async () => {
    try {
      const data = await api('/chat/conversations', { method: 'POST', body: JSON.stringify({ title: '新对话' }) });
      currentConversationId = data.conversation.id;
      await loadConversations(); await selectConversation(currentConversationId); closeSidebar();
    } catch (err) { alert(err.message); }
  });

  async function selectConversation(id) {
    currentConversationId = id;
    $$('#conversation-list li').forEach(li => li.classList.toggle('active', li.dataset.id === id));
    $('#chat-title').textContent = $(`#conversation-list li[data-id="${id}"] .conv-title`)?.textContent || '对话';
    $('#welcome-screen').style.display = 'none';
    $('#messages').classList.add('has-messages');
    $('#input-area').classList.remove('hidden');
    try { const data = await api(`/chat/conversations/${id}/messages`); renderMessages(data.messages); }
    catch (err) { console.error(err); }
  }

  function resetChatView() {
    $('#welcome-screen').style.display = 'flex';
    $('#messages').classList.remove('has-messages'); $('#messages').innerHTML = '';
    $('#input-area').classList.add('hidden');
    $('#chat-title').textContent = '选择或创建一个对话';
  }

  function renderMessages(messages) {
    const container = $('#messages');
    container.innerHTML = messages.map(m => createMessageHtml(m.role, m.content, m.created_at)).join('');
    scrollToBottom();
    addCodeCopyButtons(container);
  }

  function formatTimestamp(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString.replace(' ', 'T') + 'Z'); // SQLite 存的是 UTC
    return date.toLocaleString('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
  }

  function createMessageHtml(role, content, timestamp) {
    const avatar = role === 'user' ? (currentUser?.username?.[0]?.toUpperCase() || 'U') : 'AI';
    const timeStr = formatTimestamp(timestamp);
    const ttsBtn = '';
    return `
      <div class="message ${role}">
        <div class="message-avatar">${avatar}</div>
        <div class="message-body" style="display:flex;flex-direction:column;">
          <div class="message-content">${formatContent(content)}</div>
          ${ttsBtn}
          <div class="message-timestamp">${timeStr}</div>
        </div>
      </div>
    `;
  }

  function formatContent(text) {
    let html = escapeHtml(text);
    // 把代码块包裹在 div 中方便加复制按钮
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const langAttr = lang ? ` data-lang="${lang}"` : '';
      return `<div class="code-block-wrapper"><pre${langAttr}><code>${escapeHtml(code.trim())}</code></pre><button class="code-blk-copy-btn">复制</button></div>`;
    });
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function addCodeCopyButtons(container) {
    container.querySelectorAll('.code-blk-copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.parentElement.querySelector('code').textContent;
        navigator.clipboard.writeText(code).then(() => {
          btn.textContent = '已复制';
          setTimeout(() => btn.textContent = '复制', 2000);
        });
      });
    });
  }

  function scrollToBottom() {
    const container = $('#messages-container');
    container.scrollTop = container.scrollHeight;
  }

  // 停止生成
  function stopGeneration() {
    if (abortController) { abortController.abort(); abortController = null; }
    $('#stop-btn').classList.remove('visible');
    $('#send-btn').disabled = false;
  }

  $('#stop-btn').addEventListener('click', stopGeneration);

  // 发送消息
  $('#message-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  $('#send-btn').addEventListener('click', sendMessage);
  $('#message-input').addEventListener('input', function () {
    this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 150) + 'px';
  });

  async function sendMessage() {
    const input = $('#message-input');
    const content = input.value.trim();
    if (!content || !currentConversationId) return;
    const sendBtn = $('#send-btn'); sendBtn.disabled = true;
    input.value = ''; input.style.height = 'auto';

    const messagesEl = $('#messages');
    messagesEl.classList.add('has-messages');
    // 用户消息
    const userTimestamp = new Date().toISOString();
    messagesEl.innerHTML += createMessageHtml('user', content, userTimestamp);
    scrollToBottom();

    // AI 消息容器
    const aiMsgDiv = document.createElement('div');
    aiMsgDiv.className = 'message assistant';
    aiMsgDiv.innerHTML = `
      <div class="message-avatar">AI</div>
      <div class="message-body" style="display:flex;flex-direction:column;">
        <div class="message-content"></div>
        
        <div class="message-timestamp"></div>
      </div>
    `;
    messagesEl.appendChild(aiMsgDiv);
    const contentDiv = aiMsgDiv.querySelector('.message-content');
    contentDiv.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
    scrollToBottom();

    // 显示停止按钮
    $('#stop-btn').classList.add('visible');

    // 创建 AbortController
    abortController = new AbortController();
    const signal = abortController.signal;

    try {
      const response = await fetch(API_BASE + `/chat/conversations/${currentConversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ content, model: currentModel }),
        signal
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let reasoningText = ''; // 思考过程文本
      let buffer = '';
      contentDiv.innerHTML = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ') && !line.includes('[DONE]')) {
            try {
              const parsed = JSON.parse(line.slice(6));
              // 思考过程（DeepSeek-R1）
              if (parsed.reasoning_content) {
                reasoningText += parsed.reasoning_content;
                // 如果尚未创建思考链 UI 则创建
                let thinkDiv = aiMsgDiv.querySelector('.thinking-content');
                if (!thinkDiv) {
                  const toggleBtn = document.createElement('button');
                  toggleBtn.className = 'thinking-toggle';
                  toggleBtn.textContent = '🧠 思考过程';
                  const thinkContent = document.createElement('div');
                  thinkContent.className = 'thinking-content open';
                  thinkContent.textContent = reasoningText;
                  // 插入到 message-body 的最前面
                  const body = aiMsgDiv.querySelector('.message-body');
                  body.insertBefore(thinkContent, body.firstChild);
                  body.insertBefore(toggleBtn, thinkContent);
                  toggleBtn.addEventListener('click', () => {
                    thinkContent.classList.toggle('open');
                    toggleBtn.textContent = thinkContent.classList.contains('open') ? '🧠 思考过程' : '🧠 思考过程（已折叠）';
                  });
                  thinkDiv = thinkContent;
                } else {
                  thinkDiv.textContent = reasoningText;
                }
              }
              // 正常回复
              if (parsed.content) {
                fullText += parsed.content;
                contentDiv.innerHTML = formatContent(fullText);
                addCodeCopyButtons(aiMsgDiv);
                scrollToBottom();
              }
            } catch (e) {}
          }
        }
      }
      // 设置时间戳
      const timestamp = new Date().toISOString();
      const timeDiv = aiMsgDiv.querySelector('.message-timestamp');
      if (timeDiv) timeDiv.textContent = formatTimestamp(timestamp);
      // 显示 TTS 按钮
      const ttsBtn = aiMsgDiv.querySelector('.tts-btn');
      if (ttsBtn) { ttsBtn.dataset.text = fullText; ttsBtn.style.visibility = 'visible'; }
      loadConversations();
    } catch (err) {
      if (err.name === 'AbortError') {
        contentDiv.innerHTML += '<br><span style="color: var(--text-secondary);">[已停止生成]</span>';
      } else {
        contentDiv.innerHTML = `<span style="color: var(--error);">错误: ${escapeHtml(err.message)}</span>`;
      }
    } finally {
      sendBtn.disabled = false;
      $('#stop-btn').classList.remove('visible');
      abortController = null;
      if (window.innerWidth > 768) input.focus();
    }
  }

  // TTS（浏览器语音）
  let audioContext = null;
  function getAudioContext() { if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext()); return audioContext; }
  document.getElementById('messages').addEventListener('click', async (e) => {
    const btn = e.target.closest('.tts-btn'); if (!btn) return;
    const text = btn.dataset.text; if (!text || btn.dataset.playing === 'true') return;
    btn.dataset.playing = 'true'; btn.textContent = '⏳';
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.onend = () => { btn.dataset.playing = 'false'; btn.textContent = '🔊'; };
      window.speechSynthesis.speak(utterance);
    } catch (err) { btn.dataset.playing = 'false'; btn.textContent = '🔊'; }
  });

  // 模型切换
  $('#model-switch-btn').addEventListener('click', async () => {
    try {
      const data = await api('/chat/settings');
      const select = $('#model-select');
      select.innerHTML = data.availableModels.map(m => `<option value="${m}" ${m === currentModel ? 'selected' : ''}>${m}</option>`).join('');
    } catch (e) {
      const select = $('#model-select');
      select.innerHTML = ['deepseek-chat','deepseek-reasoner','mimo-v2.5'].map(m => `<option value="${m}" ${m === currentModel ? 'selected' : ''}>${m}</option>`).join('');
    }
    $('#settings-modal').classList.remove('hidden');
  });
  $('.close-btn').addEventListener('click', () => $('#settings-modal').classList.add('hidden'));
  $('#settings-modal').addEventListener('click', (e) => { if (e.target === $('#settings-modal')) $('#settings-modal').classList.add('hidden'); });
  $('#save-settings-btn').addEventListener('click', () => {
    const select = $('#model-select');
    if (select) { currentModel = select.value; localStorage.setItem('selectedModel', currentModel);
      $('#settings-status').textContent = '✅ 已切换到 ' + currentModel;
      $('#settings-status').className = 'settings-status success';
      setTimeout(() => $('#settings-modal').classList.add('hidden'), 800);
    }
  });

  // 记忆管理
  function openMemoryPanel() {
    api('/chat/memory').then(data => $('#memory-textarea').value = data.memory || '').catch(() => $('#memory-textarea').value = '');
    $('#memory-modal').classList.remove('hidden');
  }
  $('#memory-btn').addEventListener('click', openMemoryPanel);
  $('#save-memory-btn').addEventListener('click', async () => {
    const memory = $('#memory-textarea').value;
    try { await api('/chat/memory', { method: 'PUT', body: JSON.stringify({memory}) }); alert('记忆已更新！'); $('#memory-modal').classList.add('hidden'); }
    catch (err) { alert('保存失败: ' + err.message); }
  });
  $('#clear-memory-btn').addEventListener('click', async () => {
    if (confirm('确定要清空长期记忆吗？')) {
      try { await api('/chat/memory', { method: 'DELETE' }); $('#memory-textarea').value = ''; alert('记忆已清空'); $('#memory-modal').classList.add('hidden'); }
      catch (err) { alert('清空失败: ' + err.message); }
    }
  });
  $('#close-memory-btn').addEventListener('click', () => $('#memory-modal').classList.add('hidden'));
  $('#sidebar-toggle').addEventListener('click', openSidebar);

  // 导出对话
  async function exportConversation() {
    if (!currentConversationId) return alert('请先选择一个对话');
    try {
      const blob = await api(`/chat/conversations/${currentConversationId}/export`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${$('#chat-title').textContent || '对话'}.md`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { alert('导出失败: ' + err.message); }
  }
  // 导出按钮动态添加（简单起见放在标题旁，也可以后续加到 UI）
  // 本次优化未改动导出位置，保持原有逻辑（可选）
  
  if (token) enterChat();
  else showPage('auth-page');
})();
