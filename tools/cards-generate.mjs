#!/usr/bin/env node
// 카드 그림을 OpenAI 이미지 API 로 만든다. 프롬프트는 단어카드-그림-프롬프트.md 에서 읽는다.
//
//   node tools/cards-generate.mjs                     시범 4장 (강아지·사과·자동차·컵)
//   node tools/cards-generate.mjs --category animals  카테고리 하나
//   node tools/cards-generate.mjs --all               56장 전부
//   node tools/cards-generate.mjs --only animals-dog,fruits-apple --force   골라서 다시
//   node tools/cards-generate.mjs --ref cards/img/animals-dog.webp --category fruits
//                                                     기준 그림을 참조로 물려 결을 맞춘다
//   node tools/cards-generate.mjs --dry-run           보낼 프롬프트만 보고 끝낸다 (키 불필요)
//
// 옵션: --quality low|medium|high (기본 high) · --jobs N (동시 요청, 기본 2) · --white (투명 대신 흰 배경)
// 모델은 OPENAI_IMAGE_MODEL 로 바꿀 수 있다 (기본 gpt-image-1). API 주소는 OPENAI_BASE_URL.
//
// 흐름: API → .gen/<이름>.png (원본, 저장소 제외) → cards-photo-prep.py → cards/img/<이름>.webp
//       → 끝에 cards-photos.mjs 로 앱의 사진 목록 갱신. 이미 받은 원본은 건너뛴다(--force 로 다시).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const GEN = path.join(root, ".gen");
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const SAMPLE = ["animals-dog", "fruits-apple", "vehicles-car", "things-cup"];
const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
// OpenAI SDK 와 같은 관례. 평소엔 비워 두고, 가짜 서버로 흐름만 시험할 때 쓴다
const BASE = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const QUALITY = opt("--quality", "high");
const JOBS = Math.max(1, Number(opt("--jobs", "2")) || 2);
const TRANSPARENT = !flag("--white");
const REF = opt("--ref", null);
const DRY = flag("--dry-run");
const FORCE = flag("--force");

/* ── 프롬프트 읽기 — 문서가 원본이다. 여기에 따로 적지 않는다 ── */
const md = readFileSync(path.join(root, "단어카드-그림-프롬프트.md"), "utf8");
const prefixBlock = md.split("## 스타일 접두문")[1]?.match(/```\n([\s\S]*?)```/);
if (!prefixBlock) die("단어카드-그림-프롬프트.md 에서 스타일 접두문을 찾지 못했습니다");
let prefix = prefixBlock[1].replace(/\s+/g, " ").replace(/Subject:\s*$/, "").trim();
if (TRANSPARENT) {
  // 투명 배경은 API 가 직접 만든다. 문서의 "흰 배경" 문구를 그대로 두면 흰 판이 그려질 수 있다
  const before = prefix;
  prefix = prefix.replace("plain pure white background", "transparent background, no backdrop, no floor");
  if (prefix === before) die("접두문에서 'plain pure white background' 를 찾지 못했습니다 — 문서 문구가 바뀌었는지 확인하세요");
}
const rows = [...md.matchAll(/^\| `([a-z]+-[a-z0-9-]+)\.webp` \| (.+?) \|$/gm)]
  .map((m) => ({ name: m[1], prompt: m[2].trim() }));
if (rows.length !== 56) die(`프롬프트 표에서 ${rows.length}줄을 읽었습니다 (56줄이어야 합니다)`);

/* ── 무엇을 만들까 ── */
let pick;
if (flag("--all")) pick = rows;
else if (opt("--category")) pick = rows.filter((r) => r.name.startsWith(opt("--category") + "-"));
else if (opt("--only")) { const s = new Set(opt("--only").split(",")); pick = rows.filter((r) => s.has(r.name)); }
else pick = rows.filter((r) => SAMPLE.includes(r.name));
if (!pick.length) die("만들 그림이 없습니다. --category / --only 이름을 확인하세요");
const todo = pick.filter((r) => FORCE || !existsSync(path.join(GEN, r.name + ".png")));

