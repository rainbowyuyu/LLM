/**
 * Markdown解析模块
 * 使用marked和highlight.js实现代码高亮
 */
const MarkdownParser = {
  /**
   * 初始化Markdown解析器
   */
  init() {
    // 配置marked
    marked.setOptions({
      highlight: (code, lang) => {
        if (lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
      },
      breaks: true,
      gfm: true
    });
  },

  /**
   * 解析Markdown为HTML
   * @param {string} markdown - Markdown文本
   * @returns {string} 解析后的HTML
   */
  parse(markdown) {
    if (!markdown) return '';
    return marked.parse(markdown);
  }
};

// 初始化解析器
document.addEventListener('DOMContentLoaded', () => {
  MarkdownParser.init();
});

// 暴露到全局
window.MarkdownParser = MarkdownParser;