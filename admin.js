const TOKEN_KEY = "blog_gh_token";
const $ = id => document.getElementById(id);

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
  ["loginView", "listView", "editorView"].forEach(id => $(id).style.display = "none");
  $(viewId).style.display = "";
}

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
  el.innerHTML = postsData.map((p, i) => `
    <div class="admin-post-row">
      <span class="t">${escapeHtml(p.title)}</span>
      <span class="d">${p.date}</span>
      <div class="row-actions">
        <button class="btn" onclick="editPost(${i})">编辑</button>
        <button class="btn" onclick="deletePost(${i})">删除</button>
      </div>
    </div>
  `).join("");
}

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

window.editPost = async function(index) {
  editingIndex = index;
  const meta = postsData[index];
  editingFile = meta.file;
  $("editorTitle").textContent = "编辑文章";
  $("titleInput").value = meta.title;
  $("editorMsg").textContent = "";
  try {
    const res = await fetch("posts/" + meta.file, { cache: "no-store" });
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

async function putFile(path, base64, message) {
  let sha = "";
  try {
    const r = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}?ref=${CONFIG.branch}`, { headers: apiHeaders() });
    if (r.ok) sha = (await r.json()).sha;
  } catch (e) {}
  const payload = { message, content: base64, branch: CONFIG.branch };
  if (sha) payload.sha = sha;
  const res = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}`, {
    method: "PUT", headers: apiHeaders(), body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
}

window.deletePost = async function(index) {
  if (!confirm("确定删除这篇文章吗？")) return;
  const meta = postsData[index];
  try {
    await deleteFile(`posts/${meta.file}`);
    const metaList = postsData.filter((_, i) => i !== index);
    await putFile("posts.json", toBase64(JSON.stringify(metaList, null, 2)), `删除文章: ${meta.title}`);
    postsData = metaList;
    renderList();
    $("listMsg").textContent = "已删除，Pages 生效可能需要 1-3 分钟。";
  } catch (e) {
    $("listMsg").textContent = "删除失败: " + e.message;
  }
};

async function deleteFile(path) {
  const r = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}?ref=${CONFIG.branch}`, { headers: apiHeaders() });
  if (!r.ok) { if (r.status === 404) return; throw new Error((await r.json().catch(() => ({}))).message || `HTTP ${r.status}`); }
  const d = await r.json();
  const res = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}`, {
    method: "DELETE", headers: apiHeaders(),
    body: JSON.stringify({ message: `删除 ${path}`, sha: d.sha, branch: CONFIG.branch })
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `HTTP ${res.status}`);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
