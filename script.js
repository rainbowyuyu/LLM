// 存储聊天会话数据
let chatSessions = [];
let currentSessionId = null;
// 存储当前上传的媒体文件
let uploadedMedia = [];

// 初始化代码高亮
document.addEventListener('DOMContentLoaded', () => {
// 配置marked解析器
marked.setOptions({
    highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
            return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
    },
    breaks: true, // 支持换行
    gfm: true     // 支持GitHub Flavored Markdown
});

// 加载本地存储的会话
loadChatSessions();
// 加载设置
loadSettings();
// 初始化事件监听
initEventListeners();
});

// 初始化事件监听
function initEventListeners() {
// DOM元素
const chatContainer = document.getElementById('chat-container');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const apiKeyInput = document.getElementById('api-key');
const modelNameInput = document.getElementById('model-name');
const saveSettingsButton = document.getElementById('save-settings');
const settingsToggle = document.getElementById('settings-toggle');
const settingsPanel = document.getElementById('settings-panel');
const imageUpload = document.getElementById('image-upload');
const videoUpload = document.getElementById('video-upload');
const mediaUploadButton = document.getElementById('media-upload-button');
const mediaUploadOptions = document.getElementById('media-upload-options');
const mediaPreviewsContainer = document.getElementById('media-previews-container');
const fullscreenOverlay = document.getElementById('fullscreen-overlay');
const fullscreenContent = document.getElementById('fullscreen-content');
const closeFullscreen = document.getElementById('close-fullscreen');
const newChatBtn = document.getElementById('new-chat-btn');
const historyList = document.getElementById('history-list');
const menuToggle = document.getElementById('menu-toggle');
const historySidebar = document.getElementById('history-sidebar');

// 切换设置面板显示/隐藏
settingsToggle.addEventListener('click', () => {
    settingsPanel.classList.toggle('active');
});

// 移动端菜单切换
menuToggle.addEventListener('click', () => {
    historySidebar.classList.toggle('active');
});

// 点击外部关闭设置面板
document.addEventListener('click', (e) => {
    if (!settingsPanel.contains(e.target) &&
        e.target !== settingsToggle &&
        !settingsToggle.contains(e.target)) {
        settingsPanel.classList.remove('active');
    }
});

// 媒体上传按钮交互逻辑
mediaUploadButton.addEventListener('click', (e) => {
    e.stopPropagation();
    mediaUploadOptions.classList.toggle('show');
    mediaUploadButton.classList.toggle('active');
});

// 点击外部关闭下拉菜单
document.addEventListener('click', () => {
    mediaUploadOptions.classList.remove('show');
    mediaUploadButton.classList.remove('active');
});

// 阻止下拉菜单内部点击事件冒泡
mediaUploadOptions.addEventListener('click', (e) => {
    e.stopPropagation();
});

// 图片上传选择
imageUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        handleMediaUpload(file, 'image');
    }
    imageUpload.value = ''; // 重置选择
    mediaUploadOptions.classList.remove('show');
    mediaUploadButton.classList.remove('active');
});

// 视频上传选择
videoUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        handleMediaUpload(file, 'video');
    }
    videoUpload.value = ''; // 重置选择
    mediaUploadOptions.classList.remove('show');
    mediaUploadButton.classList.remove('active');
});

// 处理图片上传
imageUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        handleMediaUpload(file, 'image');
    }
    // 重置input值，允许重复上传同一文件
    imageUpload.value = '';
});

// 处理视频上传
videoUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        handleMediaUpload(file, 'video');
    }
    // 重置input值，允许重复上传同一文件
    videoUpload.value = '';
});

// 发送按钮点击事件
sendButton.addEventListener('click', sendMessage);

// 按Enter发送消息，Shift+Enter换行
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// 保存设置
saveSettingsButton.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    const modelName = modelNameInput.value.trim() || 'deepseek-r1';

    if (apiKey) {
        localStorage.setItem('aliApiKey', apiKey);
        localStorage.setItem('aliModelName', modelName);
        showMessage('设置已保存，可以开始咨询海上安全问题了！', 'bot');
        settingsPanel.classList.remove('active'); // 保存后关闭面板
    } else {
        showMessage('请输入有效的API Key', 'bot');
    }
});

