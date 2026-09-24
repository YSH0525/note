#!/usr/bin/env python3
"""받은 카드 그림을 앱에 넣을 수 있게 다듬는다.

  python3 tools/cards-photo-prep.py --names animals            # 이 카테고리에 필요한 파일명 보기
  python3 tools/cards-photo-prep.py --category animals a.png b.png ...   # 순서대로 이름 배정
  python3 tools/cards-photo-prep.py --name animals-dog puppy.png         # 한 장만

하는 일
  1. 흰(또는 크림) 배경을 가장자리에서 밀고 들어가며 투명하게 뺀다
     → 다크 모드에서 흰 사각형이 뜨지 않는다. 흰 토끼처럼 안쪽의 흰색은 남는다
  2. 대상만 남기고 여백을 잘라낸 뒤, 정사각형 가운데에 6% 여백을 두고 앉힌다
  3. 640×640 WebP 로 저장 (cards/img/)

필요: pip install Pillow
넣은 뒤에는 `node tools/cards-photos.mjs` 로 목록을 다시 쓴다.
"""
import argparse, os, re, sys
from collections import deque

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow 가 필요합니다: pip install Pillow")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "cards", "img")
SIZE = 640
MARGIN = 0.06          # 정사각형 안에서 남길 여백
BG_TOLERANCE = 22      # 이 정도까지는 배경과 같은 색으로 본다


def expected_names(category=None):
    """index.html 의 카드 데이터에서 기대되는 파일명을 순서대로 뽑는다."""
    html = open(os.path.join(ROOT, "cards", "index.html"), encoding="utf-8").read()
    body = html[html.index("const CATEGORIES = ["):]
    out = []
    for m in re.finditer(r'id: "([a-z]+)", name: "[^"]+".*?photos: true', body):
        cid = m.group(1)
        block = body[m.end(): body.find('\n  {', m.end()) if body.find('\n  {', m.end()) > 0 else len(body)]
        for en in re.findall(r'en: "([^"]+)"', block):
            slug = re.sub(r"[^a-z0-9]+", "-", en.lower())
            if category in (None, cid):
                out.append(f"{cid}-{slug}.webp")
    return out


def strip_background(im):
    """가장자리에서 이어지는 배경색만 투명하게 만든다 (안쪽 흰색은 건드리지 않는다).
    돌려주는 두 번째 값: "stripped"(뺐다) · "already"(이미 투명) · "kept"(배경이 밝지 않아 그대로)"""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    if all(c[3] < 16 for c in corners):   # API 가 투명 배경으로 준 그림 — 손대지 않는다
        return im, "already"
    base = tuple(sum(c[i] for c in corners) // 4 for i in range(3))
    if min(base) < 200:            # 배경이 밝지 않으면 손대지 않는다
        return im, "kept"

    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            q.append((x, y))
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        r, g, b, a = px[x, y]
        if abs(r - base[0]) > BG_TOLERANCE or abs(g - base[1]) > BG_TOLERANCE or abs(b - base[2]) > BG_TOLERANCE:
            continue
        px[x, y] = (r, g, b, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]:
                q.append((nx, ny))
    return im, "stripped"


def square(im):
    # 실제 그림 범위는 알파 채널로 잰다. 투명 픽셀이 (255,255,255,0) 처럼 색을 품고 있으면
    # 이미지 전체의 getbbox() 는 그 픽셀까지 그림으로 쳐서 여백이 안 잘린다
    box = im.getchannel("A").point(lambda a: 255 if a > 12 else 0).getbbox()
    if box:
        im = im.crop(box)
    w, h = im.size
    side = int(max(w, h) / (1 - MARGIN * 2))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - w) // 2, (side - h) // 2), im)
    return canvas.resize((SIZE, SIZE), Image.LANCZOS)


def prep(src, name):
    im = Image.open(src)
    im, how = strip_background(im)
    im = square(im)
    os.makedirs(OUT_DIR, exist_ok=True)
    dst = os.path.join(OUT_DIR, name)
    im.save(dst, "WEBP", quality=86, method=6)
    kb = os.path.getsize(dst) // 1024
    note = {"stripped": "배경 뺌", "already": "원래 투명", "kept": "배경 그대로 — 흰 배경이 아님"}[how]
    print(f"  {os.path.basename(src)} → {name}  ({kb}KB, {note})")


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--names", metavar="CATEGORY", nargs="?", const="", help="필요한 파일명만 출력")
    ap.add_argument("--category", help="이 카테고리의 카드 순서대로 이름을 붙인다")
    ap.add_argument("--name", help="파일 한 장에 쓸 이름 (확장자 없이도 된다)")
    ap.add_argument("files", nargs="*")
    a = ap.parse_args()

    if a.names is not None:
        for n in expected_names(a.names or None):
            print(n)
        return

    if a.name:
        if len(a.files) != 1:
            sys.exit("--name 은 파일 한 장에만 씁니다")
        name = a.name if a.name.endswith(".webp") else a.name + ".webp"
        if name not in expected_names():
            sys.exit(f"'{name}' 은 카드에 없는 이름입니다. --names 로 확인하세요")
        prep(a.files[0], name)
    elif a.category:
        want = expected_names(a.category)
        if not want:
            sys.exit(f"'{a.category}' 는 사진을 쓰는 카테고리가 아닙니다")
        if len(a.files) != len(want):
            sys.exit(f"{a.category} 는 {len(want)}장이 필요한데 {len(a.files)}장을 주셨습니다:\n  "
                     + "\n  ".join(want))
        for src, name in zip(a.files, want):
            prep(src, name)
    else:
        sys.exit("--category 또는 --name 을 쓰세요 (--names 로 목록 확인)")

    if not os.environ.get("CARDS_PREP_QUIET"):   # cards-generate.mjs 가 부를 땐 장마다 찍지 않는다
        print("\n다음: node tools/cards-photos.mjs && node tools/cards-check.mjs")


if __name__ == "__main__":
    main()
