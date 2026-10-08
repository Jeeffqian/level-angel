# Level Angel - Online 联机

## 文件说明
- `level-devil-game.html` — 游戏本体（单文件，单人/双人/Online 三种模式）
- `server.js` — WebSocket 服务器（联机必须）
- `node_modules/` — 依赖（ws 库，已安装）
- `package.json` / `package-lock.json` — 依赖声明

## 联机原理
- 服务器按加入顺序分配角色：第 1 个加入 = P1（红色，WASD），第 2 个 = P2（黄色，方向键）。
- 两名玩家输入实时同步，双方各自运行完整模拟，规则与双人模式一致。
- P1 先到显示 "等待 P2 加入..."；P2 加入后双方显示 3-2-1 倒计时开始。

## 一、本机运行（两台电脑同一局域网时）
1. 在服务器电脑上启动：
   ```
   node server.js
   ```
   （若 node 未全局安装，用 `nodejs-portable\node.exe server.js`）
2. 两台电脑浏览器都访问：`http://<服务器局域网IP>:3000`
   - 查服务器 IP：`ipconfig` 里的 IPv4 地址（如 192.168.1.100）
3. 点 "Online 模式" → 输入名字 → 加入。

## 二、跨互联网联机（不同网络）— 推荐 Cloudflare Tunnel（免费）
1. 电脑 A 上启动服务器：`node server.js`
2. 电脑 A 上另开一个终端，运行一次性隧道（无需注册即可用）：
   ```
   npx -y cloudflared tunnel --url http://localhost:3000
   ```
   会输出一个 `https://xxxx.trycloudflare.com` 地址。
3. 把这个 https 地址发给电脑 B，双方都用它访问，即可跨网联机。

   （注：`npx` 会临时下载 cloudflared，也可从 https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ 下载独立 exe。）

## 三、部署到免费云平台（永久在线，无需自己电脑开着）
把整个目录上传到 Render / Railway / Fly.io 等免费平台，启动命令 `node server.js`，
获得一个固定 https 域名，双方随时可玩。

## 常见问题
- **连不上**：确认服务器已启动、端口 3000 未被防火墙拦截。
- **P2 一直等待**：确认两人访问的是同一个服务器地址（同一个局域网 IP 或同一个隧道地址）。
- **倒计时不同步**：正常，网络延迟可能导致双方开始时间差几十毫秒。
