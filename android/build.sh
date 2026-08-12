#!/bin/sh
# 폴드노트 APK 빌드 스크립트 (Gradle 없이 SDK 도구만 사용)
# 필요: JDK 11+, Android SDK build-tools 34.0.0, platforms;android-34
# 사용법: SDK=<android-sdk 경로> KEYSTORE=<키스토어> KS_PASS=<암호> ./build.sh
set -e
SDK="${SDK:?SDK 경로를 지정하세요}"
BT="$SDK/build-tools/36.0.0"
JAR="$SDK/platforms/android-36/android.jar"
rm -rf classes dexout assets *.apk res.flata classes.jar && mkdir -p classes dexout assets
cp ../app/* assets/
"$BT/aapt2" compile --dir res -o res.flata
"$BT/aapt2" link -o unsigned.apk -I "$JAR" --manifest AndroidManifest.xml -A assets res.flata \
  --min-sdk-version 26 --target-sdk-version 36
# 주의: 익명 내부 클래스는 build-tools 34.0.0의 d8이 크래시하므로 쓰지 않는다
javac -source 8 -target 8 -encoding UTF-8 -classpath "$JAR" -d classes src/com/yoonquelabs/foldnote/*.java
jar cf classes.jar -C classes .
"$BT/d8" --release --min-api 26 --lib "$JAR" --output dexout classes.jar
cd dexout && zip -q ../unsigned.apk classes.dex && cd ..
"$BT/zipalign" -f 4 unsigned.apk aligned.apk
"$BT/apksigner" sign --ks "${KEYSTORE:?}" --ks-pass "pass:${KS_PASS:?}" --out FoldNote.apk aligned.apk
"$BT/apksigner" verify FoldNote.apk && echo "FoldNote.apk 완성"
