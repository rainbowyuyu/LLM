require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const OpenAI = require('openai');
const session = require('express-session');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// 模拟数据库
const MOCK_DB = {
    users: [{ id: 'u1', username: 'admin', password: '123', name: '指挥中心' }],
    sessions: {}
};

// 配置中间件 (limit调大以支持多图上传)
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, "public")));
app.use(session({
    secret: 'maritime-super-secret',
    resave: false, saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// --- 工具定义 (Function Calling) ---
const MARITIME_TOOLS = [
    {
        type: "function",
        function: {
            name: "broadcast_warning",
            description: "向周边海域发送紧急广播，用于火灾、碰撞或落水等危险情况。",
            parameters: {
                type: "object",
                properties: {
                    level: { type: "string", enum: ["INFO", "WARNING", "CRITICAL"] },
                    message: { type: "string", description: "广播的具体内容" }
                },
                required: ["level", "message"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "lock_target",
            description: "锁定画面中的特定目标（如可疑船只、落水人员）。",
            parameters: {
                type: "object",
                properties: {
                    targetType: { type: "string", description: "目标类型" },
                    action: { type: "string", enum: ["TRACK", "IDENTIFY", "INTERCEPT"] }
                },
                required: ["targetType", "action"]
            }
        }
    }
];

// --- 路由 ---

// 登录
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = MOCK_DB.users.find(u => u.username === username && u.password === password);
    if (user) {
        req.session.user = { id: user.id, name: user.name };
        res.json({ success: true, user: req.session.user });
    } else {
        res.status(401).json({ error: "认证失败" });
    }
});

app.get('/api/auth/check', (req, res) => req.session.user ? res.json({ isAuth: true, user: req.session.user }) : res.json({ isAuth: false }));
app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });

// 会话管理
app.get('/api/sessions', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
    const list = Object.values(MOCK_DB.sessions)
        .filter(s => s.userId === req.session.user.id)
        .map(s => ({ id: s.id, title: s.title }))
        .reverse();
    res.json(list);
});

app.post('/api/session/new', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
    const id = uuidv4();
    MOCK_DB.sessions[id] = { id, userId: req.session.user.id, title: "新分析任务", messages: [] };
    res.json({ id });
});

app.get('/api/session/:id', (req, res) => {
    const s = MOCK_DB.sessions[req.params.id];
    s ? res.json(s) : res.status(404).json({ error: "Not Found" });
});

// --- 核心流式聊天接口 ---
app.post('/api/chat-stream', async (req, res) => {
    // 关键配置：禁用缓冲，确保流式输出能穿透 Nginx/代理
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const { message, images, apiKey, sessionId, useTools } = req.body;
    const session = MOCK_DB.sessions[sessionId];

    if (!session || !apiKey) {
        res.write(`data: ${JSON.stringify({ error: "会话无效或缺少API Key" })}\n\n`);
        return res.end();
    }

    try {
        const client = new OpenAI({ apiKey, baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' });

        // 自动更新标题
        if (session.messages.length === 0) session.title = message.slice(0, 15) || "视频分析";

        // 构建消息历史 (简化上下文以节省token)
        const context = session.messages.slice(-6).map(m => ({ role: m.role, content: m.text }));

        // 构建当前消息
        const currentContent = [];
        if (images && images.length > 0) {
            images.forEach(img => currentContent.push({ type: "image_url", image_url: { url: img } }));
        }
        currentContent.push({ type: "text", text: message });

        const messages = [
            { role: "system", content: "你是海上安全专家。分析图像/视频帧中的风险。如果情况紧急，请务必调用工具处理。" },
            ...context,
            { role: "user", content: currentContent }
        ];

        const stream = await client.chat.completions.create({
            model: "qwen-vl-max", // 使用支持视觉和工具的模型
            messages: messages,
            stream: true,
            tools: useTools ? MARITIME_TOOLS : undefined
        });

        let fullText = "";
        let toolCallsMap = {};

        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;

            // 1. 处理文本流
            if (delta?.content) {
                fullText += delta.content;
                res.write(`data: ${JSON.stringify({ content: delta.content })}\n\n`);
            }

            // 2. 处理工具调用流 (拼接片段)
            if (delta?.tool_calls) {
                delta.tool_calls.forEach(tc => {
                    if (!toolCallsMap[tc.index]) toolCallsMap[tc.index] = { name: "", args: "" };
                    if (tc.function?.name) toolCallsMap[tc.index].name += tc.function.name;
                    if (tc.function?.arguments) toolCallsMap[tc.index].args += tc.function.arguments;
                });
            }
        }

        // 3. 解析并发送完整的工具调用
        const finalTools = Object.values(toolCallsMap).map(tc => {
            try { return { name: tc.name, args: JSON.parse(tc.args) }; } catch { return null; }
        }).filter(Boolean);

        if (finalTools.length > 0) {
            res.write(`data: ${JSON.stringify({ tools: finalTools })}\n\n`);
            fullText += `\n[系统自动操作: ${finalTools.map(t => t.name).join(', ')}]`;
        }

        // 4. 保存历史 (不存Base64以防内存溢出)
        session.messages.push({ role: 'user', text: message, hasImage: !!(images && images.length) });
        session.messages.push({ role: 'assistant', text: fullText });

        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
    } catch (err) {
        console.error("AI Error:", err);
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
    }
});

// 根路由返回前端页面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 Maritime AI Server running on http://localhost:${PORT}`));