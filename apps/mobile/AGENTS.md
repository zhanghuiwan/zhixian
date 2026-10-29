This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## 真机热更新（2026-10-21）

- 日常改页面与 TypeScript/JavaScript 时优先 `npm run dev:android`；直接监听仓库源码，不复制到缓存，不反复构建／安装 APK。用户已授权建立这套真机开发流程。
- `npm run dev:android:install` 用于首次安装开发版及原生依赖／权限／app.json 改变后的重建；原生构建使用独立英文缓存 `~/.cache/zhixian-android-dev`。不得编辑缓存中的源码或生成的 android/ 文件。
- USB 断开重连或开发版重开时运行 `npm run dev:android:open`；脚本恢复 adb reverse 并打开当前 Metro。多设备通过 `ZHIXIAN_ANDROID_DEVICE` 指定，端口默认8081。
- 在完成普通界面修改后确认手机仍连接原目录的 Metro；开发版调试与 Fast Refresh 验证不需要读取用户对话、令牌、学习记录或清除 App 数据。
- `.command` 快捷入口供 macOS 双击使用。开发服务只监听 localhost，依赖 USB 转发；保持终端、电脑和数据线连接。现有 build:android:apk 仍用于独立内测包。

- 启动脚本默认清理电脑Metro转换缓存并冷连接，避免旧HMR修订。open重连会受控重启手机开发进程（保留持久化数据），不要向存活开发运行时反复发送深链；本机曾因此观测到Fabric原生崩溃。普通源码编辑不要调用open或重建，让Fast Refresh直接更新。
