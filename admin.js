const TOKEN_KEY = "blog_gh_token";
const $ = id => document.getElementById(id);

$("siteTitle").textContent = CONFIG.siteTitle;
document.title = "管理后台 - " + CONFIG.siteTitle;

let token = localStorage.getItem(TOKEN_KEY) || "";
let postsData = [];

function apiHeaders() {
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json"
  };
}

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin);
}

function show(viewId) {
  ["loginView", "listView", "editorView", "quotesListView", "quoteEditorView"].forEach(id => $(id).style.display = "none");
  $(viewId).style.display = "";
}

let quotesData = [];
let editingQuoteIndex = -1;

/* ===== 登录 ===== */
if (token) {
  show("listView");
  $("logoutBtn").style.display = "";
  loadList();
} else {
  show("loginView");
}

$("loginBtn").addEventListener("click", () => {
  token = $("tokenInput").value.trim();
  if (!token) { $("loginMsg").textContent = "请输入 Token"; return; }
  if (CONFIG.owner === "YOUR_GITHUB_USERNAME") { $("loginMsg").textContent = "请先修改 config.js 里的 GitHub 信息"; return; }
  fetch("https://api.github.com/user", { headers: { "Authorization": `Bearer ${token}` } })
    .then(r => { if (!r.ok) throw new Error("Token 无效或无权限"); return r.json(); })
    .then(() => {
      localStorage.setItem(TOKEN_KEY, token);
      $("loginMsg").textContent = "";
      $("logoutBtn").style.display = "";
      show("listView");
      loadList();
    })
    .catch(e => { $("loginMsg").textContent = e.message || "登录失败"; });
});

$("logoutBtn").addEventListener("click", e => {
  e.preventDefault();
  localStorage.removeItem(TOKEN_KEY);
  token = "";
  show("loginView");
  $("logoutBtn").style.display = "none";
});

/* ===== 列表 ===== */
async function loadList() {
  $("listMsg").textContent = "";
  try {
    const res = await fetch("posts.json", { cache: "no-store" });
    postsData = await res.json();
    postsData.sort((a, b) => b.date.localeCompare(a.date));
    renderList();
  } catch (e) {
    $("listMsg").textContent = "加载失败: " + e.message;
  }
}

function renderList() {
  const el = $("adminList");
  if (!postsData.length) { el.innerHTML = '<p class="empty">暂无文章。</p>'; return; }
  el.innerHTML = postsData.map(p => `
    <div class="admin-post-row" data-file="${escapeHtml(p.file)}">
      <span class="t">${escapeHtml(p.title)}</span>
      <span class="d">${p.date}</span>
      <div class="row-actions">
        <button class="btn edit-btn" type="button">编辑</button>
        <button class="btn del-btn" type="button">删除</button>
      </div>
    </div>
  `).join("");
}

$("adminList").addEventListener("click", e => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const row = btn.closest(".admin-post-row");
  if (!row || !row.dataset.file) return;
  if (btn.classList.contains("edit-btn")) editPost(row.dataset.file);
  if (btn.classList.contains("del-btn")) deletePost(row.dataset.file);
});

/* ===== 编辑器 ===== */
let editingIndex = -1;
let editingFile = "";

$("newBtn").addEventListener("click", () => {
  editingIndex = -1; editingFile = "";
  $("editorTitle").textContent = "写文章";
  $("titleInput").value = "";
  $("bodyInput").value = "";
  $("editorMsg").textContent = "";
  show("editorView");
});

window.editPost = async function(file) {
  const index = postsData.findIndex(p => p.file === file);
  if (index < 0) return;
  editingIndex = index;
  const meta = postsData[index];
  editingFile = meta.file;
  $("editorTitle").textContent = "编辑文章";
  $("titleInput").value = meta.title;
  $("editorMsg").textContent = "";
  try {
    const res = await fetch("posts/" + encodeURIComponent(meta.file), { cache: "no-store" });
    $("bodyInput").value = await res.text();
  } catch (e) { $("bodyInput").value = ""; $("editorMsg").textContent = "读取原文失败: " + e.message; }
  show("editorView");
};

$("backBtn").addEventListener("click", () => { show("listView"); loadList(); });

