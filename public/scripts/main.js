document.addEventListener('DOMContentLoaded', () => {
    // --- 状态管理 ---
    const state = {
        user: null,
        currentSessionId: null,
        inputImages: [], // 存储待发送的图片/视频帧 Base64
        isLiveMode: false,
        liveInterval: null,
        apiKey: localStorage.getItem('maritime_api_key') || 'sk-affb2f48526b4aa38cadfd3004646fcc'
    };

    // --- DOM 元素 ---
    const els = {
        loginOverlay: document.getElementById('login-overlay'),
        chatBox: document.getElementById('chat-container'),
        input: document.getElementById('msg-input'),
        fileInput: document.getElementById('file-input'),
        preview: document.getElementById('media-preview'),
        liveContainer: document.getElementById('live-container'),
        liveVideo: document.getElementById('live-video'),
        liveCanvas: document.getElementById('live-canvas'),
        liveAlerts: document.getElementById('live-alerts'),
        liveLog: document.getElementById('live-log'),
        sessionList: document.getElementById('session-list'),

        settingsBtn: document.getElementById('btn-settings'),
        settingsModal: document.getElementById('settings-modal'),
        modalApiKeyInput: document.getElementById('modal-api-key'),
        saveSettingsBtn: document.getElementById('btn-save-settings'),
        closeModalBtn: document.querySelector('.close-modal')
    };

    // --- 初始化 ---
    checkAuth();

    if (els.settingsBtn) {
        els.settingsBtn.onclick = () => {
            els.modalApiKeyInput.value = state.apiKey;
            els.settingsModal.classList.add('active');
        };
    }

    // 关闭设置
    function closeSettings() {
        els.settingsModal.classList.remove('active');
    }
    els.closeModalBtn.onclick = closeSettings;
    // 点击遮罩关闭
    if (els.settingsModal) {
        els.settingsModal.onclick = (e) => {
            if (e.target === els.settingsModal) closeSettings();
        };
    }

    // 保存设置
    if (els.saveSettingsBtn) {
        els.saveSettingsBtn.onclick = () => {
            const newKey = els.modalApiKeyInput.value.trim();
            if (newKey) {
                state.apiKey = newKey;
                localStorage.setItem('maritime_api_key', state.apiKey);
                alert("配置已保存");
                closeSettings();
            } else {
                alert("API Key 不能为空");
            }
        };
    }

    // --- 1. 认证逻辑 ---
    async function checkAuth() {
        const res = await fetch('/api/auth/check');
        const data = await res.json();
        if (data.isAuth) {
            state.user = data.user;
            document.getElementById('user-display').textContent = data.user.name;
            els.loginOverlay.style.display = 'none';
            loadSessions();
        }
    }

    document.getElementById('login-btn').onclick = async () => {
        const u = document.getElementById('login-user').value;
        const p = document.getElementById('login-pass').value;
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ username: u, password: p })
        });
        const data = await res.json();
        if(data.success) {
            window.location.reload();
        } else {
            alert(data.error);
        }
    };

    document.getElementById('btn-logout').onclick = async () => {
        await fetch('/api/logout', { method: 'POST' });
        window.location.reload();
    };

    // --- 2. 会话逻辑 ---
    async function loadSessions() {
        const res = await fetch('/api/sessions');
        const sessions = await res.json();
        els.sessionList.innerHTML = '';
        sessions.forEach(s => {
            const div = document.createElement('div');
            div.className = `session-item ${s.id === state.currentSessionId ? 'active' : ''}`;
            div.innerHTML = `<i class="far fa-comments"></i> ${s.title}`;
            div.onclick = () => switchSession(s.id);
            els.sessionList.appendChild(div);
        });
    }

    // 独立出创建会话逻辑，返回 session ID
    async function createNewSession() {
        const res = await fetch('/api/session/new', { method: 'POST' });
        const data = await res.json();
        state.currentSessionId = data.id;
        // 刷新列表
        loadSessions();
        // 清空当前界面
        els.chatBox.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <i class="fas fa-radar"></i>
                    <div class="ring"></div>
                </div>
                <h3>系统就绪</h3>
                <p>任务 ID: ${data.id.slice(0,8)} 已建立</p>
            </div>`;
        document.getElementById('current-title').textContent = "新分析任务";
        return data.id;
    }

    window.switchSession = async (id) => {
        state.currentSessionId = id;
        state.isLiveMode = false;
        toggleLiveUI(false);
        loadSessions();

        const res = await fetch(`/api/session/${id}`);
        const data = await res.json();
        els.chatBox.innerHTML = '';
        document.getElementById('current-title').textContent = data.title;

        if (data.messages.length === 0) {
             els.chatBox.innerHTML = '<div class="empty-state"><p>暂无消息</p></div>';
        } else {
            data.messages.forEach(msg => {
                // 历史消息：由于后端不存Base64，这里无法还原图片，只能显示标记
                // 如果需要历史图片，后端需要接入 OSS/S3 或本地文件存储
                appendMessage(msg.role, msg.text, msg.hasImage ? null : null, msg.hasImage);
            });
        }
    };

    document.getElementById('btn-new-chat').onclick = createNewSession;

    // --- 3. 视频/图片 处理逻辑 ---
    els.fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        state.inputImages = [];
        els.preview.style.display = 'flex';
        els.preview.innerHTML = '<div style="color:#fff; padding:10px;"><i class="fas fa-spinner fa-spin"></i> 正在解析媒体...</div>';

        if (file.type.startsWith('video/')) {
            // 视频切帧
            try {
                // 提取4帧用于分析
                const frames = await extractFramesFromVideo(file, 4);
                state.inputImages = frames;
                renderPreview(frames, 'video');
                els.input.value = `[视频分析] ${file.name}`;
            } catch (e) {
                alert("视频解析失败");
                els.preview.style.display = 'none';
            }
        } else {
            // 图片
            const reader = new FileReader();
            reader.onload = (ev) => {
                state.inputImages = [ev.target.result];
                renderPreview([ev.target.result], 'image');
            };
            reader.readAsDataURL(file);
        }
    };

    function renderPreview(images, type) {
        els.preview.innerHTML = '';
        images.forEach(src => {
            const img = document.createElement('img');
            img.src = src;
            els.preview.appendChild(img);
        });
        // 如果是视频，加个标识
        if(type === 'video') {
            const badge = document.createElement('div');
            badge.innerHTML = '<i class="fas fa-video"></i> 关键帧';
            badge.style.cssText = 'position:absolute; bottom:5px; right:5px; background:rgba(0,0,0,0.6); padding:2px 5px; font-size:10px; border-radius:4px;';
            els.preview.appendChild(badge);
        }
    }

    function extractFramesFromVideo(videoFile, count) {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.src = URL.createObjectURL(videoFile);
            video.muted = true;
            video.currentTime = 0.5; // 稍微跳过开头

            const frames = [];
            video.onloadeddata = async () => {
                const duration = video.duration || 5;
                const step = duration / (count + 1);
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                for (let i = 1; i <= count; i++) {
                    video.currentTime = step * i;
                    await new Promise(r => video.onseeked = r);

                    // 压缩尺寸，太大会导致请求失败
                    const scale = Math.min(1, 640 / video.videoWidth);
                    canvas.width = video.videoWidth * scale;
                    canvas.height = video.videoHeight * scale;

                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    frames.push(canvas.toDataURL('image/jpeg', 0.6));
                }
                resolve(frames);
            };
        });
    }

    function clearMedia() {
        state.inputImages = [];
        els.preview.style.display = 'none';
        els.preview.innerHTML = '';
        els.fileInput.value = '';
    }

    // --- 4. 聊天与流式输出 ---
    document.getElementById('btn-send').onclick = () => sendMessage();
    els.input.onkeydown = (e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }};

    async function sendMessage(manualText = null, manualImages = null, isLive = false) {
        // 修复Bug: 确保 session 存在，如果是第一次，等待 createNewSession 执行完毕
        if (!state.currentSessionId && !isLive) {
            await createNewSession();
        }

        const text = manualText || els.input.value.trim();
        const images = manualImages || state.inputImages; // 获取当前的图片/视频帧

        if (!text && images.length === 0) return;
        if (!state.apiKey) { alert("请在左侧填写 API Key"); return; }

        let aiMsgDiv = null;

        // 非实时模式下，立即渲染用户消息
        if (!isLive) {
            // 将图片传递给 appendMessage 进行渲染
            appendMessage('user', text, images, false);

            // 渲染 AI 等待气泡
            aiMsgDiv = appendMessage('assistant', '<i class="fas fa-circle-notch fa-spin"></i> 正在分析态势...');

            // 清空输入框和预览
            els.input.value = '';
            clearMedia();
        }

        try {
            const res = await fetch('/api/chat-stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: state.currentSessionId,
                    message: text,
                    images: images,
                    apiKey: state.apiKey,
                    useTools: true
                })
            });

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let fullContent = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const json = JSON.parse(line.slice(6));
                            if (json.error) throw new Error(json.error);

                            if (json.content) {
                                fullContent += json.content;
                                if (!isLive && aiMsgDiv) aiMsgDiv.innerHTML = marked.parse(fullContent);
                                if (isLive) updateLiveLog(json.content);
                            }

                            if (json.tools) {
                                handleTools(json.tools, isLive);
                            }
                        } catch (e) {}
                    }
                }
            }
        } catch (e) {
            console.error(e);
            if(aiMsgDiv) aiMsgDiv.innerHTML += `<br><span style="color:#f43f5e">系统错误: ${e.message}</span>`;
        }
    }

    /**
     * 渲染消息
     * @param {string} role - 'user' | 'assistant'
     * @param {string} text - 文本内容
     * @param {Array} mediaData - Base64 图片数组 (用于当前会话显示)
     * @param {boolean} isHistoryMedia - 是否是历史记录中的图片 (只显示标记)
     */
    function appendMessage(role, text, mediaData = null, isHistoryMedia = false) {
        // 移除空状态
        document.querySelector('.empty-state')?.remove();

        const div = document.createElement('div');
        div.className = `message ${role}`;

        // 1. 处理图片显示
        let mediaHtml = '';
        if (mediaData && mediaData.length > 0) {
            // 当前发送的图片，显示网格
            const imagesHtml = mediaData.map(src => `<div class="media-item"><img src="${src}"></div>`).join('');
            mediaHtml = `<div class="msg-media-grid">${imagesHtml}</div>`;
        } else if (isHistoryMedia) {
            // 历史记录图片（后端未返回Base64），显示占位符
            mediaHtml = `<div class="msg-tag"><i class="fas fa-film"></i> 包含历史影像数据</div>`;
        }

        // 2. Markdown 解析
        const contentHtml = text ? marked.parse(text) : '';

        div.innerHTML = `
            <div class="avatar"><i class="fas ${role==='user'?'fa-user':'fa-robot'}"></i></div>
            <div class="bubble markdown-body">
                ${mediaHtml}
                ${contentHtml}
            </div>
        `;
        els.chatBox.appendChild(div);
        els.chatBox.scrollTop = els.chatBox.scrollHeight;
        return div.querySelector('.bubble');
    }

    // --- 5. 实时作战中心 ---
    document.getElementById('btn-live-mode').onclick = () => {
        state.isLiveMode = !state.isLiveMode;
        toggleLiveUI(state.isLiveMode);
    };

    async function toggleLiveUI(active) {
        if (active) {
            els.chatBox.style.display = 'none';
            els.liveContainer.style.display = 'block';
            document.getElementById('btn-live-mode').classList.add('active');
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                els.liveVideo.srcObject = stream;
                state.liveInterval = setInterval(() => {
                    const ctx = els.liveCanvas.getContext('2d');
                    els.liveCanvas.width = 640;
                    els.liveCanvas.height = 480;
                    ctx.drawImage(els.liveVideo, 0, 0, 640, 480);
                    const base64 = els.liveCanvas.toDataURL('image/jpeg', 0.5);
                    sendMessage("扫描画面中的风险。如果有严重危险，请调用广播工具。", [base64], true);
                }, 8000); // 稍微延长间隔避免请求过于频繁
            } catch(e) { alert("无法访问摄像头"); }
        } else {
            els.chatBox.style.display = 'block';
            els.liveContainer.style.display = 'none';
            document.getElementById('btn-live-mode').classList.remove('active');
            clearInterval(state.liveInterval);
            if(els.liveVideo.srcObject) els.liveVideo.srcObject.getTracks().forEach(t => t.stop());
        }
    }

    function handleTools(tools, isLive) {
        tools.forEach(tool => {
            const isCritical = tool.name === 'broadcast_warning' && tool.args.level === 'CRITICAL';
            const html = `
                <div class="alert-card ${isCritical ? 'critical' : 'info'}">
                    <i class="fas ${tool.name === 'lock_target' ? 'fa-crosshairs' : 'fa-bullhorn'}"></i>
                    <div>
                        <strong>${tool.name === 'lock_target' ? '目标锁定' : '安全广播'}</strong>
                        <div>${tool.args.message || tool.args.targetType || '已执行'}</div>
                    </div>
                </div>
            `;
            if (isLive) {
                const div = document.createElement('div');
                div.innerHTML = html;
                els.liveAlerts.appendChild(div);
                setTimeout(() => div.remove(), 8000);
            } else {
                const msg = appendMessage('assistant', '');
                msg.innerHTML = html;
            }
        });
    }

    function updateLiveLog(text) {
        const line = document.createElement('div');
        line.innerHTML = `<span style="color:#64748b">[${new Date().toLocaleTimeString()}]</span> ${text.slice(0, 40)}...`;
        els.liveLog.prepend(line);
        if (els.liveLog.children.length > 20) els.liveLog.lastChild.remove();
    }
});