# NaviStudy 微信小程序

NaviStudy 将 NaviWords 与 NaviMT 放在同一个微信小程序中。启动后先进入 NaviStudy 选择页，再进入对应学习模块。两个模块共用一个通行证用户名，但功能和学习数据相互独立。

## 工程结构

- 主包：NaviStudy 入口页。
- `words/` 分包：由 NaviWords 独立小程序同步生成。
- `mt/` 分包：由 NaviMT 独立小程序同步生成。
- 通行证用户名使用共享键 `navi_passport_user`，并兼容迁移旧键 `words_user`。
- NaviWords 数据使用 `words_learning_data`，NaviMT 数据使用 `military_theory_learning_v1`，不共享进度、错题或收藏。
- 远端同样按产品分开保存：Words 使用 `words.dxir.net.cn`，MT 使用 `mt.dxir.net.cn`。

## 本地使用

1. 在微信开发者工具中导入：`D:\事务\服务器\NaviStudy-wechat-miniprogram`。
2. 工程已配置 NaviStudy AppID；发布前仍需确认开发者工具登录账号和小程序主体正确。
3. 如需使用两个模块的数据同步，需要在小程序后台配置 request 合法域名：`https://words.dxir.net.cn` 和 `https://mt.dxir.net.cn`。

## 通行证边界

- 用户在任一模块保存用户名后，另一模块会直接读取同一个用户名。
- “拉取”和“上传”只处理当前模块的数据，不会读取或覆盖另一模块的数据。
- 当前通行证是便捷的用户名同步协议，不是带密码的安全账号系统；不要使用敏感信息作为用户名。

## 同步模块

两个独立小程序更新后运行：

```powershell
npm run sync-modules
```

不要直接修改生成的 `miniprogram/words/` 和 `miniprogram/mt/`；修改应回到对应独立工程，再重新同步。

## 验证

```powershell
npm test
```
