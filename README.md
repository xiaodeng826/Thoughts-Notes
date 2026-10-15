# 我的博客

基于 **Hugo + Blowfish** 的静态博客，托管在 **GitHub Pages**。
纯静态、无数据库、无服务器——构建只需要一个 Hugo 二进制文件，十年后它依然跑得起来。

---

## 图形化管理后台（推荐用这个写博客）

双击 **`管理博客.bat`**，浏览器会自动打开 <http://localhost:1414/>。

| 能做什么 | 说明 |
| --- | --- |
| **板块管理** | 新建 / 排序 / 删除板块，顶部导航菜单**自动同步** |
| **写新文章** | 选板块、填标题，自动建好目录，默认存为草稿 |
| **编辑文章** | 标题、日期、描述、标签、分类、正文，带 Markdown 预览 |
| **草稿 ↔ 发布** | 勾选/取消「草稿」即可，不用手工改 front matter |
| **删除文章** | 带二次确认，会连带清理空目录 |
| **预览** | 一键启动 / 停止 Hugo，直接打开预览页 |
| **发布到线上** | 一键 `git add` → `commit` → `push`，GitHub 随后自动更新网站 |
| **🖼 图片上传** | 拖拽 / 粘贴 / 选文件，自动存进文章目录并插入 Markdown |
| **设置** | 提交信息模板、回收站，以及预留的 GitHub Token 接口 |

它**只读写 `content/` 目录里的 Markdown 文件**——没有数据库、不碰主题、不引入任何 npm 依赖（全部用 Node 内置模块实现）。关掉窗口服务就停了，你的文章依然是普通的 `.md` 文件。

> 需要 Node.js（本机已装，`C:\Program Files\nodejs`）。
> 注意：**博客的构建与部署本身完全不需要 Node**，这只是本地管理工具的运行时。
> 后台设置（含 GitHub Token，如果以后填了）存在 `admin/settings.json`，已被 `.gitignore` 排除。

### 内容约定

- **一个板块 = `content/` 下的一个目录**，例如 `content/tech/`
- **一篇文章 = 一个页面包** `content/<板块>/<网址标识>/index.md`，配图放在同一层即可
- 板块的**显示名和排序**写在各自的 `content/<板块>/_index.md`

---

---

## 文章的三种状态（最容易搞混，务必分清）

| 状态 | 网站上看得到 | 会传到 GitHub 吗 | 怎么设置 |
| --- | --- | --- | --- |
| **已发布** | ✅ 看得到 | ✅ 会 | 两个开关都不勾 |
| **草稿** | ❌ 看不到 | ⚠️ **会** | 勾「草稿（网站不显示）」 |
| **🔒 仅本地** | ❌ 看不到 | ❌ **不会** | 勾「🔒 仅本地（不上传 GitHub）」 |

**关键区别**：草稿只是「网站不显示」，文件照样会被推上 GitHub——仓库是公开的，**任何人都能读到草稿原文**。
真要保密，必须勾「🔒 仅本地」。

勾上「仅本地」后，后台会自动把该文章的路径写进 `.gitignore`，并在发布时主动把它从 git 索引里剔除，
确保**一个字都不会上传**。取消勾选即恢复正常上传。（实测：勾上后 `git status` 里完全看不到它。）

> ⚠️ 代价：仅本地的文章只存在于你这台电脑。换电脑或重装系统前，记得先备份 `content/` 目录。
> 另外本地预览是能看到仅本地文章的（因为它确实在 `content/` 里），线上则完全没有它。

---

## 文章目录（自动生成）

**已经默认开启，不用做任何设置。**只要用 Markdown 标题语法写，目录就会自动出来。

### 怎么写

```markdown
## 模块一：准备阶段

### 1. 明确目标

### 2. 收集资料

### 3. 制定计划

## 模块二：实施阶段

### 1. 动手做
```

就会生成这样的目录：

```
模块一：准备阶段
    1. 明确目标
    2. 收集资料
    3. 制定计划
模块二：实施阶段
    1. 动手做
```

### 规则

| 写法 | 作用 |
| --- | --- |
| `##` 二级标题 | 目录的**顶层项**，用来写「模块」 |
| `###` / `####` | **缩进的子项**，用来写「1、2、3 小点」 |
| `#` 一级标题 | ⚠️ **不会**进目录——那是文章大标题的位置，一篇文章里不该再用 |

### 两个形态，自动切换

- **宽屏（≥1024px）**：右侧固定侧边栏，滚动时一直可见
- **窄屏 / 手机**：文章开头一个可折叠的「目录」

你正在读的那一节会**自动高亮**。觉得干扰的话，把 `params.toml` 里的 `smartTOC` 改成 `false` 就关掉了。

