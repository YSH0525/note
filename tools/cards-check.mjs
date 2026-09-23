#!/usr/bin/env node
// 아기 단어카드 동작 점검 + 스크린샷
//   node tools/cards-check.mjs            동작만 점검
//   node tools/cards-check.mjs --shots    스크린샷도 찍는다 (기본 위치: .shots/cards)
// 필요: playwright (전역 설치도 찾는다), 크로미움
import { createRequire } from "node:module";
import { readdirSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const APP = "file://" + path.join(root, "cards", "index.html");
const SHOTS = process.argv.includes("--shots");
// 스크린샷은 cards/ 밖에 쓴다 — 빌드가 cards/* 를 통째로 복사하므로 앱 안에 섞이면 안 된다
const OUT = process.env.SHOT_DIR || path.join(root, ".shots", "cards");

function loadPlaywright() {
  for (const id of ["playwright", "/opt/node22/lib/node_modules/playwright"]) {
    try { return require(id); } catch (e) { /* 다음 후보 */ }
  }
  throw new Error("playwright 를 찾지 못했습니다. npm i -g playwright");
}
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = "/opt/pw-browsers";
  if (!existsSync(base)) return undefined;   // playwright 기본 경로에 맡긴다
  const dir = readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  return dir ? path.join(base, dir, "chrome-linux", "chrome") : undefined;
}

