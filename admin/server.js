#!/usr/bin/env node
/**
 * 博客本地管理后台
 * 零 npm 依赖，只用 Node 内置模块。启动：node admin/server.js
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFile, spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const CONTENT = path.join(ROOT, "content");
const PUBLIC_DIR = path.join(__dirname, "public");
const SETTINGS_FILE = path.join(__dirname, "settings.json");
const TRASH = path.join(ROOT, ".trash");
const HUGO = path.join(ROOT, ".tools", process.platform === "win32" ? "hugo.exe" : "hugo");
const PORT = Number(process.env.BLOG_ADMIN_PORT || 1414);
const ADMIN_URL = "http://localhost:" + PORT + "/";

const DEFAULT_SETTINGS = {
  github: { repo: "", branch: "main", token: "" },
  publish: { message: "更新文章" },
};

function readSettings() {
  const base = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  try {
    const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
    return Object.assign(base, saved);
  } catch (e) {
    return base;
  }
}
function writeSettings(s) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2), "utf8");
}
function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

/* ============ front matter 解析（只接管 UI 管理的字段，其余原样保留）============ */
const MANAGED = ["title", "date", "draft", "description", "tags", "categories"];

function splitDoc(text) {
  const m = /^(---|\+\+\+)\r?\n([\s\S]*?)\r?\n\1\r?\n?/.exec(text);
  if (!m) return { delim: "---", front: "", body: text, hadFront: false };
  return { delim: m[1], front: m[2], body: text.slice(m[0].length), hadFront: true };
}

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function fieldSpan(lines, key) {
  const re = new RegExp("^" + esc(key) + "\\s*[:=]");
  for (let i = 0; i < lines.length; i++) {
    if (!re.test(lines[i])) continue;
    let end = i;
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s+\S/.test(lines[j])) end = j; else break;
    }
    return { start: i, end: end };
  }
  return null;
}

function unquote(s) {
  s = String(s).trim();
  if (s.length >= 2 && ((s[0] === '"' && s.slice(-1) === '"') || (s[0] === "'" && s.slice(-1) === "'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function readRaw(lines, key) {
  const span = fieldSpan(lines, key);
  if (!span) return null;
  return lines.slice(span.start, span.end + 1).join("\n").replace(/^[^:=]+[:=]/, "").trim();
}

function readScalar(lines, key) {
  const raw = readRaw(lines, key);
  if (raw == null) return null;
  return unquote(raw.split(/\r?\n/)[0]);
}

function readList(lines, key) {
  const raw = readRaw(lines, key);
  if (!raw) return [];
  const out = [];
  const inline = /^\[([\s\S]*)\]$/.exec(raw);
  if (inline) {
    inline[1].split(",").forEach(function (s) { const v = unquote(s); if (v) out.push(v); });
  } else {
    raw.split(/\r?\n/).forEach(function (l) {
      const m = /^\s*-\s*(.+)$/.exec(l);
      if (m) out.push(unquote(m[1]));
    });
  }
  return out;
}

function setField(lines, key, text) {
  const span = fieldSpan(lines, key);
  if (span) lines.splice(span.start, span.end - span.start + 1, text);
  else lines.push(text);
}

/* ============ 内容扫描 ============ */
function normDate(v) {
  if (!v) return "";
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v).trim());
  return m ? m[1] : "";
}

function walkPosts(section) {
  const dir = path.join(CONTENT, section);
  const out = [];
  if (!fs.existsSync(dir)) return out;
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    if (e.isDirectory()) {
      const p = path.join(dir, e.name, "index.md");
      if (fs.existsSync(p)) out.push(p);
    } else if (e.isFile() && /\.md$/.test(e.name) && e.name !== "_index.md") {
      out.push(path.join(dir, e.name));
    }
  });
  return out;
}

function readPost(file, section) {
  let text = "";
  try { text = fs.readFileSync(file, "utf8"); } catch (e) { return null; }
  const doc = splitDoc(text);
  const lines = doc.front.split(/\r?\n/);
  const st = fs.statSync(file);
  return {
    path: path.relative(ROOT, file).replace(/\\/g, "/"),
    section: section,
    title: readScalar(lines, "title") || path.basename(path.dirname(file)),
    date: normDate(readScalar(lines, "date")) || st.mtime.toISOString().slice(0, 10),
    draft: String(readScalar(lines, "draft")).toLowerCase() === "true",
    isPrivate: String(readScalar(lines, "private")).toLowerCase() === "true",
    description: readScalar(lines, "description") || "",
    tags: readList(lines, "tags"),
    categories: readList(lines, "categories"),
    mtime: st.mtime.toISOString(),
  };
}

