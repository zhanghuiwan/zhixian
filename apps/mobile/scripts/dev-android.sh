#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/android-dev-env.sh"
zhixian_select_device
if [[ "${1:-}" == '--open' ]]; then
  # Only checks a local Metro health response; never reads app/account contents.
  node -e 'fetch("http://127.0.0.1:"+process.argv[1]+"/status").then(async r=>{if((await r.text())!=="packager-status:running")process.exit(1)}).catch(()=>process.exit(1))' "$zhixian_port" || { echo '请先运行 npm run dev:android 启动开发服务。' >&2; exit 1; }
  zhixian_open_device
  exit 0
fi
# Refuse to stop or take over an unrelated process on this port.
if lsof -nP -iTCP:"$zhixian_port" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "端口 $zhixian_port 已被占用。若已开启知闲开发服务，运行 npm run dev:android:open 重新连接手机；否则设置 ZHIXIAN_DEV_PORT 使用其他端口。" >&2
  exit 1
fi
if ! adb -s "$zhixian_serial" shell run-as "$zhixian_package" id >/dev/null 2>&1; then
  echo '当前手机尚未安装可调试版本，先构建并覆盖安装一次…'
  bash "$zhixian_app_dir/scripts/build-android-dev.sh"
fi
adb -s "$zhixian_serial" reverse "tcp:$zhixian_port" "tcp:$zhixian_port" >/dev/null
cd "$zhixian_app_dir"
echo '开发服务直接监听当前仓库。修改并保存 src/ 或 assets/ 后手机会自动刷新。'
echo '请保持此终端运行和 USB 连接。退出按 Ctrl+C；重新插线后运行 npm run dev:android:open。'
# macOS resolves localhost to IPv6 first; use IPv4 so adb reverse and the manifest agree.
# Clear only the JS transform cache at session startup; never clear phone data.
# A fresh bundle prevents a restarted Metro from reusing a stale HMR revision.
zhixian_metro_args=(start --dev-client --localhost --port "$zhixian_port" --clear)
node --dns-result-order=ipv4first ./node_modules/expo/bin/cli "${zhixian_metro_args[@]}" &
zhixian_metro_pid=$!
trap 'kill "$zhixian_metro_pid" 2>/dev/null || true' EXIT
trap 'exit 130' INT TERM
zhixian_ready=false
for ((zhixian_try=0; zhixian_try<60; zhixian_try++)); do
  if ! kill -0 "$zhixian_metro_pid" 2>/dev/null; then wait "$zhixian_metro_pid"; exit 1; fi
  if node -e 'fetch("http://127.0.0.1:"+process.argv[1]+"/status").then(async r=>{if((await r.text())!=="packager-status:running")process.exit(1)}).catch(()=>process.exit(1))' "$zhixian_port"; then zhixian_ready=true; break; fi
  sleep 1
done
if [[ "$zhixian_ready" != true ]]; then echo '开发服务未能在60秒内就绪，请查看上方错误。' >&2; exit 1; fi
zhixian_open_device
wait "$zhixian_metro_pid"
