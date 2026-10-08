const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const ROOM = 'main';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/level-devil-game.html';
  const filePath = path.join(__dirname, urlPath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

const players = new Map();

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const ws of wss.clients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

function state() {
  return {
    type: 'state',
    players: Array.from(players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role
    }))
  };
}

wss.on('connection', (ws) => {
  ws.id = 'p' + Date.now() + Math.floor(Math.random() * 1000);
  ws.name = '';
  ws.role = null;

  ws.send(JSON.stringify({ type: 'welcome', id: ws.id }));
  broadcast(state());

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      return;
    }

    if (msg.type === 'join') {
      if (ws.role) return;
      ws.name = (msg.name || '').slice(0, 16) || ('玩家' + (players.size + 1));
      if (players.size === 0) ws.role = 'p1';
      else if (players.size === 1) ws.role = 'p2';
      else return;
      players.set(ws.id, { id: ws.id, name: ws.name, role: ws.role });
      broadcast(state());
      ws.send(JSON.stringify({ type: 'role', role: ws.role }));
      if (players.size === 2) {
        broadcast({ type: 'countdown' });
      }
      return;
    }

    if (msg.type === 'input') {
      const pl = players.get(ws.id);
      if (!pl) return;
      broadcast({
        type: 'input',
        id: ws.id,
        keys: msg.keys || {}
      });
      return;
    }

    if (msg.type === 'finished') {
      broadcast({ type: 'finished', id: ws.id });
      return;
    }

    if (msg.type === 'start' || msg.type === 'ready') {
      broadcast({ type: msg.type, id: ws.id });
      return;
    }
  });

  ws.on('close', () => {
    if (players.has(ws.id)) {
      players.delete(ws.id);
      broadcast(state());
    }
  });
});

server.listen(PORT, () => {
  console.log('Level Angel server running on http://localhost:' + PORT);
  console.log('Players connect and enter the same room to play.');
});
