require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const OpenAI = require('openai');
const session = require('express-session');

// 初始化Express
const app = express();
const PORT = process.env.PORT || 3000;

// 中间件配置
app.use(cors({
  origin: 'http://www.rainbowyu.com.cn', // 设置允许访问的域名（根据需要调整）
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

// 会话管理
app.use(session({
  secret: 'maritime-safety-secret-key', // 改为海上安全相关密钥
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // 如果使用 HTTPS，需设置 secure: true
}));

// 初始化OpenAI客户端
const createOpenAIClient = (apiKey, baseURL = 'https://dashscope.aliyuncs.com/compatible-mode/v1') => {
  return new OpenAI({ apiKey, baseURL });
};

// 意图识别接口（更新为海上安全关键词）
app.post('/api/intent', (req, res) => {
  const { message } = req.body;
  const detectKeywords = ['检测', '识别', '分析', '海上目标', '船只', '风险', '预警', '安全', '海况'];
  const isVisionIntent = detectKeywords.some(keyword => message.includes(keyword));
  res.json({ isVision: isVisionIntent });
});

// LLM调用接口（核心：添加系统身份提示词）
app.post('/api/chat', async (req, res) => {
  try {
    const {
      message,
      mediaBase64,
      mediaType,
      isVision,
      textModel,
      visionModel,
      apiKey,
      systemIdentity // 接收系统身份提示词
    } = req.body;

    // 初始化客户端
    const client = createOpenAIClient(apiKey);

    // 构建消息体（核心：添加system角色的海上安全身份定义）
    let messages = [];

    // 加载历史会话
    if (req.session.history) {
      messages = req.session.history;
    } else {
      // 首次会话：添加系统身份提示词（只添加一次）
      messages.push({
        role: 'system',
        content: [{ type: 'text', text: systemIdentity || `你是专业的海上安全预警智能分析专家，专注于海上目标识别和安全风险预警，回答必须围绕海上安全展开。` }]
      });
    }

    // 添加用户消息
    const userMessage = { role: 'user', content: [] };
    if (mediaBase64 && isVision) {
      userMessage.content.push({
        type: "image_url",
        image_url: {
          url: `data:${mediaType};base64,${mediaBase64}`
        }
      });
    }
    userMessage.content.push({ type: "text", text: message });
    messages.push(userMessage);

    // 调用模型
    const response = await client.chat.completions.create({
      model: isVision ? visionModel : textModel,
      messages: messages,
      stream: false,
      temperature: 0.7
    });

    const assistantReply = response.choices[0].message.content;
    messages.push({ role: 'assistant', content: [{ type: "text", text: assistantReply }] });

    // 保存历史会话
    req.session.history = messages;

    res.json({
      reply: assistantReply,
      history: messages
    });
  } catch (error) {
    console.error('海上安全分析失败：', error);
    res.status(500).json({
      error: '海上安全分析失败：' + (error.message || '未知错误'),
      details: process.env.NODE_ENV === 'development' ? error : null
    });
  }
});

// 新建会话接口
app.post('/api/new-session', (req, res) => {
  req.session.history = [];
  res.json({ success: true, message: '新的海上安全分析会话已创建' });
});

// 获取历史会话接口
app.get('/api/history', (req, res) => {
  res.json({ history: req.session.history || [] });
});

// 根路由返回前端页面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 启动服务
app.listen(PORT, () => {
  console.log(`海上安全预警系统运行在 http://localhost:${PORT}`);
});