/* ===== 发布 ===== */
$("publishBtn").addEventListener("click", async () => {
  const title = $("titleInput").value.trim();
  const body = $("bodyInput").value;
  if (!title) { $("editorMsg").textContent = "请输入标题"; return; }
  if (!body.trim()) { $("editorMsg").textContent = "请输入正文"; return; }

  $("publishBtn").disabled = true;
  $("editorMsg").textContent = "提交中…";

  try {
    const dateStr = new Date().toISOString().slice(0, 10);

    let fileName = editingFile;
    if (!fileName) {
      fileName = (dateStr + "-" + title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-|-$/g, "")).slice(0, 60) + ".md";
    }

    const mdPath = `posts/${fileName}`;
    await putFile(mdPath, toBase64(body), (editingIndex >= 0 ? "更新" : "发布") + `文章: ${title}`);

    // 如果编辑且改文件名，删旧文件
    if (editingIndex >= 0 && postsData[editingIndex].file !== fileName) {
      await deleteFile(`posts/${postsData[editingIndex].file}`);
    }

    // 更新 posts.json
    const plain = body.replace(/[#*`\[\]()!>-]/g, "").replace(/\s+/g, " ").trim();
    const newMeta = {
      title, date: dateStr, file: fileName,
      excerpt: plain.length > 120 ? plain.slice(0, 120) + "…" : plain
    };
    const metaList = [...postsData];
    if (editingIndex >= 0) metaList[editingIndex] = newMeta;
    else metaList.unshift(newMeta);

    await putFile("posts.json", toBase64(JSON.stringify(metaList, null, 2)), (editingIndex >= 0 ? "更新" : "发布") + `文章索引: ${title}`);

    $("editorMsg").textContent = "发布成功！GitHub Pages 可能需要 1-3 分钟生效。";
    setTimeout(() => { show("listView"); loadList(); }, 800);
  } catch (e) {
    $("editorMsg").textContent = "失败: " + e.message;
  } finally {
    $("publishBtn").disabled = false;
  }
});

/* ===== GitHub 写入（带 409/422/5xx 重试，防止连续提交冲突导致半成功） ===== */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ghApi = path => `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;

async function withRetry(fn) {
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (e.status === 409 || e.status === 422 || e.status >= 500) { await sleep(800 * (attempt + 1)); continue; }
      throw e;
    }
  }
  throw lastErr;
}

async function putFile(path, base64, message) {
  return withRetry(async () => {
    let sha = "";
    try {
      const r = await fetch(`${ghApi(path)}?ref=${CONFIG.branch}`, { headers: apiHeaders() });
      if (r.ok) sha = (await r.json()).sha;
    } catch (e) {}
    const payload = { message, content: base64, branch: CONFIG.branch };
    if (sha) payload.sha = sha;
    const res = await fetch(ghApi(path), { method: "PUT", headers: apiHeaders(), body: JSON.stringify(payload) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const e = new Error(err.message || `HTTP ${res.status}`);
      e.status = res.status;
      throw e;
    }
  });
}

window.deletePost = async function(file) {
  const meta = postsData.find(p => p.file === file);
  if (!meta) return;
  if (!confirm(`确定删除《${meta.title}》吗？`)) return;
  const metaList = postsData.filter(p => p.file !== file);
  try {
    // 先更新索引：保证站点立刻不再出现死链卡片；md 文件随后清理
    await putFile("posts.json", toBase64(JSON.stringify(metaList, null, 2)), `删除文章: ${meta.title}`);
    postsData = metaList;
    renderList();
    $("listMsg").textContent = "已删除，Pages 生效可能需要 1-3 分钟。";
    try {
      await deleteFile(`posts/${file}`);
    } catch (e2) {
      $("listMsg").textContent = "文章已下线，但仓库里的 md 文件清理失败，可稍后再删：" + e2.message;
    }
  } catch (e) {
    $("listMsg").textContent = "删除失败: " + e.message;
  }
};

async function deleteFile(path) {
  return withRetry(async () => {
    const r = await fetch(`${ghApi(path)}?ref=${CONFIG.branch}`, { headers: apiHeaders() });
    if (!r.ok) {
      if (r.status === 404) return;
      const e = new Error((await r.json().catch(() => ({}))).message || `HTTP ${r.status}`);
      e.status = r.status;
      throw e;
    }
    const d = await r.json();
    const res = await fetch(ghApi(path), {
      method: "DELETE", headers: apiHeaders(),
      body: JSON.stringify({ message: `删除 ${path}`, sha: d.sha, branch: CONFIG.branch })
    });
    if (!res.ok) {
      const e = new Error((await res.json().catch(() => ({}))).message || `HTTP ${res.status}`);
      e.status = res.status;
      throw e;
    }
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

/* ===== 每日一言管理 ===== */
async function loadQuotesList() {
  $("quotesListMsg").textContent = "";
  try {
    const res = await fetch("quotes.json", { cache: "no-store" });
    quotesData = await res.json();
    renderQuotesList();
  } catch (e) {
    quotesData = [];
    renderQuotesList();
    $("quotesListMsg").textContent = "加载失败: " + e.message;
  }
}

function renderQuotesList() {
  const el = $("quotesAdminList");
  if (!quotesData.length) { el.innerHTML = '<p class="empty">暂无一言。</p>'; return; }
  el.innerHTML = quotesData.map((q, i) => `
    <div class="admin-post-row" data-idx="${i}">
      <span class="t">${escapeHtml(q.text)}</span>
      <span class="d">${q.author ? escapeHtml(q.author) : "—"}</span>
      <div class="row-actions">
        <button class="btn" type="button" data-act="edit">编辑</button>
        <button class="btn" type="button" data-act="del">删除</button>
      </div>
    </div>
  `).join("");
}

$("quotesAdminList").addEventListener("click", e => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const row = btn.closest(".admin-post-row");
  const idx = row ? Number(row.dataset.idx) : -1;
  if (idx < 0) return;
  if (btn.dataset.act === "edit") openQuoteEditor(idx);
  if (btn.dataset.act === "del") deleteQuote(idx);
});

function openQuoteEditor(idx) {
  editingQuoteIndex = idx;
  if (idx >= 0) {
    const q = quotesData[idx];
    $("quoteEditorTitle").textContent = "编辑一言";
    $("quoteTextInput").value = q.text || "";
    $("quoteAuthorInput").value = q.author || "";
  } else {
    $("quoteEditorTitle").textContent = "新增一言";
    $("quoteTextInput").value = "";
    $("quoteAuthorInput").value = "";
  }
  $("quoteEditorMsg").textContent = "";
  show("quoteEditorView");
}

$("quoteSaveBtn").addEventListener("click", async () => {
  const text = $("quoteTextInput").value.trim();
  const author = $("quoteAuthorInput").value.trim();
  if (!text) { $("quoteEditorMsg").textContent = "内容不能为空"; return; }
  $("quoteSaveBtn").disabled = true;
  $("quoteEditorMsg").textContent = "保存中…";
  try {
    const entry = { text, ...(author ? { author } : {}) };
    const list = [...quotesData];
    if (editingQuoteIndex >= 0) list[editingQuoteIndex] = entry;
    else list.push(entry);
    await putFile("quotes.json", toBase64(JSON.stringify(list, null, 2)),
      (editingQuoteIndex >= 0 ? "更新" : "新增") + `每日一言: ${text.slice(0, 20)}`);
    quotesData = list;
    $("quoteEditorMsg").textContent = "保存成功";
    setTimeout(() => { show("quotesListView"); }, 600);
  } catch (e) {
    $("quoteEditorMsg").textContent = "失败: " + e.message;
  } finally {
    $("quoteSaveBtn").disabled = false;
  }
});

async function deleteQuote(idx) {
  const q = quotesData[idx];
  if (!confirm(`确定删除这句吗？\n「${q.text}」`)) return;
  const list = quotesData.filter((_, i) => i !== idx);
  try {
    await putFile("quotes.json", toBase64(JSON.stringify(list, null, 2)), `删除每日一言: ${q.text.slice(0, 20)}`);
    quotesData = list;
    renderQuotesList();
    $("quotesListMsg").textContent = "已删除";
  } catch (e) {
    $("quotesListMsg").textContent = "删除失败: " + e.message;
  }
}

$("quoteBackBtn").addEventListener("click", () => { show("quotesListView"); loadQuotesList(); });
$("toQuotesBtn").addEventListener("click", () => { show("quotesListView"); loadQuotesList(); });
$("toPostsBtn").addEventListener("click", () => { show("listView"); loadList(); });
$("newQuoteBtn").addEventListener("click", () => openQuoteEditor(-1));
