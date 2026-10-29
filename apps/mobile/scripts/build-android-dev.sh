#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/android-dev-env.sh"
zhixian_select_device
if [[ -z "${JAVA_HOME:-}" ]]; then export JAVA_HOME="$(/usr/libexec/java_home -v 17)"; fi
[[ -x "$JAVA_HOME/bin/java" ]] || { echo '需要可用的 JDK 17。' >&2; exit 1; }
zhixian_build_dir="${ZHIXIAN_ANDROID_DEV_BUILD_DIR:-$HOME/.cache/zhixian-android-dev}"
# Never sync into the source project or an arbitrary directory.
case "$zhixian_build_dir" in "$HOME"/.cache/zhixian-android-dev|"$HOME"/.cache/zhixian-android-dev-*) ;; *) echo '开发构建目录必须位于 ~/.cache/zhixian-android-dev 或同名前缀目录。' >&2; exit 1;; esac
zhixian_abi="$(adb -s "$zhixian_serial" shell getprop ro.product.cpu.abi | tr -d '\r')"
case "$zhixian_abi" in arm64-v8a|armeabi-v7a|x86|x86_64) ;; *) echo '无法识别手机 CPU 架构。' >&2; exit 1;; esac
mkdir -p "$zhixian_build_dir" "$zhixian_app_dir/dist"
rsync -a --delete \
  --exclude '/node_modules/' --exclude '/android/' --exclude '/ios/' \
  --exclude '/dist/' --exclude '/.expo/' --exclude '.env*' \
  --exclude '/.dependency-lock' \
  "$zhixian_app_dir/" "$zhixian_build_dir/"
if [[ ! -d "$zhixian_build_dir/node_modules" ]] || ! cmp -s "$zhixian_app_dir/package-lock.json" "$zhixian_build_dir/.dependency-lock"; then
  echo '同步 SDK 兼容依赖到英文构建目录（仅依赖变化时执行）…'
  rsync -a --delete --exclude '.cxx/' --exclude '/.cache/' --exclude 'android/build/' \
    "$zhixian_app_dir/node_modules/" "$zhixian_build_dir/node_modules/"
  cp "$zhixian_app_dir/package-lock.json" "$zhixian_build_dir/.dependency-lock"
fi
cd "$zhixian_build_dir"
npx expo prebuild --platform android --clean --no-install
(cd android && ./gradlew assembleDebug "-PreactNativeArchitectures=$zhixian_abi")
zhixian_apk="$zhixian_app_dir/dist/zhixian-android-dev.apk"
cp android/app/build/outputs/apk/debug/app-debug.apk "$zhixian_apk"
adb -s "$zhixian_serial" install -r "$zhixian_apk"
echo '开发版已覆盖安装，未清除应用数据。日常运行 npm run dev:android；新增原生依赖后再运行 npm run dev:android:install。'
