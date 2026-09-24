#!/usr/bin/env node
// cards/img/ 를 훑어 index.html 의 PHOTOS 목록을 다시 쓴다.
// 사진을 넣거나 뺀 뒤에 반드시 한 번 돌린다 — 목록에 없는 파일은 앱이 쳐다보지 않는다.
//   node tools/cards-photos.mjs
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dir = path.join(root, "cards", "img");
const files = existsSync(dir)
  ? readdirSync(dir).filter((f) => /\.webp$/i.test(f)).sort()
  : [];

const htmlPath = path.join(root, "cards", "index.html");
const html = readFileSync(htmlPath, "utf8");
const line = "const PHOTOS = new Set([" +
  (files.length ? "\n  " + files.map((f) => JSON.stringify(f)).join(",\n  ") + "\n" : "") + "]);";
const next = html.replace(/const PHOTOS = new Set\(\[[\s\S]*?\]\);/, line);
if (next === html && !html.includes(line)) {
  console.error("PHOTOS 목록을 찾지 못했습니다. cards/index.html 을 확인하세요.");
  process.exit(1);
}
writeFileSync(htmlPath, next);
console.log(`사진 ${files.length}장을 목록에 적었습니다.`);
