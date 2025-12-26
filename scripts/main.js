/**
 * 海上安全预警系统前端主逻辑
 * 注入海上安全专用提示词，强制分析方向为海上目标/安全预警
 * 修复：接口请求路径、非JSON响应处理、资源加载容错
 */
document.addEventListener('DOMContentLoaded', () => {
    // DOM元素
    const elements = {
        chatContainer: document.getElementById('chat-container'),
        messageInput: document.getElementById('message-input'),
        sendBtn: document.getElementById('send-btn'),
        mediaInput: document.getElementById('media-input'),
        mediaPreview: document.getElementById('media-preview'),
        newSessionBtn: document.getElementById('new-session-btn'),
        settingsBtn: document.getElementById('settings-btn'),
        settingsModal: document.getElementById('settings-modal'),
        saveSettingsBtn: document.getElementById('save-settings'),
        closeModalBtns: document.querySelectorAll('.close-btn, .close-modal'),
        loadingOverlay: document.getElementById('loading-overlay'),
        historyList: document.getElementById('history-list'),
        apiKeyInput: document.getElementById('api-key'),
        textModelInput: document.getElementById('text-model'),
        visionModelInput: document.getElementById('vision-model')
    };

    // 全局状态
    const state = {
        mediaBase64: null,    // 最终用于分析的Base64（图片/视频帧）
        mediaType: null,      // 媒体类型（image/jpeg等）
        mediaName: null,      // 原始文件名
        originalMediaUrl: null, // 原始媒体的预览URL（用于UI展示）
        isVideo: false,       // 是否为视频文件
        settings: {
            apiKey: localStorage.getItem('apiKey') || 'sk-846a6816c1144eeea8c256c6cfc3bfb2',
            textModel: localStorage.getItem('textModel') || 'qwen-turbo',
            visionModel: localStorage.getItem('visionModel') || 'qwen-vl-plus'
        },
        history: [],
        // 新增：接口基础路径（避免相对路径解析错误）
        apiBaseUrl: window.location.origin // 自动获取域名（如http://www.rainbowyu.com.cn）
    };

    // 海上安全预警系统核心提示词（关键改造）
    const systemPrompts = {
        // 系统身份定义
        identity: `如果遇到海上安全相关问题，那么你是专业的海上安全预警智能分析专家，隶属于海事局海上安全指挥中心，精通：
1. 海上目标识别（船只类型、数量、位置、状态）
2. 海上安全风险检测（碰撞风险、搁浅隐患、设备故障、海况异常）
3. 海事预警信息生成（分级预警、处置建议、救援方案）
4. 海域环境分析（海况、天气、地理特征对航行的影响）
5. 海上安全知识科普
如果用户谈海上安全相关的问题，那你的回答必须围绕海上安全展开，拒绝无关话题，分析结果需包含「目标识别」「风险评估」「预警建议」三个核心部分。`,

        // 视觉分析专用提示词（图片/视频帧）
        vision: `请基于提供的海上图像/视频帧，按照以下步骤进行分析：
1. 目标识别：列出画面中所有海上目标（船只类型/数量、浮标、航标、礁石、人员等）及位置关系
2. 风险评估：判断是否存在安全风险（碰撞、搁浅、倾覆、火灾、人员落水、非法作业等），风险等级分为「无风险」「低风险」「中风险」「高风险」
3. 预警建议：根据风险等级给出具体的海事预警措施和处置方案（如：立即避让、发布航行警告、联系救援中心等）
4. 补充说明：若存在异常目标或行为，需明确标注并提出应对建议`,

        // 文本对话专用提示词
        text: `如果用户输入的是海上安全相关问题，请针对用户提出的海上安全问题，结合海事法规和安全操作规范，提供专业的分析和预警建议，回答需包含：
1. 问题核心分析
2. 潜在安全风险
3. 分级预警结论
4. 具体处置措施
5. 相关海事法规依据（可选）
      如果不是那就正常回答`
    };

    // 初始化设置表单
    elements.apiKeyInput.value = state.settings.apiKey;
    elements.textModelInput.value = state.settings.textModel;
    elements.visionModelInput.value = state.settings.visionModel;

    // 加载历史会话
    loadHistory();

    // 事件监听
    elements.sendBtn.addEventListener('click', sendMessage);
    elements.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    elements.mediaInput.addEventListener('change', handleMediaFile);
    elements.newSessionBtn.addEventListener('click', createNewSession);
    elements.settingsBtn.addEventListener('click', () => elements.settingsModal.classList.add('active'));
    elements.closeModalBtns.forEach(btn => {
        btn.addEventListener('click', () => elements.settingsModal.classList.remove('active'));
    });
    elements.saveSettingsBtn.addEventListener('click', saveSettings);

    // 点击模态框外部关闭
    elements.settingsModal.addEventListener('click', (e) => {
        if (e.target === elements.settingsModal) {
            elements.settingsModal.classList.remove('active');
        }
    });

    /**
     * 核心修复：提取视频第一帧并转为Base64（增加预加载、延迟、重试）
     * @param {string} videoUrl - 视频DataURL
     * @param {number} retryCount - 重试次数
     * @returns {Promise<string>} 帧的Base64 DataURL
     */
    function extractVideoFrame(videoUrl, retryCount = 3) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            // 关键配置：允许跨域、强制预加载、静音（避免自动播放限制）
            video.crossOrigin = 'anonymous';
            video.src = videoUrl;
            video.preload = 'auto'; // 改为auto强制预加载
            video.muted = true;     // 静音以绕过自动播放限制
            video.playsInline = true; // 内联播放（移动端兼容）

            // 帧提取核心函数
            const captureFrame = () => {
                try {
                    // 检查视频是否有有效尺寸
                    if (video.videoWidth === 0 || video.videoHeight === 0) {
                        throw new Error('视频尺寸异常，无法提取帧');
                    }

                    // 创建canvas，使用视频实际尺寸
                    const canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    const ctx = canvas.getContext('2d');

                    // 清空canvas（避免黑帧）
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    // 绘制视频第一帧
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                    // 检查帧是否为全黑（通过像素检测）
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const pixels = imageData.data;
                    let isBlackFrame = true;

                    // 抽样检测像素（每10个像素检测一次，提升性能）
                    for (let i = 0; i < pixels.length; i += 40) {
                        if (pixels[i] + pixels[i+1] + pixels[i+2] > 10) { // RGB总和大于10则不是黑帧
                            isBlackFrame = false;
                            break;
                        }
                    }

                    if (isBlackFrame) {
                        if (retryCount > 0) {
                            // 黑帧重试：延迟500ms后再次提取
                            setTimeout(() => {
                                captureFrame();
                            }, 500);
                            retryCount--;
                            return;
                        } else {
                            throw new Error('多次尝试后仍提取到全黑帧，请检查视频文件');
                        }
                    }

                    // 转为Base64（JPG格式，质量0.9）
                    const frameBase64 = canvas.toDataURL('image/jpeg', 0.9);
                    resolve(frameBase64);
                } catch (error) {
                    reject(new Error('视频截帧失败：' + error.message));
                }
            };

            // 视频加载完成后触发帧提取（使用canplaythrough事件，确保视频可播放）
            video.addEventListener('canplaythrough', () => {
                // 手动跳转到第一帧（0秒位置）
                video.currentTime = 0.1; // 避免0秒帧未渲染，使用0.1秒
                // 延迟200ms确保帧渲染完成
                setTimeout(captureFrame, 200);
            });

            // 视频加载失败处理
            video.onerror = () => {
                reject(new Error('无法加载视频，请确保格式为MP4/WebM且编码正常'));
            };

            // 超时处理（防止无限等待）
            setTimeout(() => {
                reject(new Error('视频帧提取超时，请检查视频文件'));
            }, 10000); // 10秒超时
        });
    }

    /**
     * 处理媒体文件（增加视频加载状态提示）
     */
    function handleMediaFile() {
        const file = elements.mediaInput.files[0];
        if (!file) return;

        // 显示加载提示
        elements.mediaPreview.innerHTML = `
            <div class="preview-item">
                <div style="display:flex;align-items:center;justify-content:center;height:100%;">
                    <i class="fas fa-spinner fa-spin"></i>
                </div>
            </div>
        `;

        state.mediaName = file.name;
        state.isVideo = file.type.startsWith('video/');
        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                if (state.isVideo) {
                    // 视频文件：调用修复后的帧提取函数
                    const frameBase64 = await extractVideoFrame(e.target.result);
                    state.mediaBase64 = frameBase64.split(',')[1];
                    state.mediaType = 'image/jpeg';
                    state.originalMediaUrl = e.target.result;

                    elements.mediaPreview.innerHTML = `
                        <div class="preview-item">
                            <video src="${e.target.result}" controls style="width:100%;height:100%;object-fit:cover;"></video>
                            <div class="preview-tooltip">已分析视频</div>
                            <span class="preview-remove" onclick="removeMedia()">×</span>
                        </div>
                    `;
                } else {
                    // 图片文件：直接提取Base64
                    state.mediaBase64 = e.target.result.split(',')[1];
                    state.mediaType = file.type;
                    state.originalMediaUrl = e.target.result;

                    elements.mediaPreview.innerHTML = `
                        <div class="preview-item">
                            <img src="${e.target.result}" alt="${file.name}" style="width:100%;height:100%;object-fit:cover;">
                            <span class="preview-remove" onclick="removeMedia()">×</span>
                        </div>
                    `;
                }
            } catch (error) {
                alert('媒体处理失败：' + error.message);
                console.error(error);
                window.removeMedia();
            }
        };

        reader.readAsDataURL(file);
        elements.mediaInput.value = '';
    }

    /**
     * 移除媒体文件
     */
    window.removeMedia = function() {
        state.mediaBase64 = null;
        state.mediaType = null;
        state.mediaName = null;
        state.originalMediaUrl = null;
        state.isVideo = false;
        elements.mediaPreview.innerHTML = '';
    };

    /**
     * 修复：通用接口请求函数（增加非JSON响应处理）
     * @param {string} path - 接口路径（如/api/chat）
     * @param {Object} options - fetch配置
     * @returns {Promise<Object>} 接口响应数据
     */
    async function requestApi(path, options = {}) {
        try {
            // 使用绝对路径请求接口（核心修复：避免相对路径解析错误）
            const url = `${state.apiBaseUrl}${path}`;
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            // 检查响应状态
            if (!response.ok) {
                throw new Error(`接口请求失败 [${response.status}]：${response.statusText}`);
            }

            // 尝试解析JSON，若失败则捕获并返回错误
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            } else {
                // 非JSON响应：读取文本并抛出错误
                const text = await response.text();
                throw new Error(`接口返回非JSON数据：${text.substring(0, 100)}...`);
            }
        } catch (error) {
            // 捕获网络错误、JSON解析错误等
            console.error(`接口请求${path}失败：`, error);
            throw error;
        }
    }

    /**
     * 发送消息（核心：注入海上安全提示词 + 修复接口请求）
     */
    async function sendMessage() {
        let message = elements.messageInput.value.trim();
        if (!message) return;

        // 修复：兼容IntentRecognizer未定义的情况
        let isVisionIntent = false;
        if (window.IntentRecognizer && typeof window.IntentRecognizer.detectVisionIntent === 'function') {
            isVisionIntent = window.IntentRecognizer.detectVisionIntent(message);
        } else {
            // 备用：简单关键词识别视觉意图
            const visionKeywords = ['检测', '识别', '图片', '视频', '海上目标', '画面'];
            isVisionIntent = visionKeywords.some(key => message.includes(key));
        }

        // 检查视觉意图是否有媒体文件
        if (isVisionIntent && !state.mediaBase64) {
            alert('海上视觉分析需要上传图片或视频文件！');
            return;
        }

        // 核心改造：注入海上安全专用提示词
        let finalMessage = message;
        if (isVisionIntent) {
            // 视觉分析：拼接海上目标检测提示词
            finalMessage = `${systemPrompts.vision}\n\n用户问题：${message}`;
        } else {
            // 文本对话：拼接海上安全文本分析提示词
            finalMessage = `${systemPrompts.text}\n\n用户问题：${message}`;
        }

        // 添加用户消息到界面（展示原始问题，隐藏注入的提示词）
        addMessageToUI('user', message, state.originalMediaUrl, state.isVideo);

        // 清空输入
        elements.messageInput.value = '';

        try {
            showLoading();
            // 调用LLM接口（使用修复后的requestApi函数，绝对路径）
            const data = await requestApi('/api/chat', {
                method: 'POST',
                body: JSON.stringify({
                    message: finalMessage, // 注入提示词后的完整消息
                    mediaBase64: state.mediaBase64,
                    mediaType: state.mediaType,
                    isVision: isVisionIntent,
                    textModel: state.settings.textModel,
                    visionModel: state.settings.visionModel,
                    apiKey: state.settings.apiKey,
                    systemIdentity: systemPrompts.identity // 传递系统身份定义
                })
            });

            if (data.error) throw new Error(data.error);

            // 添加助手回复到界面
            addMessageToUI('assistant', data.reply);

            // 更新历史会话
            state.history = data.history;
            updateHistoryList();

            // 移除媒体文件（单次使用）
            window.removeMedia();
        } catch (error) {
            // 精准捕获错误类型，避免JSON解析错误
            const errorMsg = error.message.includes('Unexpected token \'<\'')
                ? '❌ 海上安全分析失败：后端服务未启动或接口配置错误'
                : `❌ 海上安全分析失败：${error.message}`;
            addMessageToUI('assistant', errorMsg, null, false, true);
            console.error(error);
        } finally {
            hideLoading();
        }
    }

    /**
     * 渲染消息UI（适配海上安全主题 + 错误样式优化）
     */
    function addMessageToUI(role, content, mediaUrl = null, isVideo = false, isError = false) {
        document.querySelector('.welcome-message')?.remove();

        const messageDiv = document.createElement('div');
        // 新增：错误消息样式
        messageDiv.className = `message ${role} ${isError ? 'error-message' : ''}`;

        // 头像替换为海上安全相关图标
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        if (isError) {
            avatar.innerHTML = '<i class="fas fa-triangle-exclamation"></i>'; // 错误图标
        } else {
            avatar.innerHTML = role === 'user'
                ? '<i class="fas fa-user-gear"></i>' // 海事人员图标
                : '<i class="fas fa-satellite-dish"></i>'; // 预警系统图标
        }

        // 消息内容
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        // 解析Markdown（助手消息，非错误）
        if (role === 'assistant' && !isError) {
            // 兼容MarkdownParser未定义的情况
            if (window.MarkdownParser && typeof window.MarkdownParser.parse === 'function') {
                contentDiv.innerHTML = `<div class="markdown-content">${window.MarkdownParser.parse(content)}</div>`;
            } else {
                // 简单换行处理
                contentDiv.innerHTML = `<div class="markdown-content">${content.replace(/\n/g, '<br>')}</div>`;
            }
        } else {
            contentDiv.textContent = content;
        }

        // 添加媒体附件（区分图片/视频）
        if (mediaUrl) {
            const mediaDiv = document.createElement('div');
            mediaDiv.className = 'media-attachment';

            if (isVideo) {
                mediaDiv.innerHTML = `
                    <div style="position:relative;">
                        <video src="${mediaUrl}" controls style="max-width:300px;max-height:300px;border-radius:8px;"></video>
                        <div style="position:absolute;bottom:5px;right:5px;background:rgba(0,0,0,0.5);color:white;padding:2px 8px;border-radius:4px;font-size:12px;">
                            已分析海上目标
                        </div>
                    </div>
                `;
            } else {
                mediaDiv.innerHTML = `<img src="${mediaUrl}" alt="海上影像" style="max-width:300px;max-height:300px;border-radius:8px;">`;
            }

            contentDiv.appendChild(mediaDiv);
        }

        // 组装消息
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(contentDiv);
        elements.chatContainer.appendChild(messageDiv);

        // 滚动到底部
        elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
    }

    /**
     * 新建分析会话（修复：使用绝对路径接口请求）
     */
    async function createNewSession() {
    try {
        showLoading();
        // 使用修复后的 requestApi 函数，确保返回 JSON
        const data = await requestApi('/api/new-session', { method: 'POST' });

        // 如果返回的数据中有 success 字段且为 true，表示成功
        if (data.success) {
            state.history = [];
            elements.chatContainer.innerHTML = `
                <div class="welcome-message">
                    <i class="fas fa-ship"></i>
                    <h3>欢迎使用海上安全预警智能分析系统</h3>
                    <p>支持海上安全知识科普、海上目标识别、风险检测、安全预警分析<br></p>
                </div>
            `;
            updateHistoryList();
            window.removeMedia();
            alert('新的海上安全分析会话已创建！');
        }
    } catch (error) {
        // 根据错误类型生成不同的错误信息
        let errorMsg = '创建新分析会话失败：';

        // 如果错误信息包含 Unexpected token '<'，说明返回了 HTML
        if (error.message.includes('Unexpected token \'<\'')) {
            errorMsg += '后端服务未启动或接口配置错误，返回了非 JSON 数据';
        } else {
            errorMsg += error.message; // 其他错误信息
        }

        // 显示错误信息
        alert(errorMsg);
        console.error(error);  // 在控制台打印完整错误
    } finally {
        hideLoading();
    }
}


    /**
     * 保存系统设置
     */
    function saveSettings() {
        state.settings.apiKey = elements.apiKeyInput.value.trim();
        state.settings.textModel = elements.textModelInput.value.trim();
        state.settings.visionModel = elements.visionModelInput.value.trim();

        // 验证API Key非空
        if (!state.settings.apiKey) {
            alert('API Key不能为空！');
            return;
        }

        localStorage.setItem('apiKey', state.settings.apiKey);
        localStorage.setItem('textModel', state.settings.textModel);
        localStorage.setItem('visionModel', state.settings.visionModel);

        elements.settingsModal.classList.remove('active');
        alert('海上安全系统设置已保存！');
    }

    /**
     * 加载分析历史（修复：使用绝对路径接口请求）
     */
    async function loadHistory() {
        try {
            // 使用修复后的requestApi函数
            const data = await requestApi('/api/history', { method: 'GET' });
            state.history = data.history || [];

            if (state.history.length > 0) {
                document.querySelector('.welcome-message')?.remove();
                state.history.forEach(msg => {
                    if (msg.role === 'user') {
                        const textContent = msg.content.find(item => item.type === 'text')?.text || '';
                        // 过滤掉注入的提示词，只显示用户原始问题
                        const originalQuestion = textContent.includes('用户问题：')
                            ? textContent.split('用户问题：')[1]
                            : textContent;
                        const mediaUrl = msg.content.find(item => item.type === 'image_url')?.image_url?.url || null;
                        addMessageToUI('user', originalQuestion, mediaUrl, false);
                    } else if (msg.role === 'assistant') {
                        const textContent = msg.content.find(item => item.type === 'text')?.text || '';
                        addMessageToUI('assistant', textContent);
                    }
                });
            }

            updateHistoryList();
        } catch (error) {
            console.error('加载分析历史失败：', error);
            // 不阻断页面加载，仅在控制台输出
        }
    }

    /**
     * 更新分析历史列表
     */
    function updateHistoryList() {
        elements.historyList.innerHTML = '';

        const userMessages = state.history.filter(msg => msg.role === 'user');
        if (userMessages.length === 0) {
            elements.historyList.innerHTML = '<div class="history-item">暂无分析记录</div>';
            return;
        }

        const recentMessages = userMessages.slice(-5).reverse();
        recentMessages.forEach((msg, index) => {
            let text = msg.content.find(item => item.type === 'text')?.text || '无内容';
            // 过滤提示词，只显示用户原始问题
            text = text.includes('用户问题：') ? text.split('用户问题：')[1] : text;
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            historyItem.textContent = text.length > 20 ? text.substring(0, 20) + '...' : text;
            elements.historyList.appendChild(historyItem);
        });
    }

    /**
     * 显示加载状态
     */
    function showLoading() {
        elements.loadingOverlay.classList.remove('hidden');
    }

    /**
     * 隐藏加载状态
     */
    function hideLoading() {
        elements.loadingOverlay.classList.add('hidden');
    }

    // 全局错误捕获：防止未处理的Promise错误
    window.addEventListener('unhandledrejection', (event) => {
        console.error('未处理的Promise错误：', event.reason);
        addMessageToUI('assistant', `❌ 系统异常：${event.reason.message}`, null, false, true);
        hideLoading();
    });
});