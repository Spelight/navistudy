# NaviStudy

**把背词、刷题、精读与学业规划连接起来的学习平台。**

NaviStudy 从真实的课程复习需求出发，提供 Web 与微信小程序客户端。用户在本机练习和保存进度，通过 NaviPassport 登录后按产品同步学习数据。

[在线产品](https://study.dxir.net.cn/) · [架构说明](docs/architecture.md) · [本地运行](docs/getting-started.md) · [公开范围](docs/data-policy.md)

## 产品与实现

| 模块 | 用户能力 | 主要源码 |
| --- | --- | --- |
| NaviWords | 教材/单元选词、卡片、选择、拼写、收藏、错题、进度恢复 | `apps/words-web`、`packages/words-mini` |
| NaviMT | 分类题库、历史题筛选、错题复习、练习状态 | `apps/mt-web`、`packages/mt-mini` |
| NaviReading | 中英对照、词汇提示、书签、批注、阅读断点 | `apps/reading-web`、`packages/reading-mini` |
| NaviPlan | 培养方案、学分要求树、课程修正、选课建议 | `apps/plan` |
| NaviTools | 可用时间问卷、分享、填写与结果汇总 | `apps/tools` |
| NaviPassport | 账号、设备会话、授权、数据同步、管理与使用统计 | `apps/study-platform` |
| 微信客户端 | 主包导航与独立产品分包 | `apps/wechat` |

## 值得阅读的实现

- **共享身份，隔离数据**：各产品使用独立 scope 和同步文档；服务端检查产品权限。
- **可恢复的学习流程**：本地存储记录练习位置、错题与收藏，切换页面后继续学习。
- **授权码 + PKCE**：Web 产品建立独立会话，支持刷新、设备管理和撤销。
- **多端源码同步**：小程序模块在 `packages/` 或产品目录维护，通过脚本生成统一分包。
- **可解释的学分审计**：培养要求、课程池和个人修正分开建模；建议与缺口对应。
- **原创演示内容**：公开版带小型词表、四类练习题和五篇短阅读，便于查看数据结构与练习逻辑。

## 技术栈

JavaScript / TypeScript · React · Vite · PHP 8.2 · SQLite · Kotlin / Ktor · 微信原生小程序。

## 快速开始

需要 Node.js 22+。基础检查不需要安装依赖：

```sh
npm test
```

运行题库演示：

```sh
npm --prefix apps/mt-web ci
npm --prefix apps/mt-web run dev
```

运行词汇演示（需要 PHP）：

```sh
php -S 127.0.0.1:8788 -t apps/words-web
```

打开 `http://127.0.0.1:8788/`。词汇可本地练习；云同步需要另行配置 Passport。

微信开发者工具导入 `apps/wechat`；默认使用测试 AppID。完整运行条件与限制见[本地运行指南](docs/getting-started.md)。

## 公开版本说明

这是正式产品的代码展示版，独立维护公开提交历史。教材正文、扫描页、课程题库、生产配置、用户数据和内部运维档案不在发布范围。演示版不连接生产服务，默认域名为 `example.test`。

备考专项题库和教材原页核对需要自行提供已获授权的内容；公开样例不包含这些资料。NaviPlan 教务导入需要对应学校账号及可用的上游接口。

## 许可证

自有应用代码采用 [MIT](LICENSE)。第三方代码保留原许可证，见 [第三方说明](docs/third-party.md)。课程内容不随代码许可证发布。
