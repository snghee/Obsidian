const fs = require("fs");
const path = require("path");
const OUT = process.env.HOME + "/storage/emulated/0/Documents/Obsidian/NHK NEWS";
const BASE = "https://www3.nhk.or.jp";

async function main() {
  const { default: fetch } = await import("node-fetch");
  const cheerioModule = await import("cheerio");
  const cheerio = cheerioModule.load ? cheerioModule : cheerioModule.default;
  const load = cheerio.load.bind(cheerio);

  const t = new Date();
  const ds = t.getFullYear() + "-" + String(t.getMonth()+1).padStart(2,"0") + "-" + String(t.getDate()).padStart(2,"0");
  console.log("NHK 수집 시작:", ds);

  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  const res = await fetch(BASE + "/news/easy/");
  const html = await res.text();
  const $ = load(html);

  const arts = [];
  $("a[href*='/news/easy/k']").each((i, el) => {
    if (arts.length >= 3) return false;
    const href = $(el).attr("href") || "";
    const title = $(el).text().trim();
    if (href && title.length > 2) {
      const url = href.startsWith("http") ? href : BASE + href;
      if (!arts.find(a => a.url === url)) arts.push({ title, url });
    }
  });

  console.log("기사 수:", arts.length);
  if (arts.length === 0) { console.warn("기사 없음 - 파싱 실패"); process.exit(1); }

  for (let i = 0; i < arts.length; i++) {
    const { title, url } = arts[i];
    let body = "";
    try {
      const html2 = await (await fetch(url)).text();
      const $2 = load(html2);
      $2("ruby").each((_, r) => {
        const k = $2(r).find("rb").text() || $2(r).contents().not("rt").text();
        const f = $2(r).find("rt").text();
        $2(r).replaceWith(f ? k + "(" + f + ")" : k);
      });
      body = $2(".article-main__body, #news_textbody").text().trim();
    } catch(e) { console.warn("본문 오류:", e.message); }

    const md = "---\ndate: " + ds + "\ntitle: \"" + title + "\"\nsource: \"" + url + "\"\ntags:\n  - nhk\n  - japanese\n  - news\n---\n\n# " + title + "\n\n> " + ds + "\n\n---\n\n## 원문\n\n" + (body || "<!-- 원문 붙여넣기 -->") + "\n\n---\n\n## 어휘 메모\n\n| 단어 | 읽기 | 의미 |\n|------|------|------|\n|      |      |      |\n\n---\n\n## 한 줄 감상\n\n";
    fs.writeFileSync(path.join(OUT, ds + "_news" + (i+1) + ".md"), md, "utf8");
    console.log("저장:", ds + "_news" + (i+1) + ".md |", title);
  }
  console.log("완료!");
}

main().catch(e => { console.error(e); process.exit(1); });
