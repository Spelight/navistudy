# NaviMT 军理通微信小程序

这是 `study.dxir.net.cn/mt/` 的原生微信小程序版本，交互和视觉参考同目录体系下的 NaviWords 小程序。

## 当前功能

- 内置 543 道军事理论题目，覆盖 6 个章节。
- 支持单选、多选、判断和简答题。
- 支持顺序练习、随机练习、按章节和题型筛选。
- 支持答题进度、错题本、收藏、继续上次和题库搜索。
- 学习数据保存在微信本地，可通过剪贴板导入、导出，也可使用 NaviStudy 通行证用户名与 `mt.dxir.net.cn` 网页版同步。
- 题目保留资料来源和历史题标识；旧题仅供练习。

## 使用方式

1. 打开微信开发者工具。
2. 导入目录：`D:\事务\服务器\军事理论\military-theory-wechat-miniprogram`。
3. 独立工程当前仍使用本地开发 AppID；正式发布以 NaviStudy 合并工程为准。
4. 题库与学习功能可离线运行；启用同步时须将 `https://mt.dxir.net.cn` 配置为 request 合法域名。

## 数据同步

- 共享身份键：`navi_passport_user`，兼容旧 `words_user`。
- 军理本地数据键：`military_theory_learning_v1`。
- 军理远端接口：`https://mt.dxir.net.cn/userdata.php`。
- 同步范围仅包含军理作答、错题、收藏、掌握状态、断点和练习记录，不触碰 NaviWords 数据。

## 更新题库

网站题库更新后，在本目录运行：

```powershell
npm run sync-data
```

脚本读取相邻网站工程的 `src/data/question-bank.json`，生成 `miniprogram/data/question-bank.js`。

## 测试

```powershell
npm test
```
