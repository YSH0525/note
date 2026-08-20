# 폴드노트 (FoldNote) — 작업 안내

갤럭시 Z 폴드용 노트·다이어리 앱. 만든 곳 Yoonque Labs. 무료·광고 없음.

## 사용자 배경

- **구글 플레이에 이미 여러 앱을 출시한 경험이 있고 개발자 계정을 보유하고 있다.**
  계정 등록·수수료·심사 절차 같은 기초 설명은 생략하고, 이 앱에만 해당하는
  결정 사항과 산출물 위주로 전달할 것.
- 한국어로 소통한다.

## 작업 흐름

- 브랜치는 `claude/fold8-information-4867yw`. 항상 `origin/main`에서 새로 시작한다
  (이전 PR이 머지되면 그 브랜치는 재사용하지 않고 main 기준으로 리셋).
- 변경 → 커밋 → 푸시 → PR 생성 → 요청 시 머지 → GitHub Pages 자동 배포.
- 결과물은 파일로 직접 보내고(SendUserFile), 요청 시 카카오톡으로 다운로드 링크를 보낸다.
  **카톡 링크는 머지 후 `main`의 raw 주소를 쓴다** (브랜치 주소는 사라질 수 있음).
- 검증은 설명이 아니라 스크린샷과 측정값으로 보여준다.

## 앱 사실관계

| 항목 | 값 |
|------|-----|
| 패키지 | `com.yoonquelabs.foldnote` (스토어 등록 후 변경 불가) |
| 버전 | `app/index.html`의 `APP_VERSION`과 `android/AndroidManifest.xml`의 versionName/versionCode를 **항상 함께** 올린다 |
| 서명 | `foldnote.keystore`, 별칭 `foldnote` — 저장소에서 제외(.gitignore). 분실 시 업데이트 불가 |
| 서명 인증서 | SHA-256 `6951a1bc…e9de0416` (CN=FoldNote). 새 AAB가 이것과 다르면 업데이트 설치가 안 된다 |
| 라이선스 | MIT |
| 개인정보처리방침 | https://ysh0525.github.io/note/privacy.html |
| 권한 | **0개 유지가 원칙.** 데이터 보안 설문 "수집 없음"의 근거이므로 권한 추가는 반드시 사전 합의 |

## 빌드

Gradle 없이 SDK 도구만 사용한다. `android/build.sh` 참고.

- build-tools **36.0.0**, platforms **android-36**, minSdk 26 / targetSdk 36
- AAB: `aapt2 link --proto-format` → `bundletool build-bundle` → `jarsigner`
- 검증: `bundletool validate`, `build-apks --mode=universal`로 설치 가능 여부까지 확인

### 알려진 함정

- build-tools 34의 `d8`은 **익명 내부 클래스에서 크래시**한다. 그래서 `ChromeClient`를
  별도 파일로 분리해 두었다 — 익명 클래스로 되돌리지 말 것.
- `release/`에 파일이 하나뿐일 때 `git rm` 하면 디렉터리가 사라진다.
  새 파일을 넣기 전에 반드시 `mkdir -p release`.
- `build.sh`가 `cp ../app/*`로 에셋을 복사하므로 **`app/` 아래에 하위 디렉터리를 만들면 누락된다.**
  브랜드 자산을 저장소 루트 `brand/`에 둔 이유.
- **엣지 투 엣지 — 상태바가 웹뷰 위에 겹쳐 그려진다.** 안드로이드 15(API 35)부터
  targetSdk 35 이상인 앱은 시스템이 창을 화면 끝까지 강제로 늘린다. `NoActionBar`
  테마로는 안 막힌다. v1.1에서 이걸로 상단 UI가 시계·배터리에 가렸다.
  - **CSS `env(safe-area-inset-top)`으로는 못 고친다.** 안드로이드 웹뷰에서 그 값은
    디스플레이 컷아웃만 반영하고 **상태바 높이는 0으로 준다.** iOS와 다른 지점이라
    `viewport-fit=cover`를 이미 쓰고 있으면 더 헷갈린다.
  - 그래서 `MainActivity`가 실측한 시스템 바 높이를 `--bar-top`/`--bar-bottom`으로
    직접 써넣는다. API 35 미만은 시스템이 알아서 비켜주므로 **아무것도 하지 않는다**
    (손대면 이중으로 밀린다). insets를 소비하지 않고 돌려주므로 키보드 동작도 그대로다.
  - 새 화면을 최상단에 붙일 때는 `--bar-top`을 반영했는지 확인할 것.

## 출시 (플레이스토어)

**출시 작업은 Claude가 맡는다.** 절차는 [store/출시-자동화.md](store/출시-자동화.md),
등록 정보는 [store/스토어-등록-정보.md](store/스토어-등록-정보.md).

> **다른 앱을 출시할 때는 [store/플레이-출시-플레이북.md](store/플레이-출시-플레이북.md)를
> 먼저 읽는다.** v1.0을 올리며 워크플로 13번을 돌려 알아낸 것을 앱에 종속되지 않게
> 정리해 뒀다. 신규 앱은 그 순서대로 하면 한 번에 끝난다.

