# 第三方组件声明

## Butterfly（CSS / JS 内核）

- 项目：https://github.com/jerryc127/hexo-theme-butterfly
- 作者：JerryC
- 许可：Apache License 2.0

本站的 `static/css/index.css`、`static/js/main.js`、`static/js/utils.js` 取自 Butterfly 主题
（构建产物），用于还原其视觉与交互（侧栏、深色模式、目录滚动高亮、回到顶部、PJAX 等）。

`layouts/` 下的 Hugo 模板为本站自行编写，用于把 Hugo 的内容模型映射到 Butterfly 的 DOM 结构，
并非 Butterfly 原始模板（原主题为 Hexo/EJS）。

若需替换为其他版本，直接覆盖 `static/css/index.css` 与 `static/js/*.js` 即可，
但请确认新版 DOM 类名未变。
