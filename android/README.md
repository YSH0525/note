# 폴드노트 안드로이드 앱 (WebView 래퍼)

`../app/`의 웹앱을 assets로 내장한 네이티브 APK. 오프라인 완전 동작, 사진 첨부는
파일 선택기(WebChromeClient.onShowFileChooser)로 연결된다.

- 패키지: `com.foldnote.app` / minSdk 26 / targetSdk 34
- 접힘 전환 대응: `configChanges`로 액티비티 재시작 없이 레이아웃 전환
- 빌드: `build.sh` 참고 (Gradle 불필요, SDK 도구만 사용)
- 서명 키스토어는 저장소에 포함하지 않는다. 업데이트 설치를 위해 최초 빌드에
  사용한 키스토어를 보관할 것 (다른 키로 서명하면 덮어쓰기 설치 불가)
