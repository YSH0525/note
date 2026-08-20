#!/usr/bin/env node
/**
 * 구글 플레이 출시 자동화 (Google Play Developer API v3)
 *
 * 서비스 계정 키만 있으면 AAB 업로드 → 트랙 배정 → 스토어 정보·이미지 갱신 →
 * 커밋까지 한 번에 처리한다. 외부 패키지 없이 Node 18+ 내장 기능만 쓴다.
 *
 * 사용 예
 *   node tools/play-publish.mjs --track internal --dry-run
 *   node tools/play-publish.mjs --track internal --notes "첫 내부 테스트"
 *   node tools/play-publish.mjs --track production --status draft --listing
 *
 * 인증
 *   PLAY_SERVICE_ACCOUNT_JSON 환경변수에 서비스 계정 키 JSON 전체를 넣거나
 *   --key <파일경로> 로 지정한다.
 *
 * 주의: 플레이 콘솔에 앱이 이미 만들어져 있어야 한다. 이 API로는 새 앱을
 *      생성할 수 없다(구글 제약). 최초 1회 앱 생성만 콘솔에서 하면 된다.
 */

import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const API = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const UPLOAD = "https://androidpublisher.googleapis.com/upload/androidpublisher/v3";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

/* ---------- 설정 ---------- */
const CONFIG = {
  packageName: "com.yoonquelabs.foldnote",
  language: "ko-KR",
  aab: "release/FoldNote-1.1.aab",
  listing: {
    // 콘솔에 등록된 앱 이름과 맞춰둔다. 다르면 --listing 이 사용자가 정한
    // 이름을 덮어쓴다 (플레이 조회 결과: "폴드8노트 - 폴더블 노트·다이어리").
    title: "폴드8노트 - 폴더블 노트·다이어리",
    shortDescription: "펼치면 수첩이 되는 노트·다이어리. 접힘선이 화면 가운데 오는 폴더블 전용 설계.",
    fullDescriptionFile: "store/full-description.txt"
  },
  // 주의: 리소스 이름은 edits.images 지만 실제 URL 경로는 /listings/ 다.
  // (androidpublisher v3 디스커버리 문서 확인 — /images/ 로 부르면 전부 404)
  images: {
    icon: ["store/icon-512.png"],
    featureGraphic: ["store/feature-graphic-1024x500.png"],
    phoneScreenshots: [
      "store/screenshots/phone-1-cover.png",
      "store/screenshots/phone-2-diary.png",
      "store/screenshots/phone-3-entry.png",
      "store/screenshots/phone-4-notes.png"
    ],
    sevenInchScreenshots: [
      "store/screenshots/foldable-1-diary.png",
      "store/screenshots/foldable-2-notes.png",
      "store/screenshots/foldable-3-year.png",
      "store/screenshots/foldable-4-settings.png"
    ],
    tenInchScreenshots: [
      "store/screenshots/foldable-1-diary.png",
      "store/screenshots/foldable-2-notes.png",
      "store/screenshots/foldable-3-year.png",
      "store/screenshots/foldable-4-settings.png"
    ]
  }
};

/* ---------- 인자 파싱 ---------- */
function parseArgs(argv) {
  const a = { track: "internal", status: "completed", dryRun: false, listing: false, listingOnly: false, images: true, notes: "", key: "", aab: "" };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--dry-run") a.dryRun = true;
    else if (k === "--listing") a.listing = true;
    else if (k === "--listing-only") { a.listing = true; a.listingOnly = true; }
    else if (k === "--show") a.show = true;
    else if (k === "--no-images") a.images = false;
    else if (k === "--track") a.track = argv[++i];
    else if (k === "--status") a.status = argv[++i];
    else if (k === "--notes") a.notes = argv[++i];
    else if (k === "--key") a.key = argv[++i];
    else if (k === "--aab") a.aab = argv[++i];
    else if (k === "--help" || k === "-h") a.help = true;
    else throw new Error(`알 수 없는 인자: ${k}`);
  }
  const tracks = ["internal", "alpha", "beta", "production"];
  if (!tracks.includes(a.track)) throw new Error(`--track 은 ${tracks.join(", ")} 중 하나여야 합니다`);
  const statuses = ["completed", "draft", "inProgress", "halted"];
  if (!statuses.includes(a.status)) throw new Error(`--status 는 ${statuses.join(", ")} 중 하나여야 합니다`);
  return a;
}