> 如果目录里没出现你想要的层级，先检查是不是用了 `#` 一级标题（它故意被排除），
> 或者标题层级跳级了（比如从 `##` 直接跳到 `####`）。

## 写作格式规则（中文写作必看）

Markdown 和 Word / WPS 的排版规则**不一样**，有几处专坑中文写作者。后台已经替你处理了大半：

### 已经自动处理的

| 你可能这么写 | 后台的处理 |
| --- | --- |
| `##标题`（井号后漏空格） | 保存时自动补上 → `## 标题` |
| 段内单个换行 | 已开启 `hardWraps`，换行**原样保留**，不会再连成一坨 |
| 行首打空格做缩进 | 行首空格会被 Markdown 吃掉（规范如此），改由 CSS 统一做 **2 字符首行缩进** |

所以你现在可以**按自然习惯写**，缩进和换行都会正确显示。

### 唯一还需要注意的：想让内容变成"真列表"，前面要空一行

**这样写**（列表前没有空行）→ 只是几行普通文字，不会有列表的缩进和对齐：

```
例子：
1. 第一步
2. 第二步
```

**这样写**（列表前空一行）→ 才会变成带编号的真列表：

```
例子：

1. 第一步
2. 第二步
```

真列表有正确的悬挂缩进，手机上看更整齐。

### 常用语法速查

| 效果 | 写法 |
| --- | --- |
| 二级标题 | `## 标题`（井号后必须有空格） |
| 三级标题 | `### 标题` |
| 加粗 / 斜体 | `**加粗**` / `*斜体*` |
| 行内代码 | 反引号包起来 |
| 引用 | `> 文字` |
| 无序列表 | `- 条目`（前面空一行） |
| 提示框 | `{{< alert >}}内容{{< /alert >}}` |
| 配图 | 用编辑器里的「🖼 上传图片」 |

## 配图怎么放

在编辑器里三种方式都行：

1. 点「🖼 上传图片」选文件
2. 把图片**直接拖进**正文输入框
3. 截图后 **Ctrl+V** 直接粘贴

图片会存进这篇文章自己的目录（`content/<板块>/<文章>/`），并自动在正文插入 `![](文件名)`。
输入框下方会列出这篇文章已有的配图，点一下就能再插一次。

**为什么放本地而不是传图床：**

- 不依赖任何第三方服务——图床哪天挂了，文章里的图还在
- Hugo 会自动生成响应式多尺寸版本（实测：491 KB 的原图，访问者实际只下载 8.5 KB）
- 备份博客 = 备份整个文件夹，图片跟着一起走

> 小技巧：散装单文件文章（`content/x/note.md`）在上传第一张图时会被自动转成页面包
> （`content/x/note/index.md`），**网址完全不变**，不用手动迁移。

## 误删了怎么办

后台的「删除」**不是真删**——文章会被移进 `.trash` 回收站，配图会一起搬走。

- **还原**：设置 → 回收站 → 点「还原」
- **彻底删除**：设置页底部的「清空回收站」

`.trash` 已被 `.gitignore` 排除，不会上传到 GitHub。
（这个安全网是补上的：早些时候有一次文章被误删，是靠文件还在 git 索引里才救回来的。）

## 命令行方式（不想开后台时）

### 1. 本地预览

```powershell
.\preview.ps1
```

浏览器会自动打开 <http://localhost:1313>，改文件即时刷新。

