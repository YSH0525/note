#!/usr/bin/env node
// 출시 전 자동 점검. 사람이 눈으로 확인하던 것들을 기계가 막는다.
//
// 특히 CONFIG.aab 이 옛 버전을 가리킨 채 남는 사고를 잡는다 — 그 경우
// 워크플로가 조용히 이전 번들을 올리고 로그에는 "커밋 완료"가 찍혀서,
// 스토어에 안 올라간 걸 한참 뒤에야 알게 된다.
//
// 사용법: node tools/preflight.mjs   (실패하면 종료 코드 1)

import { readFileSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";

const fails = [];
const notes = [];
const read = (p) => readFileSync(p, "utf8");

// ---------- 버전 세 곳이 맞물리는지 ----------
const html = read("app/index.html");
const manifest = read("android/AndroidManifest.xml");
const publish = read("tools/play-publish.mjs");

const appVersion = html.match(/APP_VERSION\s*=\s*"([^"]+)"/)?.[1];
const versionName = manifest.match(/android:versionName="([^"]+)"/)?.[1];
const versionCode = manifest.match(/android:versionCode="(\d+)"/)?.[1];
const aabPath = publish.match(/aab:\s*"([^"]+)"/)?.[1];

if (!appVersion) fails.push("app/index.html 에서 APP_VERSION 을 찾지 못했다");
if (!versionName) fails.push("AndroidManifest.xml 에서 versionName 을 찾지 못했다");
if (!versionCode) fails.push("AndroidManifest.xml 에서 versionCode 를 찾지 못했다");
if (!aabPath) fails.push("play-publish.mjs 에서 CONFIG.aab 를 찾지 못했다");

if (appVersion && versionName && appVersion !== versionName) {
  fails.push(`버전 불일치: APP_VERSION ${appVersion} vs versionName ${versionName} — 항상 함께 올린다`);
}

// ---------- CONFIG.aab 이 이번 버전을 가리키는지 ----------
if (aabPath && versionName) {
  if (!aabPath.includes(versionName)) {
    fails.push(`CONFIG.aab 가 옛 버전을 가리킨다: ${aabPath} (versionName ${versionName})\n`
      + "      → 이대로 두면 워크플로가 이전 번들을 올리고 성공으로 보고한다");
  }
  if (!existsSync(aabPath)) {
    fails.push(`CONFIG.aab 파일이 없다: ${aabPath} — release/ 에 넣었는지 확인 (mkdir -p release)`);
  } else {
    const buf = readFileSync(aabPath);
    const sha = createHash("sha256").update(buf).digest("hex");
    notes.push(`AAB ${aabPath} · ${(statSync(aabPath).size / 1024).toFixed(0)} KB · sha256 ${sha.slice(0, 16)}…`);
    // 서명 여부 — zip 로컬 헤더에 파일명이 평문으로 들어 있어 바이트 검사로 확인된다
    const raw = buf.toString("latin1");
    if (!raw.includes("META-INF/") || !/META-INF\/[A-Z0-9_]+\.SF/i.test(raw)) {
      fails.push(`${aabPath} 에 서명이 없다 — jarsigner 를 거치지 않은 번들은 플레이가 거부한다`);
    }
  }
}

// ---------- 권한 0개 원칙 ----------
const perms = manifest.match(/<uses-permission[^>]*>/g) || [];
if (perms.length) {
  fails.push(`권한이 ${perms.length}개 선언돼 있다 — 데이터 보안 "수집 없음"의 근거가 깨진다.\n`
    + "      추가가 의도된 것이면 콘솔 데이터 보안 설문도 함께 고쳐야 한다:\n"
    + perms.map((p) => "        " + p).join("\n"));
}

// ---------- 스토어 제목이 콘솔 등록명과 같은지 ----------
const title = publish.match(/title:\s*"([^"]+)"/)?.[1];
const listingDoc = existsSync("store/스토어-등록-정보.md") ? read("store/스토어-등록-정보.md") : "";
if (title && listingDoc && !listingDoc.includes(title)) {
  fails.push(`CONFIG.listing.title "${title}" 이 store/스토어-등록-정보.md 에 없다 — `
    + "어긋나면 --listing 이 콘솔의 앱 이름을 덮어쓴다");
}

// ---------- 결과 ----------
console.log(`버전  APP_VERSION ${appVersion} · versionName ${versionName} · versionCode ${versionCode}`);
for (const n of notes) console.log("      " + n);
console.log(`권한  ${perms.length}개`);

if (fails.length) {
  console.error("\n출시 전 점검 실패\n");
  for (const f of fails) console.error("  ✗ " + f);
  console.error("");
  process.exit(1);
}
console.log("\n출시 전 점검 통과");
