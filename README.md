# 个人名片站

这是一个零构建依赖的个人名片网站，适合部署到云服务器、Nginx、对象存储静态站点、GitHub Pages 或 Cloudflare Pages。

## 本地预览

直接双击 `index.html` 即可打开。也可以在目录里启动一个静态服务器：

```powershell
python -m http.server 8000
```

然后访问：

```text
http://localhost:8000
```

如果本机没有 Python，也可以把整个目录上传到服务器的 Web 根目录。

## 你需要先替换的内容

- `index.html` 里的个人介绍、QQ、微信、邮箱
- `assets/qq-homepage.jpg`：QQ 主页截图，已经放入项目
- `assets/eren-bg.jpg`：背景图位置。请放入你自己有权使用的艾伦耶格尔图片，并命名为 `eren-bg.jpg`
- `assets/red-high-heels.mp3`：背景音乐位置。请放入你自己有权使用的《红色高跟鞋》音频文件
- `assets/skill-1.jpg` 到 `assets/skill-4.jpg`：技能展示图片
- `assets/award-1.jpg` 到 `assets/award-5.jpg`：奖项展示图片

## 功能说明

- 注册登录是前端演示版，数据保存在浏览器 `localStorage`，不适合直接当真实账号系统使用。
- 私信留言要求先登录，但仍是前端演示版，只有当前浏览器能看到。真正上线给别人留言，需要后端接口和数据库。
- 背景音乐不会自动播放，浏览器通常要求用户主动点击播放。

## 文件说明

- `index.html`：页面结构和内容
- `styles.css`：样式和响应式布局
- `script.js`：复制邮箱、年份等轻量交互
- `deploy-guide.md`：从服务器、域名到备案的部署说明
