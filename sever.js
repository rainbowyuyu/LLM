const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// 调用
app.post('/api/chat', async (req, res) => {
    try {
        const { message, apiKey, modelName = 'deepseek-r1' } = req.body;

        if (!message || !apiKey) {
            return res.status(400).json({
                success: false,
                error: '缺少消息内容或API Key'
            });
        }

        // 阿里云百炼API endpoint
        const apiUrl = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';

        const response = await axios.post(
            apiUrl,
            {
                model: modelName,
                input: {
                    messages: [
                        {
                            role: 'user',
                            content: message
                        }
                    ]
                },
                parameters: {
                    temperature: 0.7,
                    top_p: 0.9
                }
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                }
            }
        );

        // 处理API响应
        if (response.data.output && response.data.output.choices && response.data.output.choices.length > 0) {
            const result = response.data.output.choices[0].message.content;
            return res.json({
                success: true,
                result: result
            });
        } else {
            return res.json({
                success: false,
                error: '未获取到有效响应',
                details: response.data
            });
        }
    } catch (error) {
        console.error('API调用错误:', error);
        return res.status(500).json({
            success: false,
            error: error.message || '服务器内部错误',
            details: error.response?.data || null
        });
    }
});

// 前端页面路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
});