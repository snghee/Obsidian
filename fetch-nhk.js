const fs   = require("fs");
const path = require("path");

const OUT  = process.env.HOME + "/storage/documents/obsidian/NHKNEWS";
const RSS  = "https://www3.nhk.or.jp/rss/news/cat0.xml";
const BASE = "https://www3.nhk.or.jp";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ja,en-US;q=0.7,en;q=0.3",
  "Connection": "keep-alive",
};

// ── Google 번역 (비공식 무료 API) ──────────────────────────
async function translate(fetch, text, from = "ja", to = "ko") {
  if (!text || text.trim().length === 0) return "";
  try {
    const url = "https://translate.googleapis.com/translate_a/single"
      + "?client=gtx&sl=" + from + "&tl=" + to + "&dt=t&q=" + encodeURIComponent(text);
    const res  = await fetch(url, { headers: HEADERS });
    const json = await res.json();
    return json[0].map(s => s[0]).join("");
  } catch (e) {
    console.warn("  ⚠️ 번역 실패:", e.message);
    return "";
  }
}

// ── 일본어 핵심 단어 추출 (한자+가나 2글자 이상) ──────────
function extractWords(text) {
  const matches = text.match(/[\u4e00-\u9faf\u3040-\u30ff]{2,}/g) || [];
  return [...new Set(matches)].slice(0, 10);
}

async function main() {
  const { default: fetch } = await import("node-fetch");
  const { load } = await import("cheerio");

  const t  = new Date();
  const ds = t.getFullYear() + "-"
    + String(t.getMonth() + 1).padStart(2, "0") + "-"
    + String(t.getDate()).padStart(2, "0");
  console.log("NHK 수집 시작:", ds);

  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  // ── 1) RSS로 기사 목록 가져오기 ───────────────────────────
  console.log("RSS 파싱 중...");
  let arts = [];
  try {
    const res  = await fetch(RSS, { headers: HEADERS });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const xml  = await res.text();
    const $    = load(xml, { xmlMode: true });

    $("item").each((_, el) => {
      if (arts.length >= 3) return false;
      const title = $(el).find("title").text().trim();
      const url   = $(el).find("link").text().trim();
      if (title && url) arts.push({ title, url });
    });
    console.log("✅ RSS 성공, 기사 수:", arts.length);
  } catch (e) {
    console.error("❌ RSS 실패:", e.message);
    process.exit(1);
  }

  // ── 2) 각 기사 본문 스크래핑 + 번역 ──────────────────────
  for (let i = 0; i < arts.length; i++) {
    const { title, url } = arts[i];
    console.log("\n[" + (i + 1) + "/" + arts.length + "] " + title);

    let body = "";
    try {
      const res2 = await fetch(url, { headers: { ...HEADERS, Referer: BASE + "/news/" } });
      if (!res2.ok) throw new Error("HTTP " + res2.status);
      const html = await res2.text();
      const $2   = load(html);

      const bodySelectors = [
        ".content--detail-body",
        "#news_textbody",
        ".article-body",
        ".article-main__body",
        ".body-text",
        "section.content p",
      ];
      for (const sel of bodySelectors) {
        const candidate = $2(sel).text().trim();
        if (candidate.length > 20) { body = candidate; break; }
      }
      if (!body) {
        const paras = [];
        $2("p").each((_, el) => {
          const t2 = $2(el).text().trim();
          if (t2.length > 15) paras.push(t2);
        });
        body = paras.join("\n\n");
      }
      console.log("  본문 길이:", body.length, "자");
    } catch (e) {
      console.warn("  ⚠️ 본문 오류:", e.message);
    }

    // ── 3) 번역 ───────────────────────────────────────────
    console.log("  번역 중...");
    const titleKo = await translate(fetch, title);
    const bodyKo  = body ? await translate(fetch, body.slice(0, 1000)) : "";

    // ── 4) 핵심 단어 추출 + 단어별 번역 ──────────────────
    console.log("  단어 분석 중...");
    const words = extractWords(body);
    const wordRows = [];
    for (const w of words) {
      const meaning = await translate(fetch, w);
      wordRows.push("| " + w + " |　| " + meaning + " |");
    }

    // ── 5) 문법 포인트 자동 감지 ─────────────────────────
    const grammarPoints = [];
    const grammarPatterns = [
      ["ている",   "**〜ている** : 진행 또는 상태 (~하고 있다)"],
      ["ました",   "**〜ました** : 정중한 과거형 (~했습니다)"],
      ["によって", "**〜によって** : ~에 의해"],
      ["ために",   "**〜ために** : ~하기 위해"],
      ["という",   "**〜という** : ~라고 하는"],
      ["ことが",   "**〜ことができる** : ~할 수 있다"],
      ["られ",     "**〜られる** : 수동형 또는 가능형"],
      ["ながら",   "**〜ながら** : ~하면서"],
      ["ければ",   "**〜ければ** : ~하면 (조건형)"],
      ["そうだ",   "**〜そうだ** : ~인 것 같다 / ~라고 한다"],
      ["てしまう", "**〜てしまう** : ~해버리다 (완료·후회)"],
      ["はずだ",   "**〜はずだ** : ~일 것이다 (당연한 추측)"],
    ];
    for (const [pattern, desc] of grammarPatterns) {
      if (body.includes(pattern)) grammarPoints.push("- " + desc);
    }
    if (grammarPoints.length === 0) grammarPoints.push("- (감지된 문법 포인트 없음)");

    // ── 6) Obsidian Markdown 저장 ─────────────────────────
    const md = [
      "---",
      "date: " + ds,
      'title: "' + title.replace(/"/g, '\\"') + '"',
      'source: "' + url + '"',
      "tags:",
      "  - nhk",
      "  - japanese",
      "  - news",
      "---",
      "",
      "# " + title,
      "",
      "> 📅 " + ds + "　|　[원문 링크](" + url + ")",
      "",
      "---",
      "",
      "## 🗾 원문 (日本語)",
      "",
      body || "<!-- 본문을 가져오지 못했습니다 -->",
      "",
      "---",
      "",
      "## 🇰🇷 한국어 번역",
      "",
      "**제목:** " + (titleKo || "(번역 실패)"),
      "",
      bodyKo || "(번역 실패)",
      "",
      "---",
      "",
      "## 📝 핵심 단어",
      "",
      "| 단어 | 읽기 | 의미 |",
      "|------|------|------|",
      ...(wordRows.length > 0 ? wordRows : ["|      |      |      |"]),
      "",
      "---",
      "",
      "## 📖 문법 포인트",
      "",
      ...grammarPoints,
      "",
      "---",
      "",
      "## 💬 한 줄 감상",
      "",
    ].join("\n");

    const filename = ds + "_news" + (i + 1) + ".md";
    fs.writeFileSync(path.join(OUT, filename), md, "utf8");
    console.log("  ✅ 저장:", filename);
  }

  console.log("\n🎉 완료! →", OUT);
}

main().catch(e => { console.error("❌ 오류:", e.message); process.exit(1); });