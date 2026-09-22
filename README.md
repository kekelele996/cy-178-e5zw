# gb-178 信件驿站

匿名写信、收信和回信的前后端分离应用。

## Docker Compose 一键启动

```bash
cp .env.example .env
docker compose up -d --build
```

访问地址：

- 前端：http://localhost:8178
- 后端健康检查：http://localhost:9178/health
- SQLite 占位端口：10178

停止服务：

```bash
docker compose down
```

## 主要功能

- 笔名注册、登录和 JWT 鉴权
- 匿名投递信件
- 查看发出的、收到的、待转投的和持续对话
- 收藏、跳过、回复信件
- 限时转投：收信人 72 小时内未回复也未跳过，信件自动退回寄件人的「待转投」区

## 限时转投规则

- 收信人有 **72 小时**处理一封新信（回复或跳过）。
- 超过 72 小时既未回复也未跳过：信件自动进入寄件人的「待转投」区，
  **正文保留、收信信息隐藏**；原收信人的收藏与所有操作入口立即作废。
- 寄件人可在待转投区**修改正文后转投一次**（也可不改正文直接转投，或撤回永久关闭）；
  转投后重新计时 72 小时，且不会投回寄件人本人或上一位收信人。
- 寄件人一旦**撤回**，信件永久关闭。
- 转投过的信若再次超时，自动永久关闭——转投全程只有一次。
- 过期操作、重复转投、回复/跳过/撤回等同时到达的请求，通过数据库条件更新保证
  **只有一个成功结果**（失败方得到 409/410）。

## 本地开发

后端：

```bash
cd backend
npm install
npm run dev
```

前端：

```bash
cd frontend
npm install
npm run dev
```

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | React, Vite |
| 后端 | Node.js, Express |
| 数据 | SQLite, better-sqlite3 |
| 部署 | Docker Compose, Nginx |

## 目录结构

```text
.
├── backend/
├── frontend/
├── docker-compose.yml
├── .env
├── .env.example
└── README.md
```

## 环境变量

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| COMPOSE_PROJECT_NAME | Compose 项目名 | gb-178 |
| FRONTEND_PORT | 前端宿主机端口 | 8178 |
| BACKEND_PORT | 后端宿主机端口 | 9178 |
| DB_PORT | SQLite 占位端口 | 10178 |
| DB_NAME / DB_USER / DB_PASSWORD / DB_ROOT_PASSWORD | 统一数据库配置键 | letter_pigeon 等 |
| JWT_SECRET | JWT 签名密钥 | change_me |
| REPLY_WINDOW_MS | 收信处理时限（毫秒），默认 72 小时 | 259200000 |
| SWEEP_INTERVAL_MS | 后台到期扫描间隔（毫秒） | 60000 |

## Docker 部署说明

项目实际使用 SQLite，数据文件保存在命名卷 `sqlite_data`。前端生产环境通过 Nginx 把 `/api/` 代理到后端容器，不依赖硬编码 localhost。`DB_PORT` 由后端内置占位 TCP 服务绑定，仅用于满足端口规划。

## License

MIT