/* 1) 스크립트 문법 — index.html 에서 <script> 만 뽑아 node --check */
const html = readFileSync(path.join(root, "cards", "index.html"), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const tmp = path.join(root, ".syntax-check.js");
writeFileSync(tmp, scripts.join("\n;\n"));
try {
  execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" });
  console.log("PASS 스크립트 문법");
} catch (e) {
  console.log("FAIL 스크립트 문법\n" + e.stderr);
  process.exitCode = 1;
} finally {
  execFileSync("rm", ["-f", tmp]);
}

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ executablePath: findChrome() });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, hasTouch: true });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push("JS: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });

let failed = 0;
const ok = (label, cond, extra = "") => {
  if (!cond) failed++;
  console.log((cond ? "PASS " : "FAIL ") + label + (extra ? " — " + extra : ""));
};

await page.goto(APP);

/* 2) 데이터 */
const total = await page.evaluate(() => CATEGORIES.reduce((a, c) => a + c.words.length, 0));
ok("카테고리 10개", (await page.locator(".tile").count()) === 10);
const bad = await page.evaluate(() => CATEGORIES.flatMap((c) => c.words
  .filter((w) => !w.ko || !w.en || !/^<svg /.test(w.art)).map((w) => c.name + "/" + w.ko)));
ok("모든 카드에 한글·영어·그림", bad.length === 0, bad.join(","));
const dupes = await page.evaluate(() => {
  const seen = {}, out = [];
  CATEGORIES.forEach((c) => c.words.forEach((w) => { if (seen[w.ko]) out.push(w.ko); seen[w.ko] = 1; }));
  return out;
});
ok("같은 단어 중복 없음", dupes.length === 0, dupes.join(","));

/* 2-1) 사진 목록이 실제 폴더와 맞는가 — 어긋나면 사진이 조용히 안 보인다 */
const imgDir = path.join(root, "cards", "img");
const onDisk = (existsSync(imgDir) ? readdirSync(imgDir) : []).filter((f) => /\.webp$/i.test(f)).sort();
const listed = (await page.evaluate(() => [...PHOTOS])).sort();
ok("사진 목록이 폴더와 일치 (node tools/cards-photos.mjs)",
   JSON.stringify(onDisk) === JSON.stringify(listed),
   `폴더 ${onDisk.length}장 / 목록 ${listed.length}장`);
const naming = await page.evaluate(() => {
  const want = new Set(CATEGORIES.filter((c) => c.photos).flatMap((c) => c.words.map((w) => imgFile(c, w))));
  return [...PHOTOS].filter((f) => !want.has(f));
});
ok("사진 파일명이 카드와 짝이 맞음", naming.length === 0, naming.join(","));

/* 3) 넘기기 */
await page.locator(".tile").first().click();
ok("표지 → 동물", (await page.locator("#wordKo").textContent()) === "강아지");
await page.click("#btnNext");
ok("다음 카드", (await page.locator("#wordKo").textContent()) === "고양이");
await page.click("#btnPrev"); await page.click("#btnPrev");
ok("처음에서 이전 → 마지막", (await page.locator("#wordKo").textContent()) === "병아리");
await page.mouse.move(300, 450); await page.mouse.down(); await page.mouse.move(120, 455, { steps: 8 }); await page.mouse.up();
ok("왼쪽으로 밀면 다음", (await page.locator("#wordKo").textContent()) === "강아지");
await page.mouse.move(120, 450); await page.mouse.down(); await page.mouse.move(320, 452, { steps: 8 }); await page.mouse.up();
ok("오른쪽으로 밀면 이전", (await page.locator("#wordKo").textContent()) === "병아리");

/* 4) 섞기·자동 넘김 */
const before = await page.evaluate(() => order.join(","));
await page.click("#btnShuffle");
ok("섞기", before !== (await page.evaluate(() => order.join(","))));
ok("섞어도 카드 수 유지", (await page.evaluate(() => order.length)) === 8);
await page.evaluate(() => { settings.autoMs = 300; });
await page.click("#btnAuto");
const w1 = await page.locator("#wordKo").textContent();
await page.waitForTimeout(700);
ok("자동 넘김", w1 !== (await page.locator("#wordKo").textContent()));
await page.click("#btnAuto");
const w3 = await page.locator("#wordKo").textContent();
await page.waitForTimeout(600);
ok("자동 넘김 정지", (await page.locator("#wordKo").textContent()) === w3);

/* 5) 아기 잠금 */
await page.click("#btnLock");
ok("잠금", await page.evaluate(() => locked));
ok("잠금 중 다른 버튼 숨김", !(await page.locator("#btnBack").isVisible()));
await page.click("#btnLock");
ok("짧게 눌러서는 안 풀림", await page.evaluate(() => locked));
await page.locator("#btnLock").hover();
await page.mouse.down(); await page.waitForTimeout(2300); await page.mouse.up();
ok("2초 길게 누르면 풀림", !(await page.evaluate(() => locked)));

/* 6) 설정 */
await page.click("#btnBack");
await page.click("#btnSettings");
await page.click("#swEnglish");
await page.click("#btnCloseSettings");
await page.locator(".tile").first().click();
ok("영어 끄기 즉시 반영", !(await page.locator("#wordEn").isVisible()));
await page.reload();
ok("설정이 새로고침 뒤에도 유지", await page.evaluate(() => settings.english === false));
await page.evaluate(() => { settings.english = true; saveSettings(); });

/* 7) 주소(해시)와 뒤로가기 */
await page.evaluate(() => { location.hash = "numbers/9"; });
await page.waitForTimeout(200);
ok("해시로 바로 진입", (await page.locator("#wordKo").textContent()) === "열");
await page.click("#btnBack");
await page.waitForTimeout(200);
ok("뒤로 → 표지", await page.locator("#home").isVisible());
await page.locator(".tile").nth(1).click();
await page.waitForTimeout(150);
await page.goBack();
await page.waitForTimeout(200);
ok("폰 뒤로가기 → 표지", await page.locator("#home").isVisible() && !(await page.locator("#deck").isVisible()));

/* 8) 스크린샷 */
if (SHOTS) {
  mkdirSync(OUT, { recursive: true });
  const shots = [
    ["phone-home", 412, 915, ""],
    ["phone-animals", 412, 915, "#animals"],
    ["phone-numbers", 412, 915, "#numbers/4"],
    ["phone-dark", 412, 915, "#nature", "dark"],
    ["tablet-home", 800, 1280, ""],
    ["tablet-things", 800, 1280, "#things/3"],
    ["tablet-land-fruits", 1280, 800, "#fruits/2"],
    ["tablet-land-body", 1280, 800, "#body/0"]
  ];
  for (const [name, w, h, hash, theme] of shots) {
    const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    const p = await c.newPage();
    if (theme) await p.addInitScript((t) => localStorage.setItem("wordcards.settings", JSON.stringify({ theme: t })), theme);
    await p.goto(APP + hash);
    await p.waitForTimeout(350);
    await p.screenshot({ path: path.join(OUT, name + ".png") });
    await c.close();
  }
  console.log("스크린샷: " + OUT);
}

await browser.close();
if (errs.length) { failed++; console.log("FAIL 페이지 오류\n" + errs.join("\n")); }
else console.log("PASS 페이지 오류 없음");
console.log(`\n카드 ${total}장 · 실패 ${failed}건`);
if (failed) process.exitCode = 1;
