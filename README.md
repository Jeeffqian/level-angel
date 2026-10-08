# Level Angel

12 关陷阱平台跳跃游戏，含单人 / 同屏双人 / 在线联机。

## 运行方式
- **在线网站**：`https://jeeffqian.github.io/level-angel/`
- **本地运行**：直接双击 `level-devil-game.html` 即可玩单人/双人；在线联机用 PeerJS P2P 直连，无需服务器。

## 在线联机（P2P，不需要服务器）
联机使用 PeerJS 点对点连接，通过 PeerJS 公共信令服务器匹配，玩家浏览器之间直连。

1. 打开网站，点 "Online 模式"
2. 输入名字
3. **创建房间**：生成房间码，复制发给朋友
4. **加入房间**：朋友输入房间码即可进入
5. 双方各自用 P1（红, WASD）或 P2（黄, 方向键）游玩

## 关卡
12 关：基础移动 → 时空洞 → 追逐 → 反出口 → 攀升 → 移动平台 → 消失平台 → 传送门 → 重力反转 → 双移动平台 → 反向控制 → 冰面。

## 游戏
- `level-devil-game.html` — LEVEL ANGEL 主游戏
- `europe-map.html` — 欧罗巴地图策略（2~3 人 P2P 联机）
- `peerjs.min.js` — P2P 联机库

## 文件
- `index.html` — 游戏合集首页
- `百数表.html` 等 — 其他小游戏