v1.0은 2026-08-13 프로덕션에 출시됐다(versionCode 1). 앱이 draft 상태를 벗어났으므로
**다음 버전부터는 아래 순서가 그대로 통한다** — 첫 출시 때 걸렸던 제약은 이제 없다.

- 업로드·트랙 배정·스토어 정보 갱신은 `tools/play-publish.mjs`(Google Play Developer API)로 자동화돼 있다.
  `.github/workflows/play-publish.yml`이 **`publish/**` 브랜치 푸시**에 반응한다
  (`v*` 태그와 수동 실행도 받지만 Claude 토큰으로는 못 쓴다).
- 출시 요청을 받으면 순서대로 한다.
  1. 버전 올리기 — **세 곳을 함께** 고친다. 하나라도 빠지면 2번의 점검이 막는다
     - `app/index.html`의 `APP_VERSION`
     - `AndroidManifest.xml`의 versionName + **versionCode(반드시 증가)**
     - `tools/play-publish.mjs`의 `CONFIG.aab` 경로 — **이걸 빼먹으면 옛 번들이 올라가고
       로그에는 "커밋 완료"가 찍힌다.** 가장 조용하게 틀리는 지점이다
  2. AAB 빌드 → `release/`에 배치 (`mkdir -p release` 먼저) → **`node tools/preflight.mjs`**
     - 버전 세 곳 일치, `CONFIG.aab`이 이번 버전을 가리키는지, 서명 유무, 권한 0개를 본다
     - 워크플로도 업로드 직전에 같은 걸 돌린다. 여기서 막히면 배포가 진행되지 않는다
  3. 스크린샷 갱신이 필요하면 Playwright로 다시 촬영
  4. 커밋 → PR → 머지
  5. 배포 — **브랜치 푸시만 가능하다**(태그 푸시와 `workflow_dispatch`는 Claude 토큰에서 403)
     - 프로덕션: `git push origin main:publish/production/vX.Y`
     - 내부 테스트: `git push origin main:publish/vX.Y`
  6. Actions 로그로 성공/실패 확인 후 결과 보고. 실패하면 오류를 고쳐 재시도
  7. **검증은 플레이에게 묻는다** — `git push origin main:publish/show/vX.Y` 로 트랙·번들·
     등록정보·이미지를 읽어오고, AAB의 sha256을 `release/` 파일과 대조한다.
     스크립트가 찍는 "커밋 완료"는 우리 출력일 뿐이다

### 서명 — 여기서 한 번 멈춘다

**Claude는 AAB에 서명할 수 없다.** `jarsigner`가 보안 분류기에 막힌다. v1.1 때 네 가지
방식을 시도했고 전부 막혔다 — 환경변수, 암호 파일, `-storepass:file`, 스크립트 경유.
읽기 전용 `keytool -list`·`keytool -printcert`는 통과하므로 **인증서 대조는 가능하다.**

저장소에 `.claude/settings.json`으로 `jarsigner`와 `build-aab.sh` 실행을 허용해 두면
풀린다. 다만 **Claude가 그 파일을 만들거나 커밋하는 것도 막힌다** — 자기 실행 권한을
스스로 넓히는 행위라서 의도된 차단이다. 사용자가 GitHub 웹에서 직접 만들어야 한다.

그 파일이 없는 동안에는 사용자에게 서명을 부탁한다. 순서는 이렇다.