// 关闭全屏预览
closeFullscreen.addEventListener('click', closeFullscreenPreview);

// 点击全屏背景关闭预览
fullscreenOverlay.addEventListener('click', (e) => {
    if (e.target === fullscreenOverlay) {
        closeFullscreenPreview();
    }
});

// 按ESC键关闭全屏预览
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && fullscreenOverlay.classList.contains('active')) {
        closeFullscreenPreview();
    }
});

// 新建聊天按钮
newChatBtn.addEventListener('click', createNewSession);
}

// 加载聊天会话
function loadChatSessions() {
const savedSessions = localStorage.getItem('chatSessions');
if (savedSessions) {
    chatSessions = JSON.parse(savedSessions);
    renderHistoryList();

    // 如果有会话，加载最后一个会话
    if (chatSessions.length > 0) {
        switchSession(chatSessions[0].id);
    } else {
        // 否则创建新会话
        createNewSession();
    }
} else {
    // 没有会话，创建新会话
    createNewSession();
}
}

// 保存聊天会话到本地存储
function saveChatSessions() {
localStorage.setItem('chatSessions', JSON.stringify(chatSessions));
renderHistoryList();
}

// 创建新会话
function createNewSession() {
const newSession = {
    id: Date.now().toString(),
    title: '新会话',
    createdAt: new Date().toISOString(),
    messages: [
        {
            sender: 'bot',
            content: '你好！我是海上安全预警大模型。欢迎开始咨询海上安全相关问题。你可以上传图片或视频获取分析。',
            media: [],
            timestamp: new Date().toISOString()
        }
    ]
};

chatSessions.unshift(newSession);
// 限制会话数量为20个
if (chatSessions.length > 20) {
    chatSessions.pop();
}

switchSession(newSession.id);
saveChatSessions();

// 移动端自动隐藏侧边栏
if (window.innerWidth <= 768) {
    document.getElementById('history-sidebar').classList.remove('active');
}
}

// 切换会话
function switchSession(sessionId) {
currentSessionId = sessionId;
const session = chatSessions.find(s => s.id === sessionId);

if (session) {
    // 清空聊天容器
    const chatContainer = document.getElementById('chat-container');
    chatContainer.innerHTML = '';

    // 渲染会话消息
    session.messages.forEach(msg => {
        showMessage(msg.content, msg.sender, msg.media, false);
    });

    // 滚动到底部
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // 更新历史列表选中状态
    renderHistoryList();
}

// 清空当前上传的媒体
clearMediaPreviews();
}

// 删除会话
function deleteSession(sessionId) {
if (currentSessionId === sessionId) {
    // 如果删除当前会话，切换到第一个会话或创建新会话
    const index = chatSessions.findIndex(s => s.id === sessionId);
    chatSessions.splice(index, 1);

    if (chatSessions.length > 0) {
        switchSession(chatSessions[0].id);
    } else {
        createNewSession();
    }
} else {
    // 否则直接删除
    chatSessions = chatSessions.filter(s => s.id !== sessionId);
}

saveChatSessions();
}

// 渲染历史会话列表
function renderHistoryList() {
const historyList = document.getElementById('history-list');
historyList.innerHTML = '';

chatSessions.forEach(session => {
    const historyItem = document.createElement('div');
    historyItem.className = `history-item ${session.id === currentSessionId ? 'active' : ''}`;
    historyItem.dataset.sessionId = session.id;

    // 格式化时间
    const date = new Date(session.createdAt);
    const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

    historyItem.innerHTML = `
        <div class="history-title">${session.title}</div>
        <div class="history-time">${timeStr}</div>
        <button class="delete-history" data-session-id="${session.id}">&times;</button>
    `;

    // 点击切换会话
    historyItem.addEventListener('click', (e) => {
        if (!e.target.classList.contains('delete-history')) {
            switchSession(session.id);
        }
    });

    // 删除会话
    const deleteBtn = historyItem.querySelector('.delete-history');
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSession(session.id);
    });

    historyList.appendChild(historyItem);
});
}

// 从本地存储加载设置
function loadSettings() {
const apiKey = localStorage.getItem('aliApiKey');
const modelName = localStorage.getItem('aliModelName');

if (apiKey) {
    document.getElementById('api-key').value = apiKey;
}

if (modelName) {
    document.getElementById('model-name').value = modelName;
}
}

