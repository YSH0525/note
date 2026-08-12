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

## 출시 (플레이스토어)

**출시 작업은 Claude가 맡는다.** 절차는 [store/출시-자동화.md](store/출시-자동화.md),
등록 정보는 [store/스토어-등록-정보.md](store/스토어-등록-정보.md).

- 업로드·트랙 배정·스토어 정보 갱신은 `tools/play-publish.mjs`(Google Play Developer API)로 자동화돼 있다.
  `.github/workflows/play-publish.yml`이 **`v*` 태그 푸시**와 수동 실행에 반응한다.
- 출시 요청을 받으면 순서대로 한다.
  1. 버전 올리기 — `app/index.html`의 `APP_VERSION` + `AndroidManifest.xml`의 versionName/**versionCode(반드시 증가)**
  2. AAB·APK 재빌드 → `release/`에 배치 (`mkdir -p release` 먼저)
  3. 스크린샷 갱신이 필요하면 Playwright로 다시 촬영
  4. 커밋 → PR → 머지
  5. 배포 — **브랜치 푸시만 가능하다**(태그 푸시와 `workflow_dispatch`는 Claude 토큰에서 403)
     - 프로덕션: `git push origin main:publish/production/vX.Y`
     - 내부 테스트: `git push origin main:publish/vX.Y`
  6. Actions 로그로 성공/실패 확인 후 결과 보고. 실패하면 오류를 고쳐 재시도
- 계정은 **조직(비즈니스) 계정**이라 신규 앱 클로즈드 테스트(12명·14일) 요건이 면제된다.
  내부 테스트를 건너뛰고 바로 프로덕션으로 올려도 된다.
- **Claude가 할 수 없는 것** (사용자만 가능):
  - 플레이 콘솔에서 앱 항목 생성 — API로 새 앱을 만들 수 없다 (완료됨)
  - 서비스 계정 키를 저장소 시크릿 `PLAY_SERVICE_ACCOUNT_JSON`에 등록 (완료됨)
  - 데이터 보안·콘텐츠 등급 설문 제출 (답변은 등록 정보 문서에 정리돼 있음)
  - 워크플로 수동 실행(`workflow_dispatch`)과 태그 푸시는 Claude 토큰 권한 밖 → `publish/**` 브랜치 푸시로 대신한다
  - 프로덕션 승격은 Actions 탭에서 수동 실행(트랙 production 선택)

## 디자인 원칙

- **접힘선은 화면 정중앙(50:50).** 상단 바·본문·설정 화면까지 관통해 끊기지 않게 한다.
- **접었을 때 = 빠른 기록, 펼쳤을 때 = 열람·편집.** 접었다는 이유로 기능을 막지 않는다
  (표지에는 항상 '접은 채로 열기' 진입구를 둔다).
- 색은 라이트/다크 토큰으로만 쓴다. 미디어쿼리 안에서만 정의된 색을 만들지 않는다.
- `[hidden] { display: none !important }` 전역 규칙이 있다 (grid/flex 요소의 hidden 무시 방지).

## 검증 방법

- 스크립트 문법: `node --check` (index.html에서 `<script>` 블록만 추출해서 검사)
- 렌더링·동작: Playwright + `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
  - 커버(접힘) 412×660 · 펼침 816×616 · 반접힘(플렉스) 616×816
  - 해시: `#demo` 샘플 데이터, `#flex` 플렉스 모드 강제, `#new` 새 노트, `#today` 오늘 일기

## 미해결 / 다음 후보

- 저녁 일기 알림 (안드로이드 로컬 알림, 서버 불필요) — 리텐션 효과 가장 큼
- 두 노트 나란히 보기 (펼침면 활용, 폴더블 차별점)
- 홈 화면 위젯 / 손가락 스케치 / 태그·검색 필터 / 클라우드 동기화
