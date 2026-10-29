# 移动端资产与来源

资产随源码保存，不依赖项目外的绝对路径。

- `xianxian/neutral.png`：用户批准的闲闲身份静态延展，源于工作区角色资产 `assets/wutong/handbook/images/xianxian-neutral-alpha.png`。SHA-256：`174c4787f742ba972b56ba68e8c3f835911c673a57490075a60b15e417a86d39`。不得用图标替换完整角色身份。
- `images/app-icon-book-light.png`：用户于2026-10-24提供并明确采用的书与光图，原1254×1254等比导出1024×1024。生产SHA-256：`4dc4b073edc8dee41a45344ba007a0e501e12cc203a2b1efda40237785d55b0c`。旧icon、自适应角色前景和单色资源保留历史，当前App图标配置不引用它们。
- `images/wutong-leaf-miniprogram.png`：用户指定的小程序 `miniprogram/assets/icons/home-active-v2.png`，来源提交 `1ea6bb920847c47b3a43498a50bf5188a0d0f047`，81×81透明PNG原样复制。
- `icons/*.png`：统一功能图标，源SVG、映射及导出脚本随此提交保存；通过运行主题着色。见本目录 `icons/README.md`。
- `icons/wutong-tab-line.png`：内置图像生成工具参考学习／我的图标生成的简洁梧桐叶，用于底栏。`icons/xianxian-tab-line.png` 为用户认可的角色简笔素材，已撤出导航，保留备用。
- `images/generated/`：历史图像生成素材及缩放版本；来源说明见目录内README。当前保留素材不代表界面正在使用。