> 如果提示找不到 Hugo：去 <https://github.com/gohugoio/hugo/releases/tag/v0.167.0>
> 下载 `hugo_extended_0.167.0_windows-amd64.zip`，解压出 `hugo.exe` 放进 `.tools\` 目录。
> 只需做一次，换电脑后重新做一次即可。

### 2. 写一篇

```powershell
.\new-post.ps1 "文章标题"
```

会在 `content\essay\<标题>\index.md` 生成一篇草稿（用 `-Section tech` 可指定其它板块）。默认 `draft: true`，写完改成 `false` 才会发布。

配图直接丢进 `content\essay\<标题>\` 文件夹，正文里写 `![](图片名.png)` 即可引用。

### 3. 发布

```powershell
git add -A
git commit -m "新文章"
git push
```

推送后 GitHub 自动构建并上线，大约 1 分钟。部署进度可以在仓库的 **Actions** 标签页看。

---

## 推送前想先检查一遍

```powershell
.\build.ps1
```

它会跑一次和生产环境一样的完整构建，有报错会直接显示出来。产物在 `public\` 目录。

---

## 目录结构

```
blog/
├─ config/_default/                 ← 站点配置，改这里就够了
│   ├─ hugo.toml                    ← 网址、语言、分页
│   ├─ params.toml                  ← 外观、功能开关、评论（最常改）
│   ├─ languages.zh-cn.toml         ← 站点标题、作者名片、社交链接
│   ├─ menus.zh-cn.toml             ← 顶部导航菜单
│   └─ markup.toml                  ← Markdown 渲染规则（基本不用动）
├─ 管理博客.bat                      ← ★ 双击进入图形化管理后台
├─ 启动博客.bat                      ← 只看本地预览用这个
├─ 停止博客.bat                      ← 一次关掉「预览 + 管理后台」
├─ admin/                           ← 管理后台（Node，零 npm 依赖）
│   ├─ server.js                    ← 后台服务
│   └─ public/                      ← 网页界面
├─ content/                         ← 只放文章，全是普通 Markdown
│   ├─ _index.md                    ← 首页简介
│   ├─ about/index.md               ← 关于页
│   ├─ essay/                       ← 板块：随笔
│   ├─ tech/                        ← 板块：技术笔记
│   ├─ reading/                     ← 板块：读书笔记
│   └─ life/                        ← 板块：生活
├─ assets/
│   ├─ css/custom.css               ← 想微调样式写这里（升级主题不会丢）
│   └─ img/avatar.png               ← 头像，换自己的照片直接替换
├─ static/                          ← favicon 等原样拷贝的文件
├─ layouts/partials/comments.html   ← 评论区（Giscus）
├─ themes/blowfish/                 ← 主题本体，不要直接改
├─ .tools/hugo.exe                  ← Hugo 程序（不入库）
└─ .github/workflows/deploy.yml     ← 自动部署脚本
```

---

## 上线前要改的三处

### ① 站点标题 + 作者名片

编辑 `config\_default\languages.zh-cn.toml`：

| 改什么 | 说明 |
| --- | --- |
| `title` | 浏览器标签页上的站点名 |
| `params.author.name` | 你的名字 |
| `params.author.headline` | 一句话签名（支持 Markdown） |
| `params.author.image` | 头像路径，换成自己的照片 |
| `params.author.links` | GitHub / 邮箱等社交图标 |

换头像最简单的方法：用你的照片**直接覆盖** `assets\img\avatar.png`（正方形最好）。

### ② 网址 baseURL

编辑 `config\_default\hugo.toml` 里的 `baseURL`：

- 仓库名**不是** `用户名.github.io` → `https://用户名.github.io/仓库名/`
- 仓库名**正好是** `用户名.github.io` → `https://用户名.github.io/`

> 线上部署时 workflow 会自动传入正确地址，这一行主要影响本地预览效果。

### ③ 关于页

编辑 `content\about\index.md`，把占位的名字和联系方式换成你自己的。

### 还想调的话

- **换配色**：`params.toml` 里的 `colorScheme`，可选 `blowfish`(蓝) / `congo`(紫) / `ocean` / `avocado` / `autumn` / `fire` / `forest` / `slate` / `terminal` / `noir` / `neon` / `github` 等
- **换首页版式**：`params.toml` 里 `[homepage] layout`，可选 `profile`(当前) / `hero` / `card` / `background` / `landing` / `page`
- **换顶栏样式**：`params.toml` 里 `[header] layout`

---

## 部署到 GitHub（只需做一次）

### 1. 建仓库

在 GitHub 上新建一个仓库，**必须选 Public**（私有仓库没法用免费的 Pages 部署）。
名字随便取；如果你想用 `https://用户名.github.io` 这种顶级地址，仓库名就取 `用户名.github.io`。

### 2. 推送代码

先确认 Git 身份配好了（只需一次，换成你自己的名字和邮箱）：

```powershell
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"
```

然后在项目目录里执行（把地址换成你自己的）：

```powershell
git init
git add -A
git commit -m "初始化博客"
git branch -M main
git remote add origin https://github.com/你的用户名/仓库名.git
git push -u origin main
```

### 3. 打开 Pages

仓库页面 → **Settings** → 左侧 **Pages** → **Build and deployment** → **Source** 选 **GitHub Actions**。

> ⚠️ 一定要选 GitHub Actions。选成 "Deploy from a branch" 不会触发我们的构建流程。
>
> **这一步必须手动做，无法自动化。** 工作流里的 `enablement: true` 会尝试自动创建 Pages 站点，
> 但 GitHub 的 `GITHUB_TOKEN` 没有「创建 Pages 站点」的权限（那需要仓库 admin），
> 会报 `Resource not accessible by integration`，导致构建卡在「配置 Pages」这一步。
> 手动开启一次之后，就再也不用碰这个设置页了。

### 4. 完成

回到仓库 **Actions** 标签页，能看到一次正在跑的任务。绿勾之后访问：

```
https://你的用户名.github.io/仓库名/
```