// 发送消息
// 修改sendMessage函数，添加实际API请求功能
function sendMessage() {
const userInput = document.getElementById('user-input');
const messageText = userInput.value.trim();

// 检查是否有消息内容或上传的媒体
if (!messageText && uploadedMedia.length === 0) {
    return;
}

// 获取当前会话
const currentSession = chatSessions.find(s => s.id === currentSessionId);
if (!currentSession) return;

// 添加用户消息到会话
const userMessage = {
    sender: 'user',
    content: messageText,
    media: uploadedMedia.map(media => ({
        id: media.id,
        type: media.type,
        url: media.url,
        name: media.file.name
    })),
    timestamp: new Date().toISOString()
};
currentSession.messages.push(userMessage);

// 显示用户消息
showMessage(messageText, 'user', userMessage.media);

// 更新会话标题
if (currentSession.title === '新会话' && messageText) {
    currentSession.title = messageText.length > 20 ? messageText.substring(0, 20) + '...' : messageText;
}

// 清空输入和媒体
userInput.value = '';
clearMediaPreviews();
adjustInputAreaHeight();

// 显示加载状态
const loadingMessage = showMessage('', 'bot', [], true);

// 准备发送给API的数据
const apiData = {
    message: messageText,
    media: uploadedMedia.map(media => ({
        type: media.type,
        name: media.file.name,
        // 实际项目中可能需要转换为Blob或File对象
        content: media.url.split(',')[1] // 提取base64内容
    }))
};

// 发送请求到后端API（修正版）
fetch('/api/chat', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
        // ❌ 不再在前端传 Authorization
    },
    body: JSON.stringify({
        model: localStorage.getItem('aliModelName') || 'deepseek-r1',
        ...apiData
    })
})
.then(response => {
    if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return response.json();
})
.then(data => {
    // 移除加载状态
    loadingMessage.remove();

    // 显示AI回复
    showMessage(data.content, 'bot');

    // 保存到会话
    currentSession.messages.push({
        sender: 'bot',
        content: data.content,
        media: data.media || [],
        timestamp: new Date().toISOString()
    });

    // 保存会话
    saveChatSessions();
})
.catch(error => {
    loadingMessage.remove();
    showMessage(`抱歉，请求失败: ${error.message}`, 'bot');
    console.error('API请求错误:', error);
});

}

// 显示消息（支持Markdown解析和媒体显示）
function showMessage(content, sender, media = [], isLoading = false) {
const chatContainer = document.getElementById('chat-container');
const messageDiv = document.createElement('div');
messageDiv.className = `message ${sender}-message`;

// 创建头像
const avatarDiv = document.createElement('div');
avatarDiv.className = 'avatar';
const avatarImg = document.createElement('img');

if (sender === 'user') {
    avatarImg.src = 'https://picsum.photos/id/1005/200/200'; // 用户头像
    avatarImg.alt = '用户头像';
} else {
    avatarImg.src = './asset/LOGO.png'; // 系统头像
    avatarImg.alt = '系统头像';
}

avatarDiv.appendChild(avatarImg);

// 创建消息内容容器
const contentDiv = document.createElement('div');
contentDiv.className = 'message-content';

// 添加媒体内容
media.forEach(item => {
    const mediaContainer = document.createElement('div');
    mediaContainer.className = 'message-media';

    if (item.type === 'image') {
        const img = document.createElement('img');
        img.src = item.url;
        img.className = 'message-image';
        img.alt = '图片';
        img.addEventListener('click', () => {
            openFullscreenPreview(item.url, 'image');
        });
        mediaContainer.appendChild(img);
    } else if (item.type === 'video') {
        const video = document.createElement('video');
        video.src = item.url;
        video.className = 'message-video';
        video.controls = true;
        video.addEventListener('click', (e) => {
            if (e.target === video) {
                openFullscreenPreview(item.url, 'video');
            }
        });
        mediaContainer.appendChild(video);
    }

    contentDiv.appendChild(mediaContainer);
});

// 添加文本内容或加载状态
if (isLoading) {
    contentDiv.innerHTML += '<div class="loading"></div>';
} else if (content && content.trim()) {
    if (sender === 'bot') {
        contentDiv.innerHTML += marked.parse(content);
        // 对解析后的代码块应用高亮
        contentDiv.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });
    } else {
        const textDiv = document.createElement('p');
        textDiv.textContent = content;
        contentDiv.appendChild(textDiv);
    }
}

