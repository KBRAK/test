#!/bin/sh
set -eu
# Official Tesseract fast language data, pinned to an immutable Git commit.
ocr_revision=87416418657359cb625c412a48b6e1d6d41c29bd
ocr_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ocr_temp=$(mktemp -d /tmp/zuhause-ocr-XXXXXX)
trap 'rm -rf "$ocr_temp"' EXIT HUP INT TERM
git -C "$ocr_temp" init --quiet
git -C "$ocr_temp" remote add origin https://github.com/tesseract-ocr/tessdata_fast.git
git -C "$ocr_temp" sparse-checkout set --no-cone /deu.traineddata /eng.traineddata
git -C "$ocr_temp" fetch --quiet --depth=1 --filter=blob:none origin "$ocr_revision"
git -C "$ocr_temp" checkout --quiet --detach FETCH_HEAD
test "$(git -C "$ocr_temp" rev-parse HEAD)" = "$ocr_revision"
git -C "$ocr_temp" fsck --no-dangling
mkdir -p "$ocr_root/data/ocr/tessdata"
cp "$ocr_temp/deu.traineddata" "$ocr_temp/eng.traineddata" "$ocr_root/data/ocr/tessdata/"
printf '%s\n' "$ocr_revision" > "$ocr_root/data/ocr/source-revision.txt"
printf '%s\n' 'Deutsche und englische OCR-Sprachdaten installiert.'