### 5. 以后每次发布

```powershell
git add -A
git commit -m "写了新文章"
git push
```

就这样。构建、优化、上线全部由 GitHub 完成。

---

## 以后想加速访问（可选）

`github.io` 在国内访问有时不稳定。两条免费路线：

1. **绑自定义域名**：买个域名，在仓库 Settings → Pages 里填 Custom domain。注意博客的 `baseURL` 也要改成你的域名。
2. **换托管平台**：把仓库接到 Cloudflare Pages 或 Vercel，它们都能直接读 GitHub 仓库并自动构建，构建命令填 `hugo --minify`，输出目录填 `public`。

---

## 开启评论（Giscus）

评论用 [Giscus](https://giscus.app/zh-CN)：基于 GitHub Discussions，免费、无广告、无后端。
文章本来就在 GitHub 上，这是最省心的方案。

**大约 5 分钟：**

1. 确认仓库是 **Public**，然后在仓库 **Settings → General → Features** 勾选 **Discussions**
2. 到 <https://github.com/apps/giscus> 安装 Giscus App，授权给这个仓库
3. 打开 <https://giscus.app/zh-CN>，填入 `用户名/仓库名`，选一个 Discussion 分类
   （没有的话先在 Discussions 里建一个，例如 `Announcements`）
4. 页面下方会生成参数，把 `repo` / `repo-id` / `category` / `category-id` 四个值
   抄进 `config\_default\params.toml` 的 `[giscus]` 段

最后把同文件 `[article]` 下的 `showComments = false` 改成 `true`，推送即可。

评论区的深色/浅色会自动跟随网站设置（这个逻辑写在 `layouts\partials\comments.html` 里）。

---

## 升级主题

主题在 `themes\blowfish\`，**不要直接改它**——改了升级就会丢。
所有个性化都写在 `config\`、`assets\`、`layouts\` 里，这些升级时不受影响。

1. 到 <https://github.com/nunocoracao/blowfish/releases> 下载新版
2. 解压后覆盖 `themes\blowfish\`
   （顺手删掉新包里的 `exampleSite\` 和 `images\`，能省 100MB）
3. 跑一次 `.\build.ps1` 确认没问题

> 新版要求的 Hugo 版本写在 `themes\blowfish\config.toml` 的 `[module.hugoVersion]`。
> 如果当前 Hugo 超出范围，要一起换 Hugo，并同步修改 `.github\workflows\deploy.yml`
> 里的 `HUGO_VERSION` 和 `preview.ps1` 提示文字里的版本号。

---

## 常见问题

**页面没样式 / 报找不到主题？**
确认 `themes\blowfish\` 目录存在且不为空，且 `config\_default\hugo.toml` 里有 `theme = "blowfish"`。

**草稿看不见，或发布后草稿跑出来了？**
本地 `preview.ps1` 带了 `-D` 参数，所以草稿也显示；线上只发布 `draft: false` 的文章。

**中文标题的网址是一串百分号？**
这是正常的编码。想要英文网址就用：
`.\new-post.ps1 "中文标题" -Slug english-url`

**图片放哪？**
放进文章同级目录，正文写 `![](图.png)` 即可；
放进 `assets\img\` 再引用也可以，那样会被自动压缩裁剪。

**怎么换网站图标（favicon）？**
替换 `static\` 下的 `favicon.ico`、`favicon-32x32.png`、`apple-touch-icon.png` 等文件。

**双击「管理博客.bat」报端口 1414 被占用？**
说明管理后台**已经在运行了**。重复双击是安全的：它会直接帮你打开浏览器，然后自己退出。
想重启就先运行「停止博客.bat」，或关掉原来那个黑色窗口。
（真被别的程序占用了，可以在 `管理博客.bat` 里加一行 `set BLOG_ADMIN_PORT=1415` 换端口。）
**手动跑 hugo 报「Access is denied」？**
加上 `--cacheDir .hugo-cache`，把缓存放进项目内，避开系统临时目录的权限问题
（`preview.ps1` / `build.ps1` 已经内置了这个参数）。

**文章想置顶 / 改排序？**
在 front matter 里加 `weight = 1`（数字越小越靠前），或给 `params.toml` 的 `[list]` 打开 `orderByWeight = true`。

---

## 技术栈

| 组件 | 版本 | 说明 |
| --- | --- | --- |
| Hugo | 0.167.0 extended | 静态站点生成器，单文件、零依赖 |
| Blowfish | 3.9.0 | Hugo 主题，已内置在 `themes\` |
| 部署 | GitHub Actions + Pages | 免费、自动 |

主题的样式（Tailwind CSS）在发布版里是**已经编译好的**，所以日常写作不需要 Node.js、不需要 `npm install`。
