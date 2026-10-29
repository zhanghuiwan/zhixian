#!/usr/bin/env bash
# Shared by the USB development commands. Source this file; do not run it directly.
set -euo pipefail
zhixian_app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
export EXPO_NO_DOTENV=1
export NODE_ENV=development
zhixian_package="com.zhanghuiwan.zhixian"
zhixian_port="${ZHIXIAN_DEV_PORT:-8081}"
case "$zhixian_port" in ''|*[!0-9]*) echo 'ZHIXIAN_DEV_PORT 必须是数字端口。' >&2; exit 1;; esac
if (( zhixian_port < 1024 || zhixian_port > 65535 )); then echo '开发端口范围为1024–65535。' >&2; exit 1; fi
for zhixian_command in node npm npx adb; do
  command -v "$zhixian_command" >/dev/null || { echo "缺少命令：$zhixian_command" >&2; exit 1; }
done
zhixian_select_device() {
  local available count
  available="$(adb devices | awk 'NR>1 && $2=="device" {print $1}')"
  if [[ -n "${ZHIXIAN_ANDROID_DEVICE:-}" ]]; then
    if ! echo "$available" | grep -Fxq "$ZHIXIAN_ANDROID_DEVICE"; then echo '指定手机未连接或未授权 USB 调试。' >&2; exit 1; fi
    zhixian_serial="$ZHIXIAN_ANDROID_DEVICE"
  else
    count="$(echo "$available" | awk 'NF {n++} END {print n+0}')"
    if [[ "$count" != 1 ]]; then
      echo '请连接并授权一台手机；多台设备时通过 ZHIXIAN_ANDROID_DEVICE 指定 adb 设备编号。' >&2
      adb devices -l
      exit 1
    fi
    zhixian_serial="$available"
  fi
}
zhixian_open_device() {
  adb -s "$zhixian_serial" reverse "tcp:$zhixian_port" "tcp:$zhixian_port" >/dev/null
  # Reconnecting must reset both the inspector and HMR websocket. Merely seeing
  # an inspector target does not prove HMR survived a USB/server disconnect.
  # Stop the old process before the deep link to avoid tearing down a live Fabric surface.
  local launch_url
  launch_url="$(node -e 'console.log("exp+zhixian://expo-development-client/?url=" + encodeURIComponent("http://127.0.0.1:" + process.argv[1]))' "$zhixian_port")"
  # Stop an orphaned dev runtime before replacing it; this does not clear app data.
  adb -s "$zhixian_serial" shell am force-stop "$zhixian_package"
  adb -s "$zhixian_serial" shell am start -W -a android.intent.action.VIEW -d "$launch_url" "$zhixian_package"
}
