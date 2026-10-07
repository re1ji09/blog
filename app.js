document.getElementById("siteTitle").textContent = CONFIG.siteTitle;
document.title = CONFIG.siteTitle;

let posts = [];

async function loadPosts() {
  const list = document.getElementById("postList");
  try {
    const res = await fetch("posts.json", { cache: "no-store" });
    posts = await res.json();
    posts.sort((a, b) => b.date.localeCompare(a.date));
    render(posts);
  } catch (e) {
    list.innerHTML = '<p class="empty">加载失败。</p>';
  }
}

function render(items) {
  const list = document.getElementById("postList");
  if (!items.length) {
    list.innerHTML = '<p class="empty">暂无文章。</p>';
    return;
  }
  list.innerHTML = items.map(p => `
    <a class="card" href="post.html?f=${encodeURIComponent(p.file)}">
      <span class="card-date top">${p.date}</span>
      <h2>${escapeHtml(p.title)}</h2>
      <p>${escapeHtml(p.excerpt)}</p>
    </a>
  `).join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

document.getElementById("searchInput").addEventListener("input", e => {
  const q = e.target.value.trim().toLowerCase();
  if (!q) return render(posts);
  render(posts.filter(p =>
    p.title.toLowerCase().includes(q) || p.excerpt.toLowerCase().includes(q)
  ));
});

loadPosts();
