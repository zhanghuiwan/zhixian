#!/usr/bin/env bash

set -euo pipefail

app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build_dir="${ZHIXIAN_ANDROID_BUILD_DIR:-$HOME/.cache/zhixian-android-build}"
output_dir="$app_dir/dist"

# rsync --delete may only target our disposable build cache.
case "$build_dir" in "$HOME"/.cache/zhixian-android-build|"$HOME"/.cache/zhixian-android-build-*) ;; *) echo '构建目录必须位于 ~/.cache/zhixian-android-build 或同名前缀目录。' >&2; exit 1;; esac

if [[ -z "${JAVA_HOME:-}" ]]; then
  export JAVA_HOME="$(/usr/libexec/java_home -v 17)"
fi
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
export NODE_ENV=production
export EXPO_NO_DOTENV=1

for command in node npm npx rsync; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "缺少命令：$command" >&2
    exit 1
  fi
done

if [[ ! -x "$JAVA_HOME/bin/java" ]]; then
  echo "JAVA_HOME 无效：$JAVA_HOME" >&2
  exit 1
fi
if [[ ! -d "$ANDROID_HOME" ]]; then
  echo "ANDROID_HOME 不存在：$ANDROID_HOME" >&2
  exit 1
fi

mkdir -p "$build_dir" "$output_dir"

# React Native 的部分原生工具无法可靠处理包含中文的工程路径，因此同步到固定的 ASCII 路径构建。
rsync -a --delete --delete-excluded \
  --exclude '/android/' \
  --exclude '/ios/' \
  --exclude '/dist/' \
  --exclude '/.expo/' \
  --exclude '.env*' \
  "$app_dir/" "$build_dir/"

cd "$build_dir"
if [[ ! -d node_modules ]]; then
  npm ci
fi

npx expo prebuild --platform android --clean --no-install
(
  cd android
  gradle_args=(assembleRelease)
  if [[ -n "${ZHIXIAN_ANDROID_ARCHITECTURES:-}" ]]; then
    case "$ZHIXIAN_ANDROID_ARCHITECTURES" in arm64-v8a|armeabi-v7a|x86|x86_64) ;; *) echo '请选择一个有效的 Android CPU 架构，或留空构建全部架构。' >&2; exit 1;; esac
    gradle_args+=("-PreactNativeArchitectures=$ZHIXIAN_ANDROID_ARCHITECTURES")
  fi
  ./gradlew "${gradle_args[@]}"
)

version="$(node -p "require('./package.json').version")"
apk_name="zhixian-android-v${version}.apk"
cp "android/app/build/outputs/apk/release/app-release.apk" "$output_dir/$apk_name"

echo "APK 已生成：$output_dir/$apk_name"
shasum -a 256 "$output_dir/$apk_name"