/* ---------- 서비스 계정 인증 ---------- */
function base64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function signJwt(sa, now = Math.floor(Date.now() / 1000)) {
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: SCOPE,
    aud: sa.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };
  const body = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const sig = createSign("RSA-SHA256").update(body).sign(sa.private_key);
  return `${body}.${base64url(sig)}`;
}
async function getAccessToken(sa) {
  const res = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signJwt(sa)
    })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`토큰 발급 실패 ${res.status}: ${JSON.stringify(json)}`);
  return json.access_token;
}

/* ---------- API 헬퍼 ---------- */
// 실패 메시지를 한 줄로. 구글은 본문 JSON 에 진짜 이유를 담아 보내는데
// 첫 줄만 찍으면 "→ 404" 밖에 안 남아서 원인을 못 찾는다.
function brief(e) {
  const [head, ...rest] = String(e.message).split("\n");
  const status = head.replace(/^\S+ \S*androidpublisher\.googleapis\.com\/\S*?v3/, "…");
  try {
    const err = JSON.parse(rest.join("\n")).error || {};
    const detail = [err.status, err.message].filter(Boolean).join(" · ");
    return detail ? `${status} — ${detail}` : status;
  } catch { return status; }
}

function makeClient(token, { dryRun }) {
  const calls = [];
  async function call(method, url, { json, body, contentType } = {}) {
    calls.push(`${method} ${url.replace("https://androidpublisher.googleapis.com", "")}`);
    if (dryRun) return { __dryRun: true };
    const headers = { Authorization: `Bearer ${token}` };
    let payload;
    if (json !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(json); }
    else if (body !== undefined) { headers["Content-Type"] = contentType || "application/octet-stream"; payload = body; }
    const res = await fetch(url, { method, headers, body: payload });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${url} → ${res.status}\n${text}`);
    return text ? JSON.parse(text) : {};
  }
  // 실패해도 진행해야 하는 호출(기존 이미지 정리 등)
  async function callSafe(method, url, opts, label) {
    try { return await call(method, url, opts); }
    catch (e) { console.log(`  (건너뜀) ${label}: ${brief(e)}`); return null; }
  }
  return { call, callSafe, calls };
}

/* ---------- 권한 진단 ---------- */
// 커밋이 403일 때 원인이 "우리가 올린 내용"인지 "계정 권한"인지 가른다.
// 아무것도 담기지 않은 새 편집 세션을 만들어 validate 만 해보고 지운다.
// 빈 편집조차 403이면 앱 상태·업로드 내용과 무관한 순수 권한 문제다.
async function probePermission({ call, callSafe, pkg }) {
  console.error("\n권한 진단: 빈 편집 세션으로 다시 시험합니다");
  let probeId;
  try {
    const probe = await call("POST", `${API}/applications/${pkg}/edits`);
    probeId = probe.id;
  } catch (e) {
    console.error(`  편집 세션 생성부터 거부됨 — ${brief(e)}`);
    console.error("  → 이 서비스 계정은 이 앱에 접근할 수 없습니다.");
    return;
  }
  // validate 만으로는 부족하다. 커밋 자체가 내용과 무관하게 막히는 것인지
  // 확인해야 "담긴 내용 때문"이라는 해석이 성립한다. 빈 편집 커밋은 무해하다.
  let ok = true;
  for (const op of ["validate", "commit"]) {
    try {
      await call("POST", `${API}/applications/${pkg}/edits/${probeId}:${op}`);
      console.error(`  빈 편집 ${op}: 통과`);
    } catch (e) {
      ok = false;
      console.error(`  빈 편집 ${op}: 실패 — ${brief(e)}`);
      break;
    }
  }
  if (ok) {
    console.error("  → 빈 편집은 커밋까지 됩니다. 403은 편집에 담은 내용 때문입니다.");
    console.error("    담은 것을 빼가며 좁힐 것: --listing-only(스토어만) / publish/aab(AAB·트랙만).");
  } else {
    console.error("  → 아무것도 담지 않아도 막힙니다. 담은 내용과 무관한 계정 권한 문제입니다.");
    await callSafe("DELETE", `${API}/applications/${pkg}/edits/${probeId}`, {}, "진단용 편집 세션 정리");
  }
}

/* ---------- 상태 조회 (읽기 전용) ---------- */
// 우리 스크립트가 뭘 보냈는지가 아니라 플레이가 지금 뭘 갖고 있는지를 본다.
// 편집 세션을 만들어 읽기만 하고 커밋 없이 지우므로 아무것도 바뀌지 않는다.
async function showState({ call, callSafe, pkg }) {
  const edit = await call("POST", `${API}/applications/${pkg}/edits`);
  try {
    const tracks = await callSafe("GET", `${API}/applications/${pkg}/edits/${edit.id}/tracks`, {}, "트랙 조회");
    console.log("\n[트랙]");
    for (const t of (tracks && tracks.tracks) || []) {
      for (const r of t.releases || []) {
        const codes = (r.versionCodes || []).join(", ") || "(없음)";
        console.log(`  ${t.track}: versionCode ${codes} · ${r.status}${r.name ? ` · ${r.name}` : ""}`);
      }
      if (!(t.releases || []).length) console.log(`  ${t.track}: (릴리스 없음)`);
    }

    const bundles = await callSafe("GET", `${API}/applications/${pkg}/edits/${edit.id}/bundles`, {}, "번들 조회");
    const list = (bundles && bundles.bundles) || [];
    console.log(`\n[업로드된 번들] ${list.length}개`);
    for (const b of list) console.log(`  versionCode ${b.versionCode} · sha256 ${String(b.sha256 || "").slice(0, 16)}…`);

    const l = await callSafe("GET", `${API}/applications/${pkg}/edits/${edit.id}/listings/${CONFIG.language}`, {}, "등록정보 조회");
    console.log(`\n[스토어 등록정보 ${CONFIG.language}]`);
    if (!l) console.log("  (비어 있음 — 콘솔에서 입력 필요)");
    else {
      console.log(`  제목: ${l.title || "(없음)"}`);
      console.log(`  간단한 설명: ${l.shortDescription ? l.shortDescription.slice(0, 40) + "…" : "(없음)"}`);
      console.log(`  자세한 설명: ${l.fullDescription ? l.fullDescription.length + "자" : "(없음)"}`);
    }

    console.log("\n[이미지]");
    for (const type of Object.keys(CONFIG.images)) {
      const r = await callSafe("GET", `${API}/applications/${pkg}/edits/${edit.id}/listings/${CONFIG.language}/${type}`, {}, `${type} 조회`);
      console.log(`  ${type}: ${r ? ((r.images || []).length + "개") : "조회 실패"}`);
    }
  } finally {
    await callSafe("DELETE", `${API}/applications/${pkg}/edits/${edit.id}`, {}, "조회용 편집 세션 정리");
  }
}

/* ---------- 출시 절차 ---------- */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("사용법: node tools/play-publish.mjs [--track internal|alpha|beta|production] [--status completed|draft] [--notes <문구>] [--listing] [--listing-only] [--no-images] [--show] [--aab <경로>] [--key <경로>] [--dry-run]");
    return;
  }

  let aab = null;
  if (args.show) {
    console.log("플레이 쪽 현재 상태를 읽습니다 (변경 없음)");
  } else if (args.listingOnly) {
    console.log("스토어 정보만 갱신합니다 (AAB 업로드·트랙 배정 건너뜀)");
  } else {
    const aabPath = path.resolve(ROOT, args.aab || CONFIG.aab);
    aab = await readFile(aabPath);
    console.log(`AAB: ${path.relative(ROOT, aabPath)} (${(aab.length / 1024).toFixed(0)} KB)`);
  }

  let token = "DRY-RUN";
  if (!args.dryRun) {
    const raw = args.key
      ? await readFile(path.resolve(ROOT, args.key), "utf8")
      : process.env.PLAY_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error("서비스 계정 키가 없습니다. PLAY_SERVICE_ACCOUNT_JSON 환경변수 또는 --key <경로>를 지정하세요.");
    const sa = JSON.parse(raw);
    if (!sa.client_email || !sa.private_key) throw new Error("서비스 계정 키에 client_email / private_key 가 없습니다.");
    token = await getAccessToken(sa);
    console.log(`인증 완료: ${sa.client_email}`);
  }

  const { call, callSafe, calls } = makeClient(token, { dryRun: args.dryRun });
  const pkg = CONFIG.packageName;

  if (args.show) return showState({ call, callSafe, pkg });

  // 1) 편집 세션 시작
  const edit = await call("POST", `${API}/applications/${pkg}/edits`);
  const editId = edit.id || "DRY-EDIT";
  console.log(`편집 세션: ${editId}`);

  // 2~3) AAB 업로드 + 트랙 배정. --listing-only 면 둘 다 건너뛴다.
  // 커밋 403의 원인이 '트랙 출시'인지 '스토어 등록정보'인지 가르는 데 쓴다.
  if (!args.listingOnly) {
    const bundle = await call("POST", `${UPLOAD}/applications/${pkg}/edits/${editId}/bundles?uploadType=media`, { body: aab });
    const versionCode = bundle.versionCode || "(dry-run)";
    console.log(`업로드 완료: versionCode ${versionCode}`);

    await call("PUT", `${API}/applications/${pkg}/edits/${editId}/tracks/${args.track}`, {
      json: {
        track: args.track,
        releases: [{
          versionCodes: [String(versionCode)],
          status: args.status,
          ...(args.notes ? { releaseNotes: [{ language: CONFIG.language, text: args.notes }] } : {})
        }]
      }
    });
    console.log(`트랙 배정: ${args.track} (${args.status})`);
  }

  const skipped = [];

  // 4) 스토어 정보·이미지 (--listing 일 때만)
  if (args.listing) {
    const full = await readFile(path.resolve(ROOT, CONFIG.listing.fullDescriptionFile), "utf8");
    await call("PUT", `${API}/applications/${pkg}/edits/${editId}/listings/${CONFIG.language}`, {
      json: {
        language: CONFIG.language,
        title: CONFIG.listing.title,
        shortDescription: CONFIG.listing.shortDescription,
        fullDescription: full.trim()
      }
    });
    console.log("스토어 정보 갱신");

    for (const [type, files] of (args.images ? Object.entries(CONFIG.images) : [])) {
      const slot = `applications/${pkg}/edits/${editId}/listings/${CONFIG.language}/${type}`;
      // 기존 이미지를 먼저 비운다. 실패해도 업로드가 덮어쓰므로 그냥 넘어간다.
      await callSafe("DELETE", `${API}/${slot}`, {}, `${type} 기존 이미지 삭제`);
      // 한 종류가 막혀도 릴리스 전체를 되돌리지 않는다. 실패는 모아서 끝에 보고한다.
      let done = 0;
      try {
        for (const f of files) {
          const img = await readFile(path.resolve(ROOT, f));
          await call("POST", `${UPLOAD}/${slot}?uploadType=media`, { body: img, contentType: "image/png" });
          done++;
        }
        console.log(`이미지 ${type}: ${done}개`);
      } catch (e) {
        skipped.push({ type, done, total: files.length, reason: brief(e) });
        console.log(`이미지 ${type}: ${done}/${files.length} — 실패, 계속 진행\n    ${brief(e)}`);
      }
    }
  }

  // 5) 검증 후 커밋 — validate 는 통과하는데 commit 이 403 이면 권한 문제로 좁혀진다
  const check = await callSafe("POST", `${API}/applications/${pkg}/edits/${editId}:validate`, {}, "사전 검증");
  console.log(check ? "사전 검증 통과" : "사전 검증 건너뜀");

  // changesNotSentForReview 로 심사 제출을 미루는 우회로는 이 앱에 쓸 수 없다.
  // 아직 한 번도 출시된 적 없는 앱이라 변경이 항상 자동으로 심사에 올라간다
  // ("Changes are sent for review automatically" 400 INVALID_ARGUMENT).
  try {
    await call("POST", `${API}/applications/${pkg}/edits/${editId}:commit`);
  } catch (e) {
    // 업로드·트랙 배정·이미지까지 다 통과했는데 validate/commit 만 403이면
    // 스크립트가 아니라 서비스 계정 권한 문제다.
    if (/→ 403/.test(e.message)) {
      console.error(`\n커밋 거부됨: ${brief(e)}`);
      await probePermission({ call, callSafe, pkg });
      console.error("플레이 콘솔 → 사용자 및 권한 → 해당 서비스 계정 → 앱 권한 확인:");
      console.error("  · 프로덕션 릴리스 관리 (Release to production)");
      console.error("  · 테스트 트랙 릴리스 관리");
      console.error("  · 스토어 등록정보 관리");
      console.error("권한 변경은 반영에 최대 24시간까지 걸린다.");
    }
    throw e;
  }
  console.log(args.dryRun ? "\n[dry-run] 실제 호출 없음. 호출 예정 목록:" : "\n커밋 완료 — 플레이 콘솔에서 확인하세요.");
  if (args.dryRun) calls.forEach((c) => console.log("  " + c));
  if (skipped.length) {
    console.log("\n올리지 못한 이미지가 있습니다. 콘솔에서 직접 넣어주세요.");
    skipped.forEach((s) => console.log(`  - ${s.type}: ${s.done}/${s.total} (${s.reason})`));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error("실패:", e.message); process.exit(1); });
}
