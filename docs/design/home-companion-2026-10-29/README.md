# 闲闲主页情境陪伴 · 2026-10-29

适用平台：Android / Expo SDK 57。状态：已实现并通过隔离界面验证；新增姿态基于已确认身份延展，单张图尚未获得用户逐一确认。最终交付于2026-10-30。不涉及后端、迁移或部署。

## 可见行为

- 主页保留安静的单角色展示，7种姿态：陪伴、招手、思考、阅读、伸懒腰、休息、撑伞。点击角色同时切换动作与话题，避免连续重复。单次1.1–2.1秒的轻微位移、旋转、呼吸与200ms换图淡入；不是骨骼、口型或逐帧肢体动画。
- 43条本地英语学习话题；点击气泡只填入输入框并聚焦，明确点击发送后才请求AI。发送有同步防重，当前回答保留供阅读，离开后回主页，历史入口仍可查询。
- 空闲时每28–46秒自动切换。输入、键盘、发送、设置、历史、当前AI回答、页面离开及后台期间暂停；减少动态效果后停止自动切换及transform动画，保留手动切换。关闭陪伴隐藏角色但保留可点击话题，不留下角色占位。
- 时间读取设备本地时间；心情由用户选择，不推断心理状态。陪伴设置支持随心／平静／开心／专注／有点累。情境增加合适候选，不强制每次只出现一种姿态。
- 城市由用户主动搜索选择，不请求定位。未选城市不调用天气。天气超时、失败、过期、未知代码一律回到未知，不编造晴雨。城市与心情仅保存在本机；切换城市、后台取消及旧响应不会覆盖新状态。

## 来源和视觉边界

用户于2026-10-29要求使用子agent分工；本次分为素材、情境与天气、动效与独立审查三个子任务。沿用当前完整绿色树冠、暖木身体、两只叶片手和两只脚，不在深色主题重新着色。

旧小程序参考路径（开发机历史来源，不构成运行依赖）：

- `miniprogram/pages/home/index.js:232–241` 点击状态；`979–1027` 随机动作和28–46秒对白节奏。
- `miniprogram/utils/companion-scenes.js:71–96` 时间场景。
- `miniprogram/components/mascot/index.js:3–17,68–70` 状态／动作分离。
- 原仓库位置：`/Users/tom/zhanghuiwan/260613`。移植保留随机和点击填入，省去高频游走，避免输入时干扰。

图片生成提示与来源见 [asset-prompts.json](asset-prompts.json)，RGBA资产与哈希见 [manifest.json](../../../apps/mobile/assets/xianxian/actions/manifest.json)。素材已复制进App，不依赖项目外路径。完整视觉样本见 [动作总览](action-contact-sheet.png) 和 [界面画廊](index.html)。

## 实际验证

- `npm ci`；`npm run check`：lint、TypeScript、38项测试通过；Expo Doctor 21/21通过。
- 单元覆盖时间边界、候选去重、天气未知／缓存／超时／取消／竞态、前后台恢复、情境暂停与恢复。
- React Native Web隔离账号验证：点击切换、话题填入且请求数为0、明确发送SSE与双击仅1次请求、保留当前回答与历史、设置持久化、搜索失败／无结果、天气失败重试／移除城市、草稿暂停与跨tab保留、320×640深色无横向溢出、390×844浅色、关闭陪伴、减少动态。详见 [verification-ui.json](verification-ui.json)。
- 公开天气服务以示例城市上海做无账号只读请求：地理编码与天气均HTTP200；当前观测年龄约2分钟。所有App界面聊天验证仅访问本地夹具，无真实AI调用或账号内容。
- arm64 Release构建成功（3分1秒），APK版本0.3.2(6)；内嵌JS已确认连接生产HTTPS API，未包含夹具URL，不依赖Metro。
- APK SHA256：`98efbf748957513e5b08a63d64500f2d0c41338e90fde802cda73492a65fa558`。构建产物不进入Git，位于 `apps/mobile/dist/zhixian-android-v0.3.2.apk`。
- 本轮未检测到USB手机，因此尚未复验原生触控、系统键盘、安全区域、原生字号放大和耗电。浏览器不能代替这些验收；连接手机后可安装上述独立包继续核对，不清除数据。
- 独立审查发现的后台停播、输入期情境更新、设置页天气取消后恢复3处问题均已修复并复核，未发现剩余P1/P2。
- 本次仅改Android，不重跑无改动的Web/API测试；GitHub PR的全项目CI另行核对。

## 重现隔离预览

在 `apps/mobile`：

```sh
EXPO_NO_DOTENV=1 EXPO_PUBLIC_API_URL=http://127.0.0.1:8085/api/v1 ./node_modules/.bin/expo export --platform web --output-dir dist/home-preview
node scripts/preview-home.cjs
```

打开 `http://127.0.0.1:8085/?fresh=1&theme=light&hour=9&motion=full&weather=rain&city=1&mood=auto`。可替换 theme=dark、hour=23、motion=reduced、weather=error、city=0。`fast=1`仅在夹具中将28–46秒计时缩短20倍，不修改生产时序。服务器只监听127.0.0.1，使用虚构账号，阻断外部fetch，天气与SSE均本地模拟，不代理生产请求。不要将此夹具作为生产服务。

## 外部技术资料

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)、[expo-image](https://docs.expo.dev/versions/v57.0.0/sdk/image/)
- [React Native Animated](https://reactnative.dev/docs/0.86/animated)、[AppState](https://reactnative.dev/docs/0.86/appstate)、[AccessibilityInfo](https://reactnative.dev/docs/0.86/accessibilityinfo)
- [Open-Meteo天气接口与WMO代码](https://open-meteo.com/en/docs)、[地理编码](https://open-meteo.com/en/docs/geocoding-api)、[服务条款](https://open-meteo.com/en/terms)

界面保留Open-Meteo署名入口；免费接口用于当前个人非商业教育验证，商业分发前需复核服务许可与配额。该约束只写入开发文档，不在主页增加提示文字。
