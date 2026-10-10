document.getElementById("siteTitle").textContent = CONFIG.siteTitle;

async function load() {
  const file = new URLSearchParams(location.search).get("f");
  const titleEl = document.getElementById("postTitle");
  if (!file) { titleEl.textContent = "参数错误"; return; }

  try {
    const [metaRes, mdRes] = await Promise.all([
      fetch("posts.json", { cache: "no-store" }),
      fetch("posts/" + encodeURIComponent(file), { cache: "no-store" })
    ]);
    const metas = await metaRes.json();
    const meta = metas.find(m => m.file === file);
    const md = await mdRes.text();

    titleEl.textContent = meta ? meta.title : file;
    document.title = (meta ? meta.title : file) + " - " + CONFIG.siteTitle;
    document.getElementById("postDate").textContent = meta ? meta.date : "";
    document.getElementById("postBody").innerHTML = DOMPurifySanitize(marked.parse(md));
  } catch (e) {
    titleEl.textContent = "文章加载失败";
  }
}

// 极简过滤：去掉 script/iframe 等危险标签（marked 输出可信源，仅作兜底）
function DOMPurifySanitize(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,iframe,object,embed,link,style").forEach(el => el.remove());
  doc.querySelectorAll("*").forEach(el => {
    [...el.attributes].forEach(a => {
      if (/^on/i.test(a.name) || (a.name === "href" && /^\s*javascript:/i.test(a.value))) {
        el.removeAttribute(a.name);
      }
    });
  });
  return doc.body.innerHTML;
}

load();
