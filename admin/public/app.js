"use strict";
/* ============ 基础工具 ============ */
const $ = function (s) { return document.querySelector(s); };

const api = {
  get: async function (p) {
    const r = await fetch(p);
    const d = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(d.error || ("HTTP " + r.status));
    return d;
  },
  post: async function (p, body) {
    const r = await fetch(p, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const d = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(d.error || ("HTTP " + r.status));
    return d;
  },
};

let STATE = { sections: [], posts: [], preview: {}, git: {}, settings: {}, filter: "" };

function toast(msg, kind) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast show" + (kind ? " " + kind : "");
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { t.className = "toast"; }, 2800);
}
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function modal(html) { $("#modalBox").innerHTML = html; $("#modal").classList.add("show"); }
function closeModal() { $("#modal").classList.remove("show"); $("#modalBox").innerHTML = ""; }

/* ============ 极简 Markdown 预览（近似效果；精确排版请看 Hugo 预览页）============ */
function md(src) {
  const blocks = [];
  let s = esc(src || "");
  s = s.replace(/\{\{[<%][\s\S]*?[>%]\}\}/g, "");
  s = s.replace(/```[a-z]*\n([\s\S]*?)```/g, function (m, code) {
    blocks.push("<pre><code>" + code + "</code></pre>");
    return "\u0001" + (blocks.length - 1) + "\u0001";
  });
  // 用 \s* 而不是空格，这样 ##标题（漏空格）在预览里也能正确显示标题样式
  s = s.replace(/^####\s*(.*)$/gm, "<h4>$1</h4>")
       .replace(/^###\s*(.*)$/gm, "<h3>$1</h3>")
       .replace(/^##\s*(.*)$/gm, "<h2>$1</h2>")
       .replace(/^#\s*(.*)$/gm, "<h1>$1</h1>");
  s = s.replace(/^&gt; ?(.*)$/gm, "<blockquote>$1</blockquote>");
  s = s.replace(/^\s*(?:---|\*\*\*)\s*$/gm, "<hr>");
  s = s.replace(/^\s*[-*] (.*)$/gm, "<li>$1</li>");
  s = s.replace(/(?:^|\n)((?:<li>[\s\S]*?<\/li>\n?)+)/g, function (m, g) { return "\n<ul>" + g + "</ul>\n"; });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
       .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
       .replace(/`([^`\n]+)`/g, "<code>$1</code>")
       .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">')
       .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.split(/\n{2,}/).map(function (p) {
    const t = p.trim();
    if (/^\u0001\d+\u0001$/.test(t)) return t;
    if (/^<(h\d|ul|pre|blockquote|hr)/.test(t)) return p;
    return "<p>" + t.replace(/\n/g, "<br>") + "</p>";
  }).join("\n");
  return s.replace(/\u0001(\d+)\u0001/g, function (m, i) { return blocks[i]; });
}

/* ============ 数据刷新与侧栏 ============ */
async function refresh() {
  const d = await api.get("/api/overview");
  STATE.sections = d.sections;
  STATE.posts = d.posts;
  STATE.preview = d.preview;
  STATE.git = d.git;
  STATE.settings = d.settings;
  STATE.root = d.root;
  renderSidebar();
  renderTopbar();
  // 编辑/设置视图下只刷新侧栏，不重绘主体（否则会把编辑器 DOM 冲掉）
  if (STATE.view === "list") renderList();
}

function renderSidebar() {
  const ul = $("#sectionList");
  let html = '<li data-sec="" class="' + (STATE.filter === "" ? "active" : "") + '">全部文章' +
    '<span class="cnt">' + STATE.posts.length + "</span></li>";
  STATE.sections.forEach(function (s) {
    const badge = s.published + (s.drafts ? " +" + s.drafts + "草" : "");
    html += '<li data-sec="' + esc(s.name) + '" class="' + (STATE.filter === s.name ? "active" : "") + '">' +
      '<span class="sec-name">' + esc(s.title) + '</span>' +
      '<span class="cnt">' + badge + '</span>' +
      '<b class="sec-edit" data-edit="' + esc(s.name) + '" title="编辑 / 删除这个板块">…</b></li>';
  });
  ul.innerHTML = html;
  Array.prototype.forEach.call(ul.querySelectorAll("li"), function (li) {
    li.onclick = function () {
      STATE.filter = li.getAttribute("data-sec");
      STATE.editing = null;
      renderSidebar();
      renderTopbar();
      renderList();
    };
  });
  Array.prototype.forEach.call(ul.querySelectorAll("[data-edit]"), function (b) {
    b.onclick = function (ev) {
      ev.stopPropagation();
      editSectionDialog(b.getAttribute("data-edit"));
    };
  });
  $("#sideFoot").textContent = STATE.git.changes > 0
    ? STATE.git.changes + " 个文件待发布"
    : "没有未发布的改动";
}

function renderTopbar() {
  const b = $("#gitBadge");
  if (STATE.git.changes > 0) {
    b.className = "badge warn";
    b.textContent = "待发布 " + STATE.git.changes;
  } else {
    b.className = "badge ok";
    b.textContent = "已同步";
  }
  let title = "全部文章";
  if (STATE.editing) title = "编辑文章";
  else if (STATE.filter) {
    const s = STATE.sections.filter(function (x) { return x.name === STATE.filter; })[0];
    if (s) title = s.title;
  }
  $("#viewTitle").textContent = title;
  $("#btnTogglePreview").textContent = STATE.preview.running ? "⏹ 停止预览" : "▶️ 启动预览";
}

/* ============ 文章列表 ============ */
function renderList() {
  STATE.view = "list";
  const secs = STATE.sections.filter(function (s) { return !STATE.filter || s.name === STATE.filter; });
  let html = "";
  secs.forEach(function (s) {
    const list = STATE.posts.filter(function (p) { return p.section === s.name; });
    html += '<div class="group"><div class="group-head"><h2>' + esc(s.title) + '</h2><span class="n">' + list.length + " 篇</span></div>";
    if (!list.length) {
      html += '<div class="empty">这个板块还没有文章</div>';
    }
    list.forEach(function (p) {
      const tags = p.tags.slice(0, 3).map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("");
      html += '<div class="post" data-path="' + esc(p.path) + '" data-section="' + esc(p.section) + '">' +
        ((p.isPrivate
            ? '<span class="badge lock">🔒 仅本地</span>'
            : '<span class="badge ' + (p.draft ? "warn" : "ok") + '">' + (p.draft ? "草稿" : "已发布") + "</span>")) +
        '<span class="t">' + esc(p.title) + "</span>" +
        '<span class="tags">' + tags + "</span>" +
        '<span class="d">' + esc(p.date) + "</span></div>";
    });
    html += "</div>";
  });
  $("#view").innerHTML = html || '<div class="empty">还没有文章，点左侧「写新文章」开始</div>';
  Array.prototype.forEach.call(document.querySelectorAll(".post"), function (el) {
    el.onclick = function () {
      openEditor(el.getAttribute("data-path"), el.getAttribute("data-section"));
    };
  });
}

/* ============ 编辑器 ============ */
async function openEditor(path, section) {
  let d;
  try {
    d = await api.get("/api/post?path=" + encodeURIComponent(path) + "&section=" + encodeURIComponent(section));
  } catch (e) { toast("打开失败：" + e.message, "err"); return; }
  const p = d.post;
  const body = d.raw.replace(/^(?:---|\+\+\+)\r?\n[\s\S]*?\r?\n(?:---|\+\+\+)\r?\n?/, "");
  STATE.editing = path;
  STATE.view = "edit";
  STATE.editingSection = section;
  STATE.editingLiveURL = d.liveURL || "";
  STATE.editingDraft = !!p.draft;
  renderTopbar();

  const secOpts = STATE.sections.map(function (s) {
    return '<option value="' + esc(s.name) + '"' + (s.name === p.section ? " selected" : "") + ">" + esc(s.title) + "</option>";
  }).join("");

  $("#view").innerHTML =
    '<div class="editor">' +
      '<div class="draft-banner" id="draftBanner" style="display:' + (p.draft ? "" : "none") + '">' +
        '📝 这篇还是 <b>草稿</b>，<b>网站上不会出现</b>。要公开就取消下面「草稿（网站不显示）」的勾选，保存后点右上角「⬆️ 上传改动」。' +
      "</div>" +
      '<div class="row">' +
        '<div class="field" style="flex:3"><label>标题</label><input id="fTitle" type="text" value="' + esc(p.title) + '"></div>' +
        '<div class="field" style="flex:.8"><label>板块</label><select id="fSection">' + secOpts + "</select></div>" +
        '<div class="field" style="flex:.8"><label>日期</label><input id="fDate" type="date" value="' + esc(p.date) + '"></div>' +
      "</div>" +
      '<div class="row"><div class="field"><label>描述（列表和搜索里的摘要）</label><input id="fDesc" type="text" value="' + esc(p.description) + '"></div></div>' +
      '<div class="row">' +
        '<div class="field"><label>标签（逗号或分号分隔，自动拆成多个）</label><input id="fTags" type="text" value="' + esc(p.tags.join(", ")) + '"></div>' +
        '<div class="field"><label>分类（= 板块，自动跟随）</label><input type="text" value="' + esc(sectionTitleOf(p.section)) + '" disabled></div>' +
        '<div class="field" style="flex:0 0 auto"><label>&nbsp;</label>' +
          '<div class="switch"><input id="fDraft" type="checkbox"' + (p.draft ? " checked" : "") + '><span>草稿（网站不显示）</span></div></div>' +
        '<div class="field" style="flex:0 0 auto"><label>&nbsp;</label>' +
          '<div class="switch"><input id="fPrivate" type="checkbox"' + (p.isPrivate ? " checked" : "") + '><span>🔒 仅本地（不上传 GitHub）</span></div></div>' +
      "</div>" +
      '<p class="hint" style="margin:-4px 0 2px">「草稿」= 网站上看不到，但文件仍会上传到 GitHub；「🔒 仅本地」= 连 GitHub 都不上传，只有你本机有。</p>' +
      '<div class="img-bar">' +
        '<button class="btn" id="btnUpload">🖼 上传图片</button>' +
        '<input type="file" id="fileInput" accept="image/*" multiple style="display:none">' +
        '<span class="hint">也可以把图片直接拖进下面的输入框，或用 Ctrl+V 粘贴</span>' +
      "</div>" +
      '<div id="imgList" class="img-list"></div>' +
      '<div class="row"><div class="field"><label>正文（Markdown）　<button class="btn" id="btnToggleMd" style="padding:2px 10px;font-size:12px">👁 预览</button></label>' +
        '<textarea id="fBody" class="body"></textarea></div></div>' +
      '<div class="preview-pane" id="previewPane" style="display:none"></div>' +
      '<div class="editor-actions">' +
        '<button class="btn primary" id="btnSave">💾 保存</button>' +
        '<button class="btn" id="btnSaveOpen">保存并看真效果</button>' +
        '<button class="btn" id="btnLive">🔗 打开线上页面</button>' +
        '<span class="spacer"></span>' +
        '<button class="btn danger" id="btnDelete">🗑 删除这篇文章</button>' +
      "</div>" +
    "</div>";
  $("#fBody").value = body.replace(/^\s*\n+/, "").trim();
  wireEditor();
}

function commaList(v) {
  return String(v || "").split(/[,，;；、|]/).map(function (s) { return s.trim(); }).filter(Boolean);
}
/* 标签：逗号/分号/顿号都能分隔；去重 */
function tagList(v) {
  const out = [];
  commaList(v).forEach(function (t) { if (out.indexOf(t) === -1) out.push(t); });
  return out;
}
/* 板块 key -> 显示名（分类用） */
function sectionTitleOf(name) {
  const hit = (STATE.sections || []).filter(function (s) { return s.name === name; })[0];
  return hit ? hit.title : (name || "");
}
function slugOf(p) {
  const a = String(p).split("/");
  return a[a.length - 1] === "index.md" ? a[a.length - 2] : a[a.length - 1].replace(/\.md$/, "");
}
function collectEditor() {
  // 编辑器不在页面上时（已切到列表/设置页）返回 null，由调用方兜底。
  // 否则读 null.value 会抛 "Cannot read properties of null (reading 'value')"
  const el = function (id) { return document.getElementById(id); };
  const t = el("fTitle"), d = el("fDate"), dr = el("fDraft"), pv = el("fPrivate");
  const ds = el("fDesc"), tg = el("fTags"), bd = el("fBody"), secSel = el("fSection");
  if (!t || !d || !dr || !pv || !ds || !tg || !bd) return null;
  return {
    path: STATE.editing,
    section: secSel ? secSel.value : "",
    title: t.value.trim(),
    date: d.value,
    draft: dr.checked,
    isPrivate: pv.checked,
    description: ds.value.trim(),
    tags: tagList(tg.value),
    body: bd.value,
  };
}

function wireEditor() {
  $("#btnToggleMd").onclick = function () {
    const pane = $("#previewPane");
    if (pane.style.display === "none") {
      pane.innerHTML = md($("#fBody").value);
      pane.style.display = "block";
      this.textContent = "🙈 收起预览";
    } else {
      pane.style.display = "none";
      this.textContent = "👁 预览";
    }
  };
  $("#btnSave").onclick = function () { saveEditor(false); };
  $("#btnSaveOpen").onclick = function () { saveEditor(true); };
  const draftBox = $("#fDraft");
  if (draftBox) {
    draftBox.onchange = function () {
      const b = $("#draftBanner");
      if (b) b.style.display = this.checked ? "" : "none";
    };
  }
  $("#btnDelete").onclick = function () { delPost(); };
  const liveBtn = $("#btnLive");
  if (liveBtn) {
    liveBtn.title = STATE.editingLiveURL || "";
    liveBtn.onclick = function () {
      if (!STATE.editingLiveURL) { toast("没算出线上地址，请检查 hugo.toml 里的 baseURL", "err"); return; }
      const dirty = (STATE.git && STATE.git.changes) ? STATE.git.changes : 0;
      if (dirty > 0) {
        toast("本地还有 " + dirty + " 个改动没上传，线上还是旧版本。请先点右上角「⬆️ 上传改动」，等 1 分钟后再看。", "err");
        return;
      }
      if ($("#fDraft") && $("#fDraft").checked) {
        toast("这篇还是草稿，线上还没有它。取消勾选「草稿」并上传后再看。", "err");
        return;
      }
      window.open(STATE.editingLiveURL, "_blank");
    };
  }

  /* ---- 图片上传：按钮 / 拖拽 / 粘贴 ---- */
  const ta = $("#fBody");
  const pick = function (files) {
    const imgs = Array.prototype.slice.call(files).filter(function (f) { return /^image\//.test(f.type); });
    if (imgs.length) uploadFiles(imgs);
  };
  $("#btnUpload").onclick = function () { $("#fileInput").click(); };
  $("#fileInput").onchange = function () { pick(this.files); this.value = ""; };
  ta.addEventListener("dragover", function (e) { e.preventDefault(); ta.classList.add("dragging"); });
  ta.addEventListener("dragleave", function () { ta.classList.remove("dragging"); });
  ta.addEventListener("drop", function (e) {
    e.preventDefault(); ta.classList.remove("dragging");
    pick(e.dataTransfer && e.dataTransfer.files);
  });
  ta.addEventListener("paste", function (e) {
    const it = e.clipboardData && e.clipboardData.items;
    if (!it) return;
    const out = new DataTransfer();
    for (let i = 0; i < it.length; i++) {
      if (it[i].type.indexOf("image") !== 0) continue;
      const f = it[i].getAsFile();
      if (!f) continue;
      f.name = "pasted-" + Date.now() + "." + (f.type.split("/")[1] || "png");
      out.items.add(f);
    }
    if (out.files.length) { e.preventDefault(); pick(out.files); }
  });
  loadImages();
  document.onkeydown = function (e) {
    if (!(e.ctrlKey || e.metaKey) || !(e.key === "s" || e.key === "S")) return;
    // 只有确实在编辑文章时才接管 Ctrl+S；否则放行给浏览器，避免在列表/设置页报错
    if (STATE.view !== "edit" || !STATE.editing || !document.getElementById("fTitle")) return;
    e.preventDefault();
    saveEditor(false);
  };
}

async function saveEditor(openAfter) {
  // 兜底：Ctrl+S 是全局绑定，可能在非编辑器页面被触发
  if (STATE.view !== "edit" || !STATE.editing) { toast("当前没有打开的文章", "err"); return; }
  const data = collectEditor();
  if (!data) { toast("编辑界面已失效，请重新打开这篇文章", "err"); return; }
  if (!data.title) { toast("标题不能为空", "err"); return; }

  // 关键：先把板块名取出来。refresh() 之后如果视图被重绘，$("#fSection") 就没了
  const keep = STATE.editing;
  const sec = $("#fSection") ? $("#fSection").value : "";
  const btn = $("#btnSave");
  if (btn) btn.disabled = true;
  try {
    const res = await api.post("/api/post", data);
    // 板块变了的话，文件已经搬到新目录，后续保存/删除要跟着换路径
    if (res && res.path) {
      STATE.editing = res.path;
      STATE.editingSection = data.section || STATE.editingSection;
    }
    if (res && res.liveURL) {
      STATE.editingLiveURL = res.liveURL;
      const liveBtn = document.getElementById("btnLive");
      if (liveBtn) liveBtn.title = res.liveURL;
    }
    toast(res && res.moved ? ("已保存，并移动到「" + sectionTitleOf(data.section) + "」") : "已保存", "ok");
    await refresh();   // 只刷新侧栏计数，不重绘编辑器，避免光标跳走
    if (openAfter) {
      const purl = await ensurePreview();
      if (purl) {
        const finalPath = (res && res.path) ? res.path : keep;
        const finalSec = (data.section || sec || "");
        const target = purl.replace(/\/+$/, "") + "/" + finalSec + "/" + encodeURIComponent(slugOf(finalPath)) + "/";
        window.open(target, "_blank");
      }
    }
  } catch (e) {
    toast("保存失败：" + e.message, "err");
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function delPost() {
  if (!confirm("把这篇文章移入回收站？\n\n" + STATE.editing + "\n\n（可以在「设置 → 回收站」里还原）")) return;
  const p = STATE.editing;
  try {
    await api.post("/api/post/delete", { path: p });
    toast("已删除", "ok");
    STATE.editing = null;
    STATE.view = "list";
    await refresh();
  } catch (e) { toast("删除失败：" + e.message, "err"); }
}

/* ============ 预览开关 ============ */
async function togglePreview() {
  try {
    const d = STATE.preview.running
      ? await api.post("/api/preview/stop")
      : await api.post("/api/preview/start");
    STATE.preview = d;
    renderTopbar();
    toast(d.running ? "预览已启动：http://localhost:1313/" : "预览已停止", "ok");
  } catch (e) { toast("操作失败：" + e.message, "err"); }
}
async function ensurePreview() {
  if (STATE.preview && STATE.preview.running && STATE.preview.url) return STATE.preview.url;
  try {
    STATE.preview = await api.post("/api/preview/start");
    renderTopbar();
    return (STATE.preview && STATE.preview.url) || "";
  } catch (e) {
    toast("预览启动失败：" + e.message, "err");
    return "";
  }
}

/* ============ 新建文章 ============ */
function newPostDialog() {
  if (!STATE.sections.length) { toast("还没有板块，先点左侧「新建板块」", "err"); return; }
  const opts = STATE.sections.map(function (s) {
    return '<option value="' + esc(s.name) + '">' + esc(s.title) + "</option>";
  }).join("");
  modal(
    "<h3>✏️ 写新文章</h3>" +
    '<div class="field"><label>标题</label><input id="npTitle" type="text" placeholder="例如：读《人类简史》"></div>' +
    '<div class="row" style="margin-top:12px">' +
      '<div class="field"><label>放进哪个板块</label><select id="npSection">' + opts + "</select></div>" +
      '<div class="field"><label>网址标识（可留空）</label><input id="npSlug" type="text" placeholder="read-sapiens"></div>' +
    "</div>" +
    '<p class="hint" style="margin-top:14px">新文章默认是<b>草稿</b>，不会出现在线上。在编辑器里取消勾选「草稿」才会发布。<br>网址标识只影响 URL，留空就用标题生成。</p>' +
    '<div class="modal-actions"><button class="btn" id="npCancel">取消</button><button class="btn primary" id="npOk">创建</button></div>'
  );
  $("#npTitle").focus();
  $("#npCancel").onclick = closeModal;
  $("#npOk").onclick = async function () {
    const title = $("#npTitle").value.trim();
    const section = $("#npSection").value;
    const slug = $("#npSlug").value.trim();
    if (!title) { toast("请先填标题", "err"); return; }
    try {
      const r = await api.post("/api/post/create", { title: title, section: section, slug: slug });
      closeModal();
      toast("草稿已创建", "ok");
      STATE.filter = section;
      await refresh();
      openEditor(r.path, section);
    } catch (e) { toast("创建失败：" + e.message, "err"); }
  };
}

/* ============ 编辑 / 删除板块 ============ */
function editSectionDialog(name) {
  const s = STATE.sections.filter(function (x) { return x.name === name; })[0];
  if (!s) { toast("找不到这个板块", "err"); return; }
  modal(
    "<h3>编辑板块</h3>" +
    '<div class="field"><label>名称（显示在导航上）</label><input id="esTitle" type="text" value="' + esc(s.title) + '"></div>' +
    '<div class="field" style="margin-top:12px"><label>网址标识（不可修改）</label><input id="esName" type="text" value="' + esc(s.name) + '" disabled></div>' +
    '<div class="field" style="margin-top:12px"><label>排序（数字越小越靠前）</label><input id="esWeight" type="text" value="' + (s.weight || 100) + '"></div>' +
    '<div class="field" style="margin-top:12px"><label>板块简述（显示在板块页顶部）</label><textarea id="esDesc" style="min-height:80px">' + esc(s.description || "") + "</textarea></div>" +
    '<p class="hint" style="margin-top:12px">网址标识不可改：改了会让这个板块下所有已发布文章的链接失效。<br>当前 ' +
      (s.published + s.drafts) + " 篇文章，要删除板块需先清空它们。</p>" +
    '<div class="modal-actions">' +
      '<button class="btn danger" id="esDel">删除板块</button>' +
      '<button class="btn" id="esCancel">取消</button>' +
      '<button class="btn primary" id="esOk">保存</button>' +
    "</div>"
  );
  $("#esCancel").onclick = closeModal;
  $("#esOk").onclick = async function () {
    try {
      await api.post("/api/section", {
        original: name, name: name,
        title: $("#esTitle").value.trim(),
        weight: Number($("#esWeight").value) || 100,
        description: $("#esDesc").value.trim(),
      });
      closeModal();
      toast("板块已更新", "ok");
      await refresh();
    } catch (e) { toast("保存失败：" + e.message, "err"); }
  };
  $("#esDel").onclick = async function () {
    if (!confirm("删除板块「" + s.title + "」？\n\n会从 content/ 里移除这个板块目录，不可撤销。")) return;
    try {
      await api.post("/api/section/delete", { name: name });
      closeModal();
      toast("板块已删除", "ok");
      if (STATE.filter === name) STATE.filter = "";
      await refresh();
    } catch (e) { toast("删除失败：" + e.message, "err"); }
  };
}

/* ============ 新建板块 ============ */
function newSectionDialog() {
  modal(
    "<h3>➕ 新建板块</h3>" +
    '<div class="row">' +
      '<div class="field"><label>名称（显示在导航上，可中文）</label><input id="nsTitle" type="text" placeholder="影评"></div>' +
      '<div class="field"><label>标识（网址用，小写英文）</label><input id="nsName" type="text" placeholder="movie"></div>' +
    "</div>" +
    '<div class="field" style="margin-top:12px"><label>描述（可留空）</label><input id="nsDesc" type="text"></div>' +
    '<div class="field" style="margin-top:12px"><label>排序（数字越小越靠前）</label><input id="nsWeight" type="text" value="50"></div>' +
    '<p class="hint" style="margin-top:14px">创建后写入 <code>content/&lt;标识&gt;/_index.md</code>，并自动刷新顶部导航菜单。</p>' +
    '<div class="modal-actions"><button class="btn" id="nsCancel">取消</button><button class="btn primary" id="nsOk">创建</button></div>'
  );
  $("#nsTitle").focus();
  $("#nsCancel").onclick = closeModal;
  $("#nsOk").onclick = async function () {
    const body = {
      title: $("#nsTitle").value.trim(),
      name: $("#nsName").value.trim().toLowerCase(),
      description: $("#nsDesc").value.trim(),
      weight: Number($("#nsWeight").value) || 50,
    };
    if (!body.name) { toast("请填写板块标识", "err"); return; }
    try {
      await api.post("/api/section", body);
      closeModal();
      toast("板块已创建", "ok");
      STATE.filter = body.name;
      await refresh();
    } catch (e) { toast("创建失败：" + e.message, "err"); }
  };
}

/* ============ 一键发布到线上 ============ */
async function doPublish() {
  if (STATE.git.changes === 0) { toast("没有需要发布的改动", "ok"); return; }
  const drafts = STATE.posts.filter(function (p) { return p.draft; });
  let msg = "把 " + STATE.git.changes + " 个文件的改动上传到 GitHub？\n\n上传后网站会自动更新。";
  if (drafts.length) {
    msg += "\n\n⚠️ 有 " + drafts.length + " 篇草稿不会出现在网站上：\n" +
      drafts.slice(0, 5).map(function (p) { return "· " + p.title; }).join("\n") +
      (drafts.length > 5 ? "\n…" : "") +
      "\n\n想让某篇公开，打开它取消勾选「草稿」后再上传。";
  }
  if (!confirm(msg)) return;
  const btn = $("#btnPublish");
  btn.disabled = true;
  btn.textContent = "发布中…";
  try {
    const r = await api.post("/api/publish", { message: (STATE.settings.publish || {}).message || "更新文章" });
    modal(
      "<h3>" + (r.ok ? "✅ 发布完成" : "⚠️ 发布未成功") + "</h3>" +
      (r.privateCount ? '<p class="hint">🔒 有 ' + r.privateCount + ' 篇「仅本地」文章已跳过，不会上传到 GitHub。</p>' : "") +
      "<pre style='white-space:pre-wrap;font-size:12px;background:var(--bg);padding:12px;border-radius:8px;max-height:44vh;overflow:auto'>" + esc(r.out) + "</pre>" +
      '<div class="modal-actions"><button class="btn primary" id="pubOk">知道了</button></div>'
    );
    $("#pubOk").onclick = closeModal;
    await refresh();
  } catch (e) { toast("发布失败：" + e.message, "err"); }
  btn.disabled = false;
  btn.textContent = "🚀 发布到线上";
}

/* ============ 标签管理 ============ */
async function showTags() {
  let d;
  try { d = await api.get("/api/tags"); }
  catch (e) { toast("读取标签失败：" + e.message, "err"); return; }

  const rows = d.items.length
    ? d.items.map(function (t) {
        return '<div class="tag-row">' +
          '<div class="tag-head">' +
            '<span class="tag">' + esc(t.name) + "</span>" +
            '<span class="hint">' + t.count + " 篇 · /tags/" + esc(t.slug) + "/</span>" +
          "</div>" +
          '<input type="text" data-tag="' + esc(t.name) + '" value="' + esc(t.description) +
            '" placeholder="给这个标签写一句简述（显示在标签页顶部）">' +
        "</div>";
      }).join("")
    : '<div class="empty">还没有任何标签。在文章编辑器的「标签」里填上标签并保存后，这里就会自动出现。</div>';

  modal(
    "<h3>🏷️ 标签管理</h3>" +
    '<p class="hint">简述会写进 <code>content/tags/&lt;标签&gt;/_index.md</code>，显示在该标签页面顶部，同时供搜索引擎使用。' +
    "标签本身不需要手工创建——你在文章里填了什么标签，这里就有什么。</p>" +
    '<div style="margin-top:14px;max-height:52vh;overflow:auto">' + rows + "</div>" +
    '<div class="modal-actions"><button class="btn" id="tgCancel">关闭</button>' +
      '<button class="btn primary" id="tgSave">保存全部</button></div>'
  );
  $("#tgCancel").onclick = closeModal;
  $("#tgSave").onclick = async function () {
    const inputs = document.querySelectorAll("[data-tag]");
    let ok = 0, fail = 0;
    for (let i = 0; i < inputs.length; i++) {
      try {
        await api.post("/api/tag", { name: inputs[i].getAttribute("data-tag"), description: inputs[i].value.trim() });
        ok++;
      } catch (e) { fail++; }
    }
    toast(fail ? ("已保存 " + ok + " 个，失败 " + fail + " 个") : ("已保存 " + ok + " 个标签"), fail ? "err" : "ok");
    closeModal();
  };
}

/* ============ 设置 ============ */
function showSettings() {
  STATE.view = "settings";
  renderTopbar();
  const g = STATE.settings.github || {};
  const pub = STATE.settings.publish || {};
  $("#viewTitle").textContent = "设置";
  $("#view").innerHTML =
    '<div class="editor" style="max-width:660px">' +
      '<h3 style="font-size:15px">🚀 发布到线上</h3>' +
      '<p class="hint">「发布到线上」实际执行的是 <code>git add -A</code> → <code>git commit</code> → <code>git push</code>。<br>' +
      '推送成功后 GitHub 会自动构建并更新网站（约 1 分钟）。前提是本地已经配好 git 身份和远端仓库。</p>' +
      '<div class="field" style="max-width:320px"><label>提交信息</label>' +
        '<input id="stMsg" type="text" value="' + esc(pub.message || "更新文章") + '"></div>' +
      '<hr style="border:none;border-top:1px solid var(--line);margin:24px 0">' +
      '<h3 style="font-size:15px">🔗 GitHub 接口（预留）</h3>' +
      '<p class="hint">这三项是给后期扩展留的：填好之后，就可以在此之上做「不依赖本地 git、直接调用 GitHub API 提交」、' +
      '「查看最近一次部署状态」等能力。现在留空完全不影响使用。</p>' +
      '<div class="row">' +
        '<div class="field" style="flex:2"><label>仓库</label><input id="stRepo" type="text" value="' + esc(g.repo || "") + '" placeholder="owner/repo"></div>' +
        '<div class="field"><label>分支</label><input id="stBranch" type="text" value="' + esc(g.branch || "main") + '"></div>' +
      "</div>" +
      '<div class="field" style="margin-top:12px"><label>Personal Access Token（只存在本机 admin/settings.json，已被 .gitignore 排除）</label>' +
        '<input id="stToken" type="password" value="' + esc(g.token || "") + '" placeholder="ghp_xxxxxxxx"></div>' +
      '<hr style="border:none;border-top:1px solid var(--line);margin:24px 0">' +
      '<h3 style="font-size:15px">🗑 回收站</h3>' +
      '<p class="hint">删除的文章会先放到这里（本机 <code>.trash</code> 目录），不会真的消失。确认不要了再清空。</p>' +
      '<div id="trashBox" style="margin-top:10px"></div>' +
      '<div style="margin-top:12px"><button class="btn danger" id="stPurge">清空回收站</button></div>' +
      '<div class="editor-actions" style="border:none">' +
        '<button class="btn primary" id="stSave">保存设置</button>' +
        '<button class="btn" id="stBack">返回文章列表</button>' +
      "</div>" +
    "</div>";
  $("#stSave").onclick = async function () {
    try {
      await api.post("/api/settings", {
        github: { repo: $("#stRepo").value.trim(), branch: $("#stBranch").value.trim(), token: $("#stToken").value.trim() },
        publish: { message: $("#stMsg").value.trim() },
      });
      toast("设置已保存", "ok");
      await refresh();
      showSettings();
    } catch (e) { toast("保存失败：" + e.message, "err"); }
  };
  $("#stBack").onclick = function () { STATE.view = "list"; refresh(); };
  $("#stPurge").onclick = async function () {
    if (!confirm("确定永久删除回收站里的全部内容吗？此操作不可恢复。")) return;
    try { await api.post("/api/trash/purge"); toast("回收站已清空", "ok"); showSettings(); }
    catch (e) { toast("清空失败：" + e.message, "err"); }
  };
  renderTrash();
}

/* ============ 启动 ============ */
function boot() {
  STATE.view = "list";
  $("#btnNewPost").onclick = newPostDialog;
  $("#btnNewSection").onclick = newSectionDialog;
  $("#btnTogglePreview").onclick = togglePreview;
  $("#btnTags").onclick = showTags;
  $("#btnSettings").onclick = showSettings;
  $("#btnPublish").onclick = doPublish;
  $("#btnOpenSite").onclick = function () {
    if (!STATE.preview.running) { toast("预览还没启动，先点「启动预览」", "err"); return; }
    window.open("http://localhost:1313/", "_blank");
  };
  $("#modal").onclick = function (e) { if (e.target && e.target.id === "modal") closeModal(); };
  refresh().catch(function (e) { toast("加载失败：" + e.message, "err"); });
  setInterval(function () {
    if (STATE.view === "list") refresh().catch(function () { });
  }, 15000);
}
boot();

/* ============ 回收站面板 ============ */
async function renderTrash() {
  const box = $("#trashBox");
  if (!box) return;
  try {
    const d = await api.get("/api/trash");
    if (!d.items.length) { box.innerHTML = '<div class="empty">回收站是空的</div>'; return; }
    box.innerHTML = d.items.map(function (it) {
      return '<div class="post" style="cursor:default">' +
        '<span class="t">' + esc(it.original) + "</span>" +
        '<span class="d">' + esc(it.time) + "</span>" +
        '<button class="btn" data-restore="' + esc(it.id) + '">还原</button></div>';
    }).join("");
    Array.prototype.forEach.call(box.querySelectorAll("[data-restore]"), function (b) {
      b.onclick = async function () {
        try {
          await api.post("/api/trash/restore", { id: b.getAttribute("data-restore") });
          toast("已还原", "ok");
          await refresh();
          showSettings();
        } catch (e) { toast("还原失败：" + e.message, "err"); }
      };
    });
  } catch (e) { box.innerHTML = '<div class="empty">读取回收站失败</div>'; }
}

/* ============ 图片上传 ============ */
function insertAtCursor(ta, text) {
  const s = ta.selectionStart || 0, e = ta.selectionEnd || 0;
  ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
  ta.selectionStart = ta.selectionEnd = s + text.length;
  ta.focus();
}

async function uploadOne(file) {
  const url = "/api/upload?path=" + encodeURIComponent(STATE.editing) +
              "&name=" + encodeURIComponent(file.name || "pasted.png");
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: file,
  });
  const d = await r.json().catch(function () { return {}; });
  if (!r.ok) throw new Error(d.error || ("HTTP " + r.status));
  return d;
}

async function uploadFiles(files) {
  const ta = $("#fBody");
  if (!ta) return;
  let converted = false;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    try {
      toast("正在上传 " + f.name + " …");
      const d = await uploadOne(f);
      if (d.converted) converted = true;
      insertAtCursor(ta, "\n![](" + d.file + ")\n");
    } catch (e) {
      toast("上传失败：" + e.message, "err");
    }
  }
  if (converted) {
    toast("已自动转成页面包结构（网址不变），图片已放进文章目录", "ok");
    await refresh();
  } else {
    toast("图片已插入正文", "ok");
  }
  await loadImages();
}

async function loadImages() {
  const box = $("#imgList");
  if (!box || !STATE.editing) return;
  try {
    const d = await api.get("/api/images?path=" + encodeURIComponent(STATE.editing));
    if (!d.items.length) {
      box.innerHTML = '<span class="hint">这篇文章还没有配图</span>';
      return;
    }
    box.innerHTML = d.items.map(function (it) {
      return '<span class="img-chip" data-name="' + esc(it.name) + '" title="点击插入到正文">' +
        '<img src="/media?path=' + encodeURIComponent(it.rel) + '" alt="">' +
        '<span class="nm">' + esc(it.name) + "</span>" +
        '<b class="img-del" data-del="' + esc(it.rel) + '" title="删除这张图片">×</b></span>';
    }).join("");
    Array.prototype.forEach.call(box.querySelectorAll(".img-chip"), function (c) {
      c.onclick = function () {
        insertAtCursor($("#fBody"), "\n![](" + c.getAttribute("data-name") + ")\n");
        toast("已插入正文", "ok");
      };
    });
    // 每张图右上角的 × ：从文章目录里删掉这张图片
    Array.prototype.forEach.call(box.querySelectorAll(".img-del"), function (b) {
      b.onclick = async function (ev) {
        ev.stopPropagation();               // 别触发外面 chip 的"插入正文"
        const rel = b.getAttribute("data-del");
        if (!confirm("删除这张图片？\n\n" + rel + "\n\n注意：正文里对它的引用会失效，需要你自己删除那一行。")) return;
        try {
          await api.post("/api/image/delete", { path: rel });
          toast("图片已删除", "ok");
          await loadImages();
        } catch (e) {
          toast("删除失败：" + e.message, "err");
        }
      };
    });
  } catch (e) {
    box.innerHTML = '<span class="hint">读取图片列表失败</span>';
  }
}
