#!/bin/sh
# 폴드노트 AAB 빌드 (Gradle 없이 SDK 도구 + bundletool 만 사용)
#
# 사용법:
#   SDK=<android-sdk 경로> BUNDLETOOL=<bundletool.jar> \
#   KEYSTORE=<키스토어> KS_PASS=<암호> ./build-aab.sh
#
# KEYSTORE 를 주지 않으면 서명 없이 unsigned.aab 까지만 만든다.
# 플레이 업로드에는 서명이 필요하다.
set -e
SDK="${SDK:?SDK 경로를 지정하세요}"
BT="$SDK/build-tools/36.0.0"
JAR="$SDK/platforms/android-36/android.jar"
BUNDLETOOL="${BUNDLETOOL:?bundletool.jar 경로를 지정하세요}"
VER=$(sed -n 's/.*android:versionName="\([^"]*\)".*/\1/p' AndroidManifest.xml)

rm -rf classes dexout assets protoout bundle base.zip proto.apk res.flata classes.jar \
       unsigned.aab "FoldNote-$VER.aab"
mkdir -p classes dexout assets

# 주의: app/ 아래 하위 디렉터리는 이 복사에서 누락된다 (브랜드 자산을 루트 brand/ 에 둔 이유)
cp ../app/* assets/

"$BT/aapt2" compile --dir res -o res.flata
# APK 와 달리 --proto-format 으로 링크해야 번들 재료가 된다
"$BT/aapt2" link --proto-format -o proto.apk -I "$JAR" \
  --manifest AndroidManifest.xml -A assets res.flata \
  --min-sdk-version 26 --target-sdk-version 36

# 주의: 익명 내부 클래스는 d8 이 크래시한 이력이 있으므로 쓰지 않는다
javac -source 8 -target 8 -encoding UTF-8 -classpath "$JAR" -d classes src/com/yoonquelabs/foldnote/*.java
jar cf classes.jar -C classes .
"$BT/d8" --release --min-api 26 --lib "$JAR" --output dexout classes.jar

# proto.apk 를 풀어서 번들 모듈 배치로 옮긴다
mkdir -p protoout && cd protoout && unzip -q ../proto.apk && cd ..
mkdir -p bundle/manifest bundle/dex
mv protoout/AndroidManifest.xml bundle/manifest/
mv protoout/resources.pb bundle/
[ -d protoout/res ] && mv protoout/res bundle/
[ -d protoout/assets ] && mv protoout/assets bundle/
cp dexout/classes.dex bundle/dex/

cd bundle && zip -qr ../base.zip . && cd ..
java -jar "$BUNDLETOOL" build-bundle --modules=base.zip --output=unsigned.aab

if [ -n "$KEYSTORE" ]; then
  jarsigner -keystore "$KEYSTORE" -storepass "${KS_PASS:?}" \
    -signedjar "FoldNote-$VER.aab" unsigned.aab "${KS_ALIAS:-foldnote}"
  java -jar "$BUNDLETOOL" validate --bundle "FoldNote-$VER.aab" > /dev/null
  # 설치 가능한 APK 로 뽑히는지까지 확인한다
  java -jar "$BUNDLETOOL" build-apks --bundle "FoldNote-$VER.aab" --output=check.apks \
    --mode=universal --overwrite --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" \
    --ks-key-alias "${KS_ALIAS:-foldnote}" --key-pass "pass:$KS_PASS" > /dev/null
  echo "FoldNote-$VER.aab 완성 (검증 통과)"
else
  echo "unsigned.aab 완성 — 서명하려면 KEYSTORE 와 KS_PASS 를 주세요"
fi