1. `android/build-aab.sh`를 KEYSTORE 없이 돌려 `unsigned.aab`까지 만든다
2. `unsigned.aab`를 SendUserFile로 보낸다 (키스토어는 **사용자가 이미 갖고 있다**)
3. 실행할 명령을 **한 줄로** 준다 — 사용자는 **윈도우 PowerShell**을 쓰므로 `\` 줄바꿈이
   동작하지 않는다. 여러 줄로 주면 별칭 앞에서 끊겨 "Please specify alias name"이 난다

   ```powershell
   jarsigner -keystore foldnote.keystore -signedjar FoldNote-X.Y.aab <받은파일명> foldnote
   ```

4. 받은 AAB를 `keytool -printcert -jarfile`로 위 인증서 지문과 대조한 뒤 `release/`에 넣는다

> **다운로드하면 파일명이 바뀐다.** 브라우저가 하이픈을 지워서
> `FoldNote-1.1-unsigned.aab`가 `FoldNote1.1unsigned.aab`로 저장됐다. 사용자가
> "파일이 없다"고 하면 `dir *.aab*`로 실제 이름부터 확인하게 할 것.
>
> `self-signed`·`PKIX path building failed`·`no timestamp` 경고는 **전부 정상이다.**
> 안드로이드 앱 서명은 자체 서명이고 인증서 만료는 2053년이다.

- 계정은 **조직(비즈니스) 계정**이라 신규 앱 클로즈드 테스트(12명·14일) 요건이 면제된다.
  내부 테스트를 건너뛰고 바로 프로덕션으로 올려도 된다.
- **API 함정**: 스토어 이미지는 리소스 이름이 `edits.images` 인데 URL 경로는 `/listings/`다.
  `/images/`로 부르면 종류를 가리지 않고 404가 나는데 권한 문제로 착각하기 쉽다.
  경로가 의심스러우면 디스커버리 문서(`$discovery/rest?version=v3`)를 받아 확인할 것.
- **커밋이 막히면 담은 내용을 빼가며 좁힌다.** 플레이는 커밋 시점에 한꺼번에 검사하고
  **문제가 여러 개여도 먼저 걸린 것 하나만** 알려준다. 증상 하나에 원인 하나라고 가정하지 말 것.
  브랜치로 조합을 고른다 — `publish/text`(문구만) · `publish/listing`(문구+이미지) ·
  `publish/aab`(AAB+트랙) · `publish/show`(읽기 전용).
- **스토어 제목은 콘솔 등록명과 일치시킨다.** 콘솔은 `폴드8노트 - 폴더블 노트·다이어리`,
  `CONFIG.listing.title`도 같은 값. 어긋나면 `--listing`이 사용자가 정한 이름을 덮어쓴다.
  (앱 안 표기는 아직 `폴드노트` — 통일 여부는 미정)
- **Claude가 할 수 없는 것** (사용자만 가능). 격리된 클라우드 컨테이너에서 돌기 때문에
  브라우저로 콘솔에 접속할 수 없다 — 로그인해 두셔도 그 세션을 쓸 수 없다:
  - 플레이 콘솔에서 앱 항목 생성 — API로 새 앱을 만들 수 없다 (완료됨)
  - **첫 게시** — API에 앱 게시 메서드가 없다(디스커버리 문서 전수 확인). 신규 앱은
    `draft` 릴리스만 만들 수 있고 게시는 콘솔에서만 (완료됨 — 이후 버전은 해당 없음)
  - 서비스 계정 키를 저장소 시크릿 `PLAY_SERVICE_ACCOUNT_JSON`에 등록 (완료됨)
  - 데이터 보안·콘텐츠 등급 설문 제출 (완료됨. 답변은 등록 정보 문서에 정리돼 있음)
  - **AAB 서명** — 서명 명령이 보안 분류기에 막힌다. 아래 "서명" 항목 참고
  - 워크플로 수동 실행(`workflow_dispatch`)과 태그 푸시는 Claude 토큰 권한 밖 → `publish/**` 브랜치 푸시로 대신한다
  - 콘솔에서만 보이는 것(관리형 게시·정책 경고·릴리스 상태)은 크롬 확장에 시킨다 →
    [store/콘솔-점검-프롬프트.md](store/콘솔-점검-프롬프트.md)

## 디자인 원칙

- **접힘선은 화면 정중앙(50:50).** 상단 바·본문·설정 화면까지 관통해 끊기지 않게 한다.
- **접었을 때 = 빠른 기록, 펼쳤을 때 = 열람·편집.** 접었다는 이유로 기능을 막지 않는다
  (표지에는 항상 '접은 채로 열기' 진입구를 둔다).
- 색은 라이트/다크 토큰으로만 쓴다. 미디어쿼리 안에서만 정의된 색을 만들지 않는다.
- `[hidden] { display: none !important }` 전역 규칙이 있다 (grid/flex 요소의 hidden 무시 방지).
- **시스템 바 여백은 `--bar-top`/`--bar-bottom`.** 화면 최상단에 붙는 요소는 이걸 반영해야
  상태바에 안 가린다(`.pane-head`·`.rail-half`·`.cover`·`.viewer-bar`·`.lock`).
  펼침 화면에서는 `.rail`이 아니라 **`.rail` 반쪽**에 준다 — `.rail`에 주면 가운데
  구분선과 힌지 그림자가 상태바 구간에서 끊겨 접힘선 원칙이 깨진다.
- **CSS 변수 이름을 새로 만들 땐 기존 것과 겹치는지 본다.** `--sat`은 달력 **토요일 색**이다.
  v1.1 때 safe-area-top을 `--sat`으로 쓰려다 토요일이 색을 잃을 뻔했다.
  `grep -n '\-\-이름:' app/index.html`으로 먼저 확인할 것.

## 검증 방법

- 스크립트 문법: `node --check` (index.html에서 `<script>` 블록만 추출해서 검사)
- 렌더링·동작: Playwright + `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
  - 커버(접힘) 412×660 · 펼침 816×616 · 반접힘(플렉스) 616×816
  - 해시: `#demo` 샘플 데이터, `#flex` 플렉스 모드 강제, `#new` 새 노트, `#today` 오늘 일기

## 미해결 / 다음 후보

- 저녁 일기 알림 (안드로이드 로컬 알림, 서버 불필요) — 리텐션 효과 가장 큼
- 두 노트 나란히 보기 (펼침면 활용, 폴더블 차별점)
- 홈 화면 위젯 / 손가락 스케치 / 태그·검색 필터 / 클라우드 동기화
