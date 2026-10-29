# 知闲 Android

知闲移动端使用 Expo SDK 57、React Native 0.86 和 Expo Router。初版直接复用生产后端 `https://zhixian.zhanghuiwan.com/api/v1`，账号、学习记录、词书、生词和文章会与 Web 端同步。

## 已实现

- 白灰黑与少量灰绿、浅深双主题与跟随系统
- 学习｜闲闲｜我的三入口，原角色 PNG、浮动玻璃导航与滚动弹层
- 本机外观与陪伴设置，减少动态及透明效果回退

- AI 对话主页与 DeepSeek / MiniMax 用户级配置
- 系统词书、个人词书、当前词书切换；个人词书支持详情、批量加词和移词
- 三档评分、0–100 熟悉度、快速左右滑动、分轮巩固
- 未完成学习组本地恢复，全部通过后整组批量提交；提交快照固定并可安全重试
- 文章列表、阅读位置恢复、逐句翻译、点词查义、发音、生词与句子收藏、文章上下文问 AI
- 学习月历、每日词书/单词/文章概况
- AI 回复操作可直接完成加词、收藏句子和保存文章，并显示结果
- SecureStore 加密保存登录令牌，令牌失效时自动清理账号状态并返回登录页

## 本地开发

```bash
cd apps/mobile
npm ci
cp .env.example .env.local
npm start
```

`.env.local` 可覆盖 API 地址。Android 模拟器访问宿主机服务时通常使用 `http://10.0.2.2/api/v1`；真机联调本地后端时改为电脑的局域网地址。未配置时自动连接生产 HTTPS API。

## 检查

```bash
npm run check
```

该命令依次运行 ESLint、TypeScript、Vitest 和 Expo Doctor。当前 17 项移动端测试覆盖学习分轮与固定提交快照、AI 操作 payload 校验，以及普通请求和 SSE 的 401 状态同步。

## 构建可安装 APK

Android 原生目录由 Expo CNG 临时生成，不提交 Git。在 Mac 上直接运行：

```bash
npm run build:android:apk
```

脚本会使用固定的英文临时目录，绕过 React Native 原生工具对中文路径兼容不完整的问题。内部测试包输出到 `dist/zhixian-android-v<版本>.apk`。当前 CNG 工程的 Release 变体使用调试证书签名，只用于真机内测。连接已开启 USB 调试的 Android 真机后可运行：

```bash
adb devices
adb install -r dist/zhixian-android-v0.3.1.apk
```

调试包用于当前内测。上架前需要建立正式签名、隐私政策、应用商店资料，并生成 AAB 发布包。

## 当前界面与学习流程（0.3.1）

主页保留闲闲角色、当前回复气泡与输入入口，移除新学／复习双快捷入口；学习任务归入学习页。底栏仅显示学习、梧桐叶闲闲、我的三个图标。浅色为纯白画布，深色保留中性灰；离开闲闲页再返回时显示默认主页，旧消息保留在独立历史面板。背单词卡片先回想再揭示，底部不记得0、模糊50、熟悉90，滑杆默认50、步长5，松手提交。列表模式点行展开，右滑不记得、左滑熟悉，支持按钮替代操作；未达80进入下一轮，进度按轮重置，全部完成后统一提交。旧version1草稿兼容，失败重试固定提交快照。学习轮次与提交逻辑的回归由本目录Vitest测试覆盖；2026-10-24在vivo V2405A验证了独立启动、用户登录、冷重开保留登录和系统新图标显示，未将这项检查作为全部业务流程验收。

## 日常真机开发：保存即刷新

连接并授权一台Android手机，在本目录执行 `npm run dev:android`，或在Mac双击 `启动安卓开发.command`。首次自动安装开发版，以后只启动原项目的Metro和USB转发；修改源码保存即可Fast Refresh。保持电脑、开发终端与USB连接。

- 重新插线／重开手机开发版：`npm run dev:android:open`。
- 原生依赖、权限或配置发生变化：`npm run dev:android:install`。
- 独立运行内测包继续使用 `npm run build:android:apk`。

构建缓存和日常源码监听分开，避免中文路径的原生编译问题。不要修改 `~/.cache/zhixian-android-dev`。开发版依赖电脑Metro和USB；独立包将JS和资源嵌入APK，手机联网即可访问云端。两种包使用同一包名，覆盖安装保留本机数据，但会替换当前版本；再次运行dev命令会切回开发版。不要为解决连接问题卸载App或清除数据。

## 版本与源码发布

当前0.3.1(5)，App图标为用户提供的书与光PNG。Git只保存源码、锁文件、项目资产及构建脚本；APK、node_modules、原生生成目录、构建缓存和本地环境文件不进入仓库。构建／开发脚本禁用自动读取.env，如需切换公开API地址，显式设置EXPO_PUBLIC_API_URL。

独立包默认构建全部架构；可设置 `ZHIXIAN_ANDROID_ARCHITECTURES=arm64-v8a npm run build:android:apk` 仅生成适用于当前手机的包。Mac需要JDK17及Android SDK，构建缓存位于 `~/.cache/zhixian-android-build` 或同名前缀目录。此版本使用内测签名，不代表已配置应用商店正式签名或远程更新通道。

2026-10-29源码发布准备：按Expo Doctor兼容要求对齐SDK57补丁（expo57.0.31、@expo/ui57.0.26、expo-router57.0.29），重新锁定依赖。业务界面源码不变；本次未覆盖手机上2026-10-24安装的包。