const fullPrompt = (r) =>
  (REF ? "Match the exact art style, clay material, lighting and color palette of the reference image, " +
         "but draw a completely different subject. " : "") +
  prefix + " Subject: " + r.prompt;

console.log(`모델 ${MODEL} · 품질 ${QUALITY} · 배경 ${TRANSPARENT ? "투명" : "흰색"}${REF ? " · 참조 " + path.basename(REF) : ""}`);
console.log(`대상 ${pick.length}장 중 새로 만들 것 ${todo.length}장 (요청 ${todo.length}건)`);
if (DRY) {
  if (todo[0]) console.log("\n예시 프롬프트 —\n" + fullPrompt(todo[0]) + "\n");
  todo.forEach((r) => console.log("  " + r.name));
  process.exit(0);
}

const KEY = process.env.OPENAI_API_KEY;
if (!KEY) die("OPENAI_API_KEY 가 없습니다. 클라우드 환경 설정의 환경 변수에 넣고 새 세션에서 다시 실행하세요");
if (REF && !existsSync(REF)) die(`참조 그림이 없습니다: ${REF}`);
mkdirSync(GEN, { recursive: true });

/* ── API ── */
async function callOnce(r) {
  const common = { model: MODEL, size: "1024x1024", quality: QUALITY, background: TRANSPARENT ? "transparent" : "opaque" };
  let res;
  if (REF) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(common)) fd.append(k, v);
    fd.append("prompt", fullPrompt(r));
    // 새 세션엔 .gen/ 이 없다(저장소 제외). 그땐 커밋된 cards/img/*.webp 를 참조로 쓰면 된다
    const mime = { ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" }[path.extname(REF).toLowerCase()] || "image/png";
    fd.append("image[]", new Blob([readFileSync(REF)], { type: mime }), path.basename(REF));
    res = await fetch(BASE + "/images/edits", {
      method: "POST", headers: { Authorization: `Bearer ${KEY}` }, body: fd });
  } else {
    res = await fetch(BASE + "/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...common, output_format: "png", n: 1, prompt: fullPrompt(r) }) });
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = j.error?.message || res.statusText;
    const err = new Error(`${res.status} ${msg}`);
    err.retry = res.status === 429 || res.status >= 500;
    if (/verif/i.test(msg)) err.hint = "OpenAI 조직 인증이 필요합니다 — platform.openai.com 설정 → Organization → Verify";
    throw err;
  }
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) throw new Error("응답에 그림이 없습니다: " + JSON.stringify(j).slice(0, 200));
  return Buffer.from(b64, "base64");
}

async function make(r) {
  for (let attempt = 1; ; attempt++) {
    try {
      const t = Date.now();
      const png = await callOnce(r);
      const out = path.join(GEN, r.name + ".png");
      writeFileSync(out, png);
      execFileSync("python3", [path.join(root, "tools", "cards-photo-prep.py"), "--name", r.name, out],
        { stdio: "inherit", env: { ...process.env, CARDS_PREP_QUIET: "1" } });
      console.log(`  ✓ ${r.name}  ${((Date.now() - t) / 1000).toFixed(0)}초`);
      return true;
    } catch (e) {
      if (e.retry && attempt < 4) {
        const wait = 2 ** attempt * 5;
        console.log(`  … ${r.name} ${e.message} — ${wait}초 뒤 다시`);
        await new Promise((ok) => setTimeout(ok, wait * 1000));
        continue;
      }
      console.log(`  ✗ ${r.name}  ${e.message}${e.hint ? "\n    → " + e.hint : ""}`);
      return false;
    }
  }
}

/* ── 돌리기 (동시 JOBS 개) ── */
const queue = [...todo];
let ok = 0, fail = 0;
await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
  while (queue.length) { (await make(queue.shift())) ? ok++ : fail++; }
}));

execFileSync(process.execPath, [path.join(root, "tools", "cards-photos.mjs")], { stdio: "inherit" });
console.log(`\n완료 ${ok}장 · 실패 ${fail}장. 확인: node tools/cards-check.mjs --shots`);
if (fail) process.exitCode = 1;

function die(msg) { console.error(msg); process.exit(1); }