// 从 hugo.toml 读出站点正式地址，用于在后台直接打开线上页面
function siteBaseURL() {
  try {
    const t = fs.readFileSync(path.join(ROOT, "config", "_default", "hugo.toml"), "utf8");
    const m = /^\s*baseURL\s*=\s*"([^"]*)"/m.exec(t);
    return m ? m[1].replace(/\/$/, "") : "";
  } catch (e) { return ""; }
}

// 算出一篇文章的线上地址。Hugo 默认把网址转小写，这里必须跟着一起转。
function postLiveURL(rel) {
  const base = siteBaseURL();
  if (!base) return "";
  const parts = String(rel).split("/");
  const file = parts.pop();
  const slug = (file === "index.md" ? parts.pop() : file.replace(/\.md$/i, "")) || "";
  const section = parts.length ? parts[parts.length - 1] : "";
  return base + "/" + section.toLowerCase() + "/" + encodeURIComponent(slug.toLowerCase()) + "/";
}

function listSections() {
  if (!fs.existsSync(CONTENT)) return [];
  return fs.readdirSync(CONTENT, { withFileTypes: true })
    .filter(function (d) {
      return d.isDirectory() && EXCLUDE_SECTIONS.indexOf(d.name) < 0 && fs.existsSync(path.join(CONTENT, d.name, "_index.md"));
    })
    .map(function (d) {
      const doc = splitDoc(fs.readFileSync(path.join(CONTENT, d.name, "_index.md"), "utf8"));
      const lines = doc.front.split(/\r?\n/);
      const posts = walkPosts(d.name).map(function (p) { return readPost(p, d.name); }).filter(Boolean);
      return {
        name: d.name,
        title: readScalar(lines, "title") || d.name,
        description: readScalar(lines, "description") || doc.body.trim(),
        weight: Number(readScalar(lines, "weight")) || 100,
        published: posts.filter(function (p) { return !p.draft; }).length,
        drafts: posts.filter(function (p) { return p.draft; }).length,
      };
    })
    .sort(function (a, b) { return a.weight - b.weight || a.name.localeCompare(b.name); });
}

function listPosts() {
  const all = [];
  listSections().forEach(function (s) {
    walkPosts(s.name).forEach(function (p) {
      const r = readPost(p, s.name);
      if (r) all.push(r);
    });
  });
  return all.sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
}

/* ============ 写入 ============ */
const EXCLUDE_SECTIONS = ["about", "admin", "all"];

function today() {
  const d = new Date(), p = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
function yamlStr(s) {
  return '"' + String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ") + '"';
}
function yamlList(arr) {
  const a = (arr || []).map(function (x) { return String(x).trim(); }).filter(Boolean);
  return "[" + a.map(yamlStr).join(", ") + "]";
}
function slugify(s) {
  const r = String(s || "").trim().replace(/\s+/g, "-").replace(/[\\/:*?"<>|#%{}^~`\[\];,]/g, "").slice(0, 60);
  return r || "post-" + Date.now();
}
function safeRel(rel) {
  const abs = path.resolve(ROOT, rel);
  const rootAbs = path.resolve(ROOT);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) throw new Error("路径越界： " + rel);
  return abs;
}

// Markdown 规定井号后必须有空格才算标题（##标题 只是普通文字）。
// 中文写作不用空格，这个坑极易踩到，保存时自动补上。
// 把"手打编号 + 空格缩进"的行规整成真正的 Markdown 有序列表：
// 否则行首空格被吃掉、编号也不会有列表缩进。
// 同时避免 4 个以上空格被解析成代码块。
function normalizeLists(text) {
  // 目标：把"手打编号 + 空格缩进"规整成真正的 Markdown 有序列表。
  // 三件事：① 列表前补空行（否则不会被识别成列表）
  //        ② 收敛行首缩进（4+ 空格会被当代码块，3 空格会被当上一项续行）
  //        ③ 列表后补空行并去掉缩进（否则后续段落会被吸进最后一个列表项）
  const lines = String(text || "").split(/\r?\n/);
  const out = [];
  let inFence = false;
  let lastNonBlankWasList = false;   // 只被"非空行"改变，空行不重置
  const isList = function (l) { return /^\s*(?:\d+\.|[-*+])\s*\S/.test(l); };
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; out.push(line); lastNonBlankWasList = false; continue; }
    if (inFence) { out.push(line); continue; }
    if (line.trim() === "") { out.push(line); continue; }

    if (isList(line)) {
      const prev = out.length ? out[out.length - 1] : "";
      if (prev.trim() !== "" && !lastNonBlankWasList) out.push("");
      line = line.replace(/^ {4,}/, "");
      line = line.replace(/^(\s*)(\d{1,9}\.)(?=\S)/, "$1$2 ");
      line = line.replace(/^(\s*)([-*+])\s+(?=\S)/, "$1$2 ");
      out.push(line);
      lastNonBlankWasList = true;
    } else {
      if (lastNonBlankWasList) {
        const prev = out.length ? out[out.length - 1] : "";
        if (prev.trim() !== "") out.push("");
        line = line.replace(/^ {1,}/, "");
      }
      out.push(line);
      lastNonBlankWasList = false;
    }
  }
  return out.join("\n");
}