messageDiv.appendChild(avatarDiv);
messageDiv.appendChild(contentDiv);
chatContainer.appendChild(messageDiv);

// 滚动到底部
chatContainer.scrollTop = chatContainer.scrollHeight;

return messageDiv;
}

// 处理媒体上传
function handleMediaUpload(file, type) {
// 检查文件大小 (20MB以内)
if (file.size > 20 * 1024 * 1024) {
    showMessage('文件大小不能超过20MB', 'bot');
    return;
}

// 创建文件读取器
const reader = new FileReader();
reader.onload = function(e) {
    // 存储媒体信息
    const mediaId = Date.now().toString();
    uploadedMedia.push({
        id: mediaId,
        file: file,
        type: type,
        url: e.target.result
    });

    // 创建预览
    createMediaPreview(mediaId, type, e.target.result);

    // 调整输入框高度
    adjustInputAreaHeight();
};

if (type === 'image') {
    reader.readAsDataURL(file);
} else {
    reader.readAsDataURL(file);
}
}

// 创建媒体预览
function createMediaPreview(mediaId, type, url) {
const mediaPreviewsContainer = document.getElementById('media-previews-container');
const previewDiv = document.createElement('div');
previewDiv.className = 'media-preview';
previewDiv.dataset.mediaId = mediaId;

if (type === 'image') {
    const img = document.createElement('img');
    img.src = url;
    img.className = 'message-image';
    img.alt = '预览图';
    previewDiv.appendChild(img);
} else if (type === 'video') {
    const video = document.createElement('video');
    video.src = url;
    video.className = 'message-video';
    video.controls = true;
    video.preload = 'metadata';
    previewDiv.appendChild(video);
}

// 添加删除按钮
const removeButton = document.createElement('button');
removeButton.className = 'remove-media';
removeButton.innerHTML = '&times;';
removeButton.addEventListener('click', (e) => {
    e.stopPropagation();
    // 从数组中移除
    uploadedMedia = uploadedMedia.filter(media => media.id !== mediaId);
    // 从DOM中移除
    previewDiv.remove();
    // 调整输入框高度
    adjustInputAreaHeight();
});

previewDiv.appendChild(removeButton);

// 添加点击全屏预览事件
previewDiv.addEventListener('click', (e) => {
    if (e.target !== removeButton) {
        openFullscreenPreview(url, type);
    }
});

mediaPreviewsContainer.appendChild(previewDiv);
}

// 清空媒体预览
function clearMediaPreviews() {
const mediaPreviewsContainer = document.getElementById('media-previews-container');
mediaPreviewsContainer.innerHTML = '';
uploadedMedia = [];
}

// 打开全屏预览
function openFullscreenPreview(url, type) {
const fullscreenContent = document.getElementById('fullscreen-content');
fullscreenContent.innerHTML = '';

// 添加关闭按钮
const closeBtn = document.createElement('button');
closeBtn.className = 'close-fullscreen';
closeBtn.innerHTML = '&times;';
closeBtn.addEventListener('click', closeFullscreenPreview);
fullscreenContent.appendChild(closeBtn);

if (type === 'image') {
    const img = document.createElement('img');
    img.src = url;
    fullscreenContent.appendChild(img);
} else if (type === 'video') {
    const video = document.createElement('video');
    video.src = url;
    video.controls = true;
    video.style.maxHeight = '80vh';
    fullscreenContent.appendChild(video);
}

document.getElementById('fullscreen-overlay').classList.add('active');
document.body.style.overflow = 'hidden';
}

// 关闭全屏预览
function closeFullscreenPreview() {
document.getElementById('fullscreen-overlay').classList.remove('active');
document.body.style.overflow = '';
}

// 调整输入框高度
function adjustInputAreaHeight() {
const userInput = document.getElementById('user-input');
userInput.style.height = 'auto';
userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
}