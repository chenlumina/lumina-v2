(function () {
  const API_BASE = '/api';
  let token = localStorage.getItem('token');
  let currentUser = null;
  let currentConversationId = null;
  let currentModel = localStorage.getItem('selectedModel') || 'deepseek-chat';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(API_BASE + path, { ...options, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '请求失败');
    return data;
  }

  function showPage(pageId) {
    $$('.page').forEach(p => p.classList.remove('active'));
    $(`#${pageId}`).classList.add('active');
  }

  function showError(elementId, message) {
    const el = $(`#${elementId}`);
    el.textContent = message;
    setTimeout(() => { el.textContent = ''; }, 4000);
  }

  // Auth
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
        body: JSON.stringify({
          username: $('#login-username').value,
          password: $('#login-password').value
        })
      });
      token = data.token;
      currentUser = data.user;
      localStorage.setItem('token', token);
      enterChat();
    } catch (err) {
      showError('login-error', err.message);
    }
  });

  $('#register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const data = await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username: $('#reg-username').value,
          password: $('#reg-password').value
        })
      });
      token = data.token;
      currentUser = data.user;
      localStorage.setItem('token', token);
      enterChat();
    } catch (err) {
      showError('reg-error', err.message);
    }
  });

  $('#logout-btn').addEventListener('click', () => {
    token = null;
    currentUser = null;
    currentConversationId = null;
    localStorage.removeItem('token');
    showPage('auth-page');
  });

  async function enterChat() {
    if (!currentUser) {
      try {
        const data = await api('/auth/me');
        currentUser = data.user;
      } catch {
        token = null;
        localStorage.removeItem('token');
        showPage('auth-page');
        return;
      }
    }
    showPage('chat-page');
    loadConversations();

    // 移动端键盘适配
    if (window.visualViewport) {
      visualViewport.addEventListener('resize', onViewportResize);
    }
    function onViewportResize() {
      $('#chat-page').style.height = visualViewport.height + 'px';
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    }
  }

  // 侧边栏管理
  function openSidebar() {
    $('#sidebar').classList.add('open');
    const overlay = $('#sidebar-overlay');
    if (overlay) overlay.classList.add('open');
  }

  function closeSidebar() {
    $('#sidebar').classList.remove('open');
    const overlay = $('#sidebar-overlay');
    if (overlay) overlay.classList.remove('open');
  }

  // 创建遮罩层（如果不存在）
  if (!$('#sidebar-overlay')) {
    const overlay = document.createElement('div');
    overlay.id = 'sidebar-overlay';
    overlay.addEventListener('click', closeSidebar);
    document.getElementById('chat-page').appendChild(overlay);
  }

  // 绑定汉堡菜单按钮
  function bindSidebarToggle() {
    const toggleBtn = $('#sidebar-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', openSidebar);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindSidebarToggle);
  } else {
    bindSidebarToggle();
  }

  // Conversations
  async function loadConversations() {
    try {
      const data = await api('/chat/conversations');
      renderConversations(data.conversations);
    } catch (err) {
      console.error('加载对话列表失败:', err);
    }
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
      li.addEventListener('click', (e) => {
        if (e.target.classList.contains('conv-delete')) return;
        selectConversation(li.dataset.id);
        closeSidebar();
      });
    });
    list.querySelectorAll('.conv-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('确定删除这个对话吗？')) {
          try {
            await api(`/chat/conversations/${btn.dataset.id}`, { method: 'DELETE' });
            if (currentConversationId === btn.dataset.id) {
              currentConversationId = null;
              resetChatView();
            }
            loadConversations();
          } catch (err) { alert(err.message); }
        }
      });
    });
  }

  $('#new-chat-btn').addEventListener('click', async () => {
    try {
      const data = await api('/chat/conversations', { method: 'POST', body: JSON.stringify({ title: '新对话' }) });
      currentConversationId = data.conversation.id;
      await loadConversations();
      await selectConversation(currentConversationId);
      closeSidebar();
    } catch (err) { alert(err.message); }
  });

  async function selectConversation(id) {
    currentConversationId = id;
    $$('#conversation-list li').forEach(li => li.classList.toggle('active', li.dataset.id === id));
    const convItem = $(`#conversation-list li[data-id="${id}"] .conv-title`);
    $('#chat-title').textContent = convItem ? convItem.textContent : '对话';
    $('#welcome-screen').style.display = 'none';
    $('#messages').classList.add('has-messages');
    $('#input-area').classList.remove('hidden');
    try {
      const data = await api(`/chat/conversations/${id}/messages`);
      renderMessages(data.messages);
    } catch (err) { console.error('加载消息失败:', err); }
  }

  function resetChatView() {
    $('#welcome-screen').style.display = 'flex';
    $('#messages').classList.remove('has-messages');
    $('#messages').innerHTML = '';
    $('#input-area').classList.add('hidden');
    $('#chat-title').textContent = '选择或创建一个对话';
  }

  function renderMessages(messages) {
    const container = $('#messages');
    container.innerHTML = messages.map(m => createMessageHtml(m.role, m.content)).join('');
    scrollToBottom();
  }

  function createMessageHtml(role, content) {
    const avatar = role === 'user' ? (currentUser?.username?.[0]?.toUpperCase() || 'U') : 'AI';
    return `
      <div class="message ${role}">
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">${formatContent(content)}</div>
      </div>
    `;
  }

  function formatContent(text) {
    let html = escapeHtml(text);
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function scrollToBottom() {
    const container = $('#messages-container');
    container.scrollTop = container.scrollHeight;
  }

  // Send message
  $('#message-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  $('#send-btn').addEventListener('click', sendMessage);

  $('#message-input').addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 150) + 'px';
  });

  async function sendMessage() {
    const input = $('#message-input');
    const content = input.value.trim();
    if (!content || !currentConversationId) return;
    const sendBtn = $('#send-btn');
    sendBtn.disabled = true;
    input.value = '';
    input.style.height = 'auto';

    const messagesEl = $('#messages');
    messagesEl.classList.add('has-messages');
    messagesEl.innerHTML += createMessageHtml('user', content);
    scrollToBottom();

    const aiMsgDiv = document.createElement('div');
    aiMsgDiv.className = 'message assistant';
    aiMsgDiv.innerHTML = `
      <div class="message-avatar">AI</div>
      <div class="message-content"></div>
    `;
    messagesEl.appendChild(aiMsgDiv);
    const contentDiv = aiMsgDiv.querySelector('.message-content');
    contentDiv.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
    scrollToBottom();

    try {
      const response = await fetch(API_BASE + `/chat/conversations/${currentConversationId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ content, model: currentModel })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      contentDiv.innerHTML = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ') && !line.includes('[DONE]')) {
            try {
              const { content } = JSON.parse(line.slice(6));
              fullText += content;
              contentDiv.innerHTML = formatContent(fullText);
              scrollToBottom();
            } catch (e) {}
          }
        }
      }
      loadConversations();
    } catch (err) {
      contentDiv.innerHTML = `<span style="color: var(--error);">错误: ${escapeHtml(err.message)}</span>`;
    } finally {
      sendBtn.disabled = false;
      if (window.innerWidth > 768) {
        input.focus();
      }
    }
  }

  // 模型切换
  $('#model-switch-btn').addEventListener('click', async () => {
    try {
      const data = await api('/chat/settings');
      const select = $('#model-select');
      select.innerHTML = data.availableModels.map(m =>
        `<option value="${m}" ${m === currentModel ? 'selected' : ''}>${m}</option>`
      ).join('');
    } catch (e) {
      const select = $('#model-select');
      select.innerHTML = ['deepseek-chat', 'deepseek-reasoner', 'mimo-v2-flash'].map(m =>
        `<option value="${m}" ${m === currentModel ? 'selected' : ''}>${m}</option>`
      ).join('');
    }
    $('#settings-modal').classList.remove('hidden');
  });

  $('.close-btn').addEventListener('click', () => $('#settings-modal').classList.add('hidden'));
  $('#settings-modal').addEventListener('click', (e) => {
    if (e.target === $('#settings-modal')) $('#settings-modal').classList.add('hidden');
  });

  $('#save-settings-btn').addEventListener('click', () => {
    const select = $('#model-select');
    if (select) {
      currentModel = select.value;
      localStorage.setItem('selectedModel', currentModel);
      $('#settings-status').textContent = '✅ 已切换到 ' + currentModel;
      $('#settings-status').className = 'settings-status success';
      setTimeout(() => $('#settings-modal').classList.add('hidden'), 800);
    }
  });

  // ---- 记忆管理面板 ----
  function openMemoryPanel() {
    api('/chat/memory').then(data => {
      $('#memory-textarea').value = data.memory || '';
    }).catch(err => {
      $('#memory-textarea').value = '';
    });
    $('#memory-modal').classList.remove('hidden');
  }

  // 记忆按钮绑定（现在 HTML 中已经存在）
  const memBtn = $('#memory-btn');
  if (memBtn) {
    memBtn.addEventListener('click', openMemoryPanel);
  }

  $('#save-memory-btn').addEventListener('click', async () => {
    const memory = $('#memory-textarea').value;
    try {
      await api('/chat/memory', {
        method: 'PUT',
        body: JSON.stringify({ memory })
      });
      alert('记忆已更新！');
      $('#memory-modal').classList.add('hidden');
    } catch (err) {
      alert('保存失败: ' + err.message);
    }
  });

  $('#clear-memory-btn').addEventListener('click', async () => {
    if (confirm('确定要清空长期记忆吗？')) {
      try {
        await api('/chat/memory', { method: 'DELETE' });
        $('#memory-textarea').value = '';
        alert('记忆已清空');
        $('#memory-modal').classList.add('hidden');
      } catch (err) {
        alert('清空失败: ' + err.message);
      }
    }
  });

  $('#close-memory-btn').addEventListener('click', () => $('#memory-modal').classList.add('hidden'));

  // Mobile sidebar toggle
  $('#sidebar-toggle').addEventListener('click', openSidebar);

  // Init
  if (token) {
    enterChat();
  } else {
    showPage('auth-page');
  }
})();