function normalizeHeadings(text) {
  // 逐行处理，并且跳过围栏代码块内部：
  // 否则 shell 脚本的 #!/bin/bash 会被改成 "# !/bin/bash" 而失效
  let inFence = false;
  return String(text || "").split(/\r?\n/).map(function (line) {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; return line; }
    if (inFence) return line;
    return line.replace(/^(#{1,6})([^\s#])/, "$1 $2");
  }).join("\n");
}

function savePost(input) {
  const rel = String(input.path || "");
  if (!rel) throw new Error("缺少文件路径");
  const abs = safeRel(rel);
  if (!abs.startsWith(CONTENT + path.sep)) throw new Error("只能编辑 content/ 目录下的文件");
  let text = "";
  if (fs.existsSync(abs)) text = fs.readFileSync(abs, "utf8");
  const doc = splitDoc(text);
  const raw = doc.front.trim();
  const lines = raw ? raw.split(/\r?\n/) : [];

  setField(lines, "title", "title: " + yamlStr(input.title || ""));
  setField(lines, "date", "date: " + (normDate(input.date) || today()));
  setField(lines, "draft", "draft: " + (input.draft ? "true" : "false"));
  if (input.isPrivate) setField(lines, "private", "private: true");
  else removeField(lines, "private");
  if (input.description !== undefined) setField(lines, "description", "description: " + yamlStr(input.description));
  setField(lines, "tags", "tags: " + yamlList(input.tags));
  setField(lines, "categories", "categories: " + yamlList(input.categories));

  const rawBody = String(input.body == null ? doc.body : input.body);
  const cleaned = normalizeLists(normalizeHeadings(rawBody));
  const body = cleaned.replace(/^\s*\n+/, "").replace(/\s+$/, "") + "\n";
  const out = "---\n" + lines.join("\n") + "\n---\n\n" + body;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, out, "utf8");
  syncGitignore();
  return { path: path.relative(ROOT, abs).replace(/\\/g, "/") };
}

function createPost(input) {
  const section = String(input.section || "").trim();
  if (!section) throw new Error("请先选择板块");
  const rel = "content/" + section + "/" + slugify(input.slug || input.title) + "/index.md";
  const abs = safeRel(rel);
  if (fs.existsSync(abs)) throw new Error("同名文章已存在，换个标题或指定 slug");
  const r = savePost({ path: rel, title: input.title, date: today(), draft: true, description: "", tags: [], categories: [], body: "" });
  return r;
}

