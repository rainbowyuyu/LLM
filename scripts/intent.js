/**
 * 海上安全意图识别模块
 * 检测用户输入是否包含海上安全/目标检测相关关键词
 */
const IntentRecognizer = {
  // 海上安全视觉分析关键词（核心）
  visionKeywords: [
    // 基础检测
    '检测', '识别', '分析', '看一下', '图片里', '视频里', '内容是什么',
  ],

  /**
   * 识别用户是否需要海上视觉分析
   * @param {string} message - 用户输入的消息
   * @returns {boolean} 是否为海上视觉分析意图
   */
  detectVisionIntent(message) {
    if (!message || typeof message !== 'string') return false;
    return this.visionKeywords.some(keyword => message.includes(keyword));
  },

  /**
   * 异步调用后端意图识别接口（备用）
   * @param {string} message - 用户输入的消息
   * @returns {Promise<boolean>} 是否为视觉意图
   */
  async detectIntentFromServer(message) {
    try {
      const response = await fetch('/api/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      const data = await response.json();
      return data.isVision || false;
    } catch (error) {
      console.error('意图识别接口调用失败：', error);
      // 降级使用本地识别
      return this.detectVisionIntent(message);
    }
  }
};

// 暴露到全局
window.IntentRecognizer = IntentRecognizer;