function deletePost(rel) {
  const abs = safeRel(rel);
  if (!abs.startsWith(CONTENT + path.sep)) throw new Error("只能删除 content/ 目录下的文件");
  if (!fs.existsSync(abs)) throw new Error("文件不存在");
  // 安全网：不硬删，移动到 .trash 回收站（可从「设置 → 回收站」还原）
  // 页面包（*/index.md）要连整个目录一起搬，否则配图会丢
  const isBundle = path.basename(abs) === "index.md";
  const origAbs = isBundle ? path.dirname(abs) : abs;
  const relFromContent = path.relative(CONTENT, origAbs).replace(/\\/g, "/");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  fs.mkdirSync(TRASH, { recursive: true });
  const target = path.join(TRASH, stamp + "__" + relFromContent.replace(/\//g, "__"));
  fs.renameSync(origAbs, target);
  syncGitignore();
  return { deleted: rel, trash: path.relative(ROOT, target).replace(/\\/g, "/") };
}

/* ============ 板块管理 ============ */
function createSection(input) {
  const name = String(input.name || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,40}$/.test(name)) {
    throw new Error("板块标识只能用小写字母、数字、- 和 _，并以字母或数字开头（例如 essay）");
  }
  if (EXCLUDE_SECTIONS.indexOf(name) >= 0) throw new Error("这个名字被系统保留了");
  const idx = path.join(CONTENT, name, "_index.md");
  if (fs.existsSync(idx)) throw new Error("板块已存在");
  fs.mkdirSync(path.join(CONTENT, name), { recursive: true });
  const desc = String(input.description || "").trim();
  const L = ["---", "title: " + yamlStr(input.title || name), "description: " + yamlStr(desc)];
  if (input.weight) L.push("weight: " + Number(input.weight));
  // 简述同时写进正文：板块页模板渲染的是 .Content，只放 front matter 是看不到的
  L.push("---", "", desc, "");
  fs.writeFileSync(idx, L.join("\n"), "utf8");
  syncMenu();
  return { name: name };
}

function updateSection(input) {
  const name = String(input.name || "").trim();
  const idx = path.join(CONTENT, name, "_index.md");
  if (!fs.existsSync(idx)) throw new Error("板块不存在");
  const doc = splitDoc(fs.readFileSync(idx, "utf8"));
  const lines = doc.front.trim() ? doc.front.trim().split(/\r?\n/) : [];
  if (input.title !== undefined) setField(lines, "title", "title: " + yamlStr(input.title));
  if (input.weight !== undefined) setField(lines, "weight", "weight: " + Number(input.weight || 100));
  if (input.description !== undefined) setField(lines, "description", "description: " + yamlStr(input.description));
  // 简述改了就同步更新正文，否则改了描述页面上看不出变化
  const newBody = input.description !== undefined
    ? String(input.description).trim()
    : doc.body.replace(/^\s*\n+/, "").trim();
  fs.writeFileSync(idx, "---\n" + lines.join("\n") + "\n---\n\n" + (newBody ? newBody + "\n" : ""), "utf8");
  syncMenu();
  return { name: name };
}

function deleteSection(name) {
  const dir = path.join(CONTENT, name);
  if (!fs.existsSync(path.join(dir, "_index.md"))) throw new Error("板块不存在");
  if (walkPosts(name).length > 0) throw new Error("该板块下还有文章，请先移走或删除");
  fs.rmSync(dir, { recursive: true, force: true });
  syncMenu();
  return { deleted: name };
}

/* ============ 菜单自动同步 ============ */
function syncMenu() {
  const sections = listSections();
  const L = [];
  L.push("# 本文件由「管理博客.bat」后台自动维护");
  L.push("# 增删板块时会自动重写；想加固定菜单项，写在文件末尾即可（下次同步仍在）");
  L.push("");
  L.push("[[main]]");
  L.push("  name = " + yamlStr("文章"));
  L.push("  weight = 10");
  sections.forEach(function (s, i) {
    L.push("");
    L.push("[[main]]");
    L.push("  name = " + yamlStr(s.title));
    L.push("  parent = " + yamlStr("文章"));
    L.push("  pageRef = " + yamlStr(s.name));
    L.push("  weight = " + (11 + i));
  });
  L.push("");
  L.push("[[main]]");
  L.push("  name = " + yamlStr("标签"));
  L.push("  pageRef = " + yamlStr("tags"));
  L.push("  weight = 30");
  L.push("");
  L.push("[[main]]");
  L.push("  name = " + yamlStr("关于"));
  L.push("  pageRef = " + yamlStr("about"));
  L.push("  weight = 40");
  L.push("");
  L.push("[[footer]]");
  L.push("  name = " + yamlStr("RSS"));
  L.push("  url = " + yamlStr("/index.xml"));
  L.push("  weight = 20");
  L.push("");
  fs.writeFileSync(path.join(ROOT, "config", "_default", "menus.zh-cn.toml"), L.join("\n"), "utf8");
}

/* ============ 预览服务（Hugo）============ */
const PREVIEW_URL = "http://localhost:1313/";
let previewProc = null;

function previewStatus() {
  return { running: !!(previewProc && previewProc.exitCode === null), url: PREVIEW_URL };
}
function startPreview() {
  if (previewStatus().running) return previewStatus();
  if (!fs.existsSync(HUGO)) throw new Error("找不到 Hugo： " + HUGO + "（请把 hugo.exe 放进 .tools 目录）");
  previewProc = spawn(HUGO, [
    "server", "--source", ROOT, "--cacheDir", path.join(ROOT, ".hugo-cache"),
    "--baseURL", PREVIEW_URL, "-D", "--port", "1313", "--bind", "127.0.0.1",
  ], { cwd: ROOT, stdio: "ignore", windowsHide: true });
  previewProc.on("exit", function () { previewProc = null; });
  return previewStatus();
}
function stopPreview() {
  if (previewProc) { try { previewProc.kill(); } catch (e) {} previewProc = null; }
  return previewStatus();
}

/* ============ Git / 发布 ============ */
function runGit(args) {
  return new Promise(function (resolve) {
    execFile("git", args, { cwd: ROOT, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, function (err, so, se) {
      resolve({ ok: !err, out: ((so || "") + (se || "")).trim() });
    });
  });
}
async function gitInfo() {
  const st = await runGit(["status", "--porcelain"]);
  const br = await runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  const rm = await runGit(["remote", "get-url", "origin"]);
  const lines = st.ok ? st.out.split(/\r?\n/).filter(Boolean) : [];
  return {
    branch: br.ok ? br.out : "",
    remote: rm.ok ? rm.out : "",
    changes: lines.length,
    files: lines.slice(0, 60),
  };
}
async function publish(message) {
  syncGitignore();
  // 先把「仅本地」文章从 git 索引里剔除，确保它们不会被推到公开仓库
  const priv = privatePaths().map(function (p) { return p.replace(/^\//, ""); });
  if (priv.length) await runGit(["rm", "-r", "--cached", "--ignore-unmatch", "-q"].concat(priv));

  const st = await runGit(["status", "--porcelain"]);
  if (!st.ok) return { ok: false, out: "检查改动失败：\n" + st.out, privateCount: priv.length };
  if (!st.out) return { ok: true, nothing: true, privateCount: priv.length, out: "没有需要提交的改动，线上已经是最新。" };

  const add = await runGit(["add", "-A"]);
  if (!add.ok) return { ok: false, out: add.out, privateCount: priv.length };
  const commit = await runGit(["commit", "-m", message || "更新文章"]);
  if (!commit.ok) return { ok: false, out: commit.out, privateCount: priv.length };
  const push = await runGit(["push"]);
  return { ok: push.ok, privateCount: priv.length, out: (commit.out + "\n\n" + push.out).trim() };
}

/* ============ HTTP 服务 ============ */
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
};

function serveStatic(res, urlPath) {
  const rel = urlPath === "/" ? "index.html" : decodeURIComponent(urlPath.replace(/^\//, ""));
  const abs = path.join(PUBLIC_DIR, rel);
  if (abs.indexOf(PUBLIC_DIR) !== 0 || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404");
    return;
  }
  res.writeHead(200, {
    "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  fs.createReadStream(abs).pipe(res);
}

function readBody(req) {
  return new Promise(function (resolve) {
    let d = "";
    req.on("data", function (c) { d += c; if (d.length > 4e6) req.destroy(); });
    req.on("end", function () { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { resolve({}); } });
  });
}

function maskedSettings() {
  const s = readSettings();
  if (s.github.token) s.github.token = "***";
  return s;
}

/* ============ 路由 ============ */
const server = http.createServer(async function (req, res) {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;
  const q = url.searchParams;
  // 把 content/ 里的图片回显给后台界面看缩略图
  if (req.method === "GET" && p === "/media") {
    const abs = safeRel(q.get("path") || "");
    if (!abs.startsWith(CONTENT + path.sep) || !fs.existsSync(abs)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream" });
    fs.createReadStream(abs).pipe(res);
    return;
  }
  if (req.method === "GET" && p.indexOf("/api/") !== 0) return serveStatic(res, p);
  try {
    if (req.method === "POST" && p === "/api/upload") {
      return json(res, 200, saveUpload(q.get("path"), q.get("name"), await readRawBody(req)));
    }
    const body = req.method === "POST" ? await readBody(req) : {};
    switch (req.method + " " + p) {
      case "GET /api/overview":
        return json(res, 200, {
          sections: listSections(),
          posts: listPosts(),
          preview: previewStatus(),
          git: await gitInfo(),
          settings: maskedSettings(),
          root: ROOT,
          baseURL: siteBaseURL(),
        });
      case "GET /api/post": {
        const abs = safeRel(q.get("path"));
        return json(res, 200, {
          path: q.get("path"),
          raw: fs.readFileSync(abs, "utf8"),
          liveURL: postLiveURL(q.get("path")),
          post: readPost(abs, q.get("section") || ""),
        });
      }
      case "POST /api/post": return json(res, 200, savePost(body));
      case "POST /api/post/create": return json(res, 200, createPost(body));
      case "POST /api/post/delete": return json(res, 200, deletePost(body.path));
      case "POST /api/section": return json(res, 200, body.original ? updateSection(body) : createSection(body));
      case "POST /api/section/delete": return json(res, 200, deleteSection(body.name));
      case "POST /api/preview/start": return json(res, 200, startPreview());
      case "POST /api/preview/stop": return json(res, 200, stopPreview());
      case "GET /api/settings": return json(res, 200, maskedSettings());
      case "POST /api/settings": {
        const s = readSettings();
        if (body.github) {
          const g = Object.assign({}, body.github);
          if (g.token === "***") delete g.token;
          Object.assign(s.github, g);
        }
        if (body.publish) Object.assign(s.publish, body.publish);
        writeSettings(s);
        return json(res, 200, { ok: true });
      }
      case "POST /api/publish": return json(res, 200, await publish(body.message));
      case "GET /api/tags": return json(res, 200, { items: listTags() });
      case "POST /api/tag": return json(res, 200, saveTag(body));
      case "GET /api/images": return json(res, 200, { items: listImages(q.get("path") || "") });
      case "POST /api/image/delete": return json(res, 200, deleteImage(body.path));
      case "GET /api/trash": return json(res, 200, { items: listTrash() });
      case "POST /api/trash/restore": return json(res, 200, restoreTrash(body.id));
      case "POST /api/trash/purge": return json(res, 200, purgeTrash());
      case "POST /api/menu/sync": syncMenu(); return json(res, 200, { ok: true });
      default: return json(res, 404, { error: "未知接口 " + p });
    }
  } catch (e) {
    return json(res, 500, { error: String(e && e.message ? e.message : e) });
  }
});

server.listen(PORT, "127.0.0.1", function () {
  console.log("");
  console.log("  博客管理后台已启动");
  console.log("  地址   http://localhost:" + PORT + "/");
  console.log("  关闭本窗口即停止服务");
  console.log("");
  if (process.argv.indexOf("--open") >= 0) setTimeout(function () { openBrowser(ADMIN_URL); }, 400);
  console.log("");
});

process.on("SIGINT", function () { stopPreview(); process.exit(0); });


function openBrowser(url) {
  var cmd = process.platform === "win32" ? "cmd" : (process.platform === "darwin" ? "open" : "xdg-open");
  var args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try { spawn(cmd, args, { detached: true, stdio: "ignore" }).unref(); } catch (e) { }
}

/* ============ 「仅本地」文章：不上传 GitHub ============ */
const GI_START = "# >>> 管理后台：仅本地文章（自动生成，请勿手改这一段）";
const GI_END = "# <<< 管理后台：仅本地文章";

function removeField(lines, key) {
  let span = fieldSpan(lines, key);
  while (span) {
    lines.splice(span.start, span.end - span.start + 1);
    span = fieldSpan(lines, key);
  }
}

function privatePaths() {
  const out = [];
  function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      if (!/\.md$/.test(e.name) || e.name === "_index.md") return;
      const p = readPost(full, "");
      if (!p || !p.isPrivate) return;
      const rel = path.relative(ROOT, full).replace(/\\/g, "/");
      // 页面包忽略整个目录（连带配图），散装 md 只忽略自身
      out.push(path.basename(rel) === "index.md" ? "/" + path.dirname(rel) + "/" : "/" + rel);
    });
  }
  if (fs.existsSync(CONTENT)) walk(CONTENT);
  return out.sort();
}

function syncGitignore() {
  const gi = path.join(ROOT, ".gitignore");
  let text = "";
  try { text = fs.readFileSync(gi, "utf8"); } catch (e) { text = ""; }
  const a = text.indexOf(GI_START);
  const b = text.indexOf(GI_END);
  if (a >= 0 && b > a) text = text.slice(0, a) + text.slice(b + GI_END.length);
  const paths = privatePaths();
  let block = GI_START + "\n";
  if (paths.length) block += paths.join("\n") + "\n";
  block += GI_END + "\n";
  fs.writeFileSync(gi, text.replace(/\s+$/, "") + "\n\n" + block, "utf8");
  return paths;
}

/* ============ 回收站（删除的文章先放这里，可还原）============ */
function listTrash() {
  if (!fs.existsSync(TRASH)) return [];
  return fs.readdirSync(TRASH, { withFileTypes: true }).map(function (e) {
    const parts = e.name.split("__");
    const raw = parts[0];
    const when = raw.replace("T", " ").replace(/-(\d\d)-(\d\d)$/, ":$1:$2");
    return { id: e.name, time: when, original: parts.slice(1).join("/") };
  }).sort(function (a, b) { return b.id.localeCompare(a.id); });
}

function restoreTrash(id) {
  if (!id || id.indexOf("..") >= 0 || id.indexOf("/") >= 0) throw new Error("非法的回收站条目");
  const src = path.join(TRASH, id);
  if (!fs.existsSync(src)) throw new Error("回收站里找不到这一项");
  const rel = String(id).split("__").slice(1).join("/");
  const dest = path.join(CONTENT, rel);
  if (fs.existsSync(dest)) throw new Error("原位置已有同名文件，请先改掉它：" + rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(src, dest);
  syncGitignore();
  return { restored: rel };
}

function purgeTrash() {
  if (fs.existsSync(TRASH)) fs.rmSync(TRASH, { recursive: true, force: true });
  return { ok: true };
}

/* ============ 图片上传 ============ */
const IMG_EXT = ["jpg", "jpeg", "png", "gif", "webp", "avif", "svg"];
const MAX_UPLOAD = 25 * 1024 * 1024; // 单张上限 25MB

function articleDir(rel) {
  const abs = safeRel(rel);
  if (!abs.startsWith(CONTENT + path.sep)) throw new Error("只能操作 content/ 目录下的文章");
  return { abs: abs, dir: path.dirname(abs), bundle: path.basename(abs) === "index.md" };
}

// 把散装 content/x/note.md 变成页面包 content/x/note/index.md —— 两者的网址是一样的，不会破坏链接
function ensureBundle(rel) {
  const info = articleDir(rel);
  if (info.bundle) return rel;
  const base = path.basename(info.abs).replace(/\.md$/i, "");
  const newDir = path.join(info.dir, base);
  const newAbs = path.join(newDir, "index.md");
  if (fs.existsSync(newAbs)) throw new Error("转换页面包失败，已存在同名目录：" + path.relative(ROOT, newDir));
  fs.mkdirSync(newDir, { recursive: true });
  fs.renameSync(info.abs, newAbs);
  return path.relative(ROOT, newAbs).replace(/\\/g, "/");
}

function readRawBody(req) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    let size = 0;
    req.on("data", function (c) {
      size += c.length;
      if (size > MAX_UPLOAD) { reject(new Error("图片超过 25MB 上限")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", function () { resolve(Buffer.concat(chunks)); });
    req.on("error", reject);
  });
}

function safeImageName(name) {
  let n = String(name || "image").trim();
  n = n.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "-");
  const m = /\.([A-Za-z0-9]+)$/.exec(n);
  const ext = m ? m[1].toLowerCase() : "";
  if (IMG_EXT.indexOf(ext) < 0) throw new Error("不支持的图片格式：" + (ext || "未知") + "（支持 " + IMG_EXT.join("/") + "）");
  let base = n.replace(/\.[A-Za-z0-9]+$/, "").replace(/[^A-Za-z0-9\u4e00-\u9fa5_-]/g, "") || "image";
  if (base.length > 60) base = base.slice(0, 60);
  return { base: base, ext: ext };
}

function saveUpload(rel, filename, buf) {
  if (!buf || !buf.length) throw new Error("没有收到图片数据");
  const newRel = ensureBundle(rel);
  const info = articleDir(newRel);
  const p = safeImageName(filename);
  let fname = p.base + "." + p.ext;
  let i = 1;
  while (fs.existsSync(path.join(info.dir, fname))) { fname = p.base + "-" + i + "." + p.ext; i++; }
  const target = path.join(info.dir, fname);
  fs.writeFileSync(target, buf);
  return {
    file: fname,
    rel: path.relative(ROOT, target).replace(/\\/g, "/"),
    size: buf.length,
    article: newRel,
    converted: newRel !== rel,
  };
}

function listImages(rel) {
  const info = articleDir(rel);
  if (!info.bundle) return [];
  return fs.readdirSync(info.dir)
    .filter(function (n) { return new RegExp("\\.(" + IMG_EXT.join("|") + ")$", "i").test(n); })
    .map(function (n) {
      const full = path.join(info.dir, n);
      return {
        name: n,
        rel: path.relative(ROOT, full).replace(/\\/g, "/"),
        size: fs.statSync(full).size,
      };
    });
}

function deleteImage(rel) {
  const abs = safeRel(rel);
  if (!abs.startsWith(CONTENT + path.sep)) throw new Error("只能删除文章目录里的图片");
  const info = articleDir(path.join(path.dirname(abs), "index.md"));
  if (path.dirname(abs) !== info.dir) throw new Error("只能删除文章自己目录里的图片");
  if (!fs.existsSync(abs)) throw new Error("图片不存在");
  fs.unlinkSync(abs);
  return { deleted: rel };
}

/* ============ 端口被占用时的友好处理 ============ */
function pingSelf() {
  return new Promise(function (resolve) {
    const req = http.get({ host: "127.0.0.1", port: PORT, path: "/api/overview", timeout: 2000 }, function (res) {
      let d = "";
      res.on("data", function (c) { d += c; });
      res.on("end", function () {
        try { resolve(Array.isArray(JSON.parse(d).sections)); } catch (e) { resolve(false); }
      });
    });
    req.on("error", function () { resolve(false); });
    req.on("timeout", function () { req.destroy(); resolve(false); });
  });
}

server.on("error", async function (e) {
  if (e.code === "EADDRINUSE") {
    const mine = await pingSelf();
    console.log("");
    if (mine) {
      console.log("  管理后台已经在运行了，正在为你打开浏览器…");
      console.log("  地址   " + ADMIN_URL);
      console.log("");
      console.log("  想重启：先关掉原来那个黑色窗口，或用「停止博客.bat」。");
      if (process.argv.indexOf("--open") >= 0) openBrowser(ADMIN_URL);
      setTimeout(function () { process.exit(0); }, 1500);
      return;
    }
    console.log("  [X] 端口 " + PORT + " 被别的程序占用了。");
    console.log("      换个端口：在「管理博客.bat」里改成  set BLOG_ADMIN_PORT=1415  再运行。");
    console.log("");
    process.exit(1);
  }
  console.error(e);
  process.exit(1);
});

/* ============ 标签管理 ============ */
function tagSlug(t) {
  return String(t).trim().toLowerCase().replace(/\s+/g, "-").replace(/[\\/:*?"<>|#%{}^~`\[\];,]/g, "");
}

function listTags() {
  const map = {};
  listPosts().forEach(function (p) {
    (p.tags || []).forEach(function (t) {
      const name = String(t).trim();
      if (!name) return;
      if (!map[name]) map[name] = { name: name, slug: tagSlug(name), count: 0, description: "" };
      map[name].count++;
    });
  });
  Object.keys(map).forEach(function (k) {
    const f = path.join(CONTENT, "tags", map[k].slug, "_index.md");
    if (!fs.existsSync(f)) return;
    const doc = splitDoc(fs.readFileSync(f, "utf8"));
    const lines = doc.front.split(/\r?\n/);
    map[k].description = (readScalar(lines, "description") || doc.body.trim() || "");
  });
  return Object.keys(map).map(function (k) { return map[k]; })
    .sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); });
}

function saveTag(input) {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("缺少标签名");
  const slug = tagSlug(name);
  if (!slug) throw new Error("这个标签名没法生成网址标识");
  const desc = String(input.description || "").trim();
  const dir = path.join(CONTENT, "tags", slug);
  fs.mkdirSync(dir, { recursive: true });
  // description 供搜索引擎读，正文供标签页显示
  const out = "---\n" + "title: " + yamlStr(name) + "\n" + "description: " + yamlStr(desc) + "\n---\n\n" + (desc ? desc + "\n" : "");
  fs.writeFileSync(path.join(dir, "_index.md"), out, "utf8");
  return { name: name, slug: slug, path: path.relative(ROOT, path.join(dir, "_index.md")).replace(/\\/g, "/") };
}
