const path = require('path');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server);

const dbPath = path.join(__dirname, 'database', 'app.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Could not open database', err);
  } else {
    console.log('Connected to', dbPath);
  }
});

// Register: create player with unique name and hashed password
app.post('/api/register', (req, res) => {
  const { name, password } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  if (!password || !password.trim()) return res.status(400).json({ error: 'Password is required' });

  const trimmed = name.trim();
  const hash = bcrypt.hashSync(password, 10);
  const stmt = `INSERT INTO players (name, password) VALUES (?, ?)`;

  db.run(stmt, [trimmed, hash], function (err) {
    if (err) {
      if (err.message && err.message.includes('UNIQUE')) {
        return res.status(409).json({ error: 'Name already exists' });
      }
      console.error(err);
      return res.status(500).json({ error: 'Failed to create account' });
    }

    const playerId = this.lastID;
    db.run(`INSERT INTO player_stats (player_id) VALUES (?)`, [playerId], (e) => {
      if (e) console.error('Failed to create stats row', e);
    });

    res.json({ id: playerId, name: trimmed, hp: 200 });
  });
});

// Login by name and password
app.post('/api/login', (req, res) => {
  const { name, password } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  if (!password || !password.trim()) return res.status(400).json({ error: 'Password is required' });

  const trimmed = name.trim();
  db.get(`SELECT id, name, hp, class, password FROM players WHERE name = ?`, [trimmed], (err, row) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!row) return res.status(404).json({ error: 'Account not found' });

    if (!bcrypt.compareSync(password, row.password)) {
      return res.status(401).json({ error: 'Invalid name or password' });
    }

    const { password: _, ...user } = row;
    res.json(user);
  });
});

// Matchmaking queue (in-memory for simplicity)
const matchmakingQueue = [];
// Temporary store to notify waiting players when a match is found
const pendingMatches = {}; // keyed by playerId -> { matched:true, matchId, opponent }

// Socket.io: track socket -> player mapping and match rooms
const socketPlayerMap = new Map(); // socket.id -> { playerId, name }

io.on('connection', (socket) => {
  socket.on('join_match', (data) => {
    const { matchId, playerId, playerName } = data || {};
    if (!matchId || !playerId) return;
    socket.join(matchId);
    socketPlayerMap.set(socket.id, { playerId, playerName, matchId });

    // Notify others in room that this player joined
    socket.to(matchId).emit('player_joined', { playerId, playerName });
  });

  socket.on('player_update', (data) => {
    const { matchId } = data || {};
    if (!matchId) return;
    // Broadcast to other clients in the same match
    socket.to(matchId).emit('player_update', data);
  });

  socket.on('ability_fire', (data) => {
    const { matchId, projectile } = data || {};
    if (!matchId || !projectile) return;
    socket.to(matchId).emit('ability_fire', { projectile });
  });

  socket.on('match_end', (data) => {
    const { matchId, winnerId, loserId } = data || {};
    if (!matchId) return;
    // broadcast match end to room
    io.to(matchId).emit('match_end', { winnerId, loserId });
  });

  socket.on('disconnect', () => {
    const info = socketPlayerMap.get(socket.id);
    if (info && info.matchId) {
      socket.to(info.matchId).emit('player_left', { playerId: info.playerId });
    }
    // Remove from matchmaking queue if present
    if (info) {
      const queueIdx = matchmakingQueue.findIndex(p => p.playerId === info.playerId);
      if (queueIdx >= 0) {
        matchmakingQueue.splice(queueIdx, 1);
      }
      // Clear pending match notification
      if (pendingMatches[info.playerId]) {
        delete pendingMatches[info.playerId];
      }
    }
    socketPlayerMap.delete(socket.id);
  });
});

// Join matchmaking queue
app.post('/api/matchmaking/join', (req, res) => {
  const { playerId, playerName } = req.body;
  if (!playerId || !playerName) return res.status(400).json({ error: 'Player info required' });

  // Check if already in queue
  if (matchmakingQueue.find(p => p.playerId === playerId)) {
    return res.status(400).json({ error: 'Already in queue' });
  }

  // If queue is empty, add and wait
  if (matchmakingQueue.length === 0) {
    matchmakingQueue.push({ playerId, playerName, joinedAt: Date.now() });
    return res.json({ matched: false, message: 'Waiting for opponent...' });
  }

  // Match with first player in queue
  const opponent = matchmakingQueue.shift();
  const matchId = `match_${Date.now()}`;

  // Notify the joining player immediately (they will be player2 - red, bottom)
  res.json({
    matched: true,
    matchId,
    role: 'player2',
    opponent: { id: opponent.playerId, name: opponent.playerName },
    player: { id: playerId, name: playerName },
  });

  // Store pending match for the opponent (they will be player1 - blue, top)
  pendingMatches[opponent.playerId] = {
    matched: true,
    matchId,
    role: 'player1',
    opponent: { id: playerId, name: playerName },
  };
});

// Leave matchmaking queue
app.post('/api/matchmaking/leave', (req, res) => {
  const { playerId } = req.body;
  const idx = matchmakingQueue.findIndex(p => p.playerId === playerId);
  if (idx >= 0) {
    matchmakingQueue.splice(idx, 1);
  }
  // Clear any pending match notifications for this player
  if (pendingMatches[playerId]) delete pendingMatches[playerId];
  res.json({ left: true });
});

// Poll matchmaking status for a player to see if they've been matched
app.post('/api/matchmaking/status', (req, res) => {
  const { playerId } = req.body;
  if (!playerId) return res.status(400).json({ error: 'Player ID required' });

  const pending = pendingMatches[playerId];
  if (pending) {
    // Once delivered, remove pending notification
    delete pendingMatches[playerId];
    return res.json({ matched: true, matchId: pending.matchId, opponent: pending.opponent });
  }

  return res.json({ matched: false });
});

// Get leaderboard (top 10)
app.get('/api/leaderboard', (req, res) => {
  const query = `
    SELECT p.name, ps.wins, ps.losses 
    FROM player_stats ps
    JOIN players p ON p.id = ps.player_id
    ORDER BY ps.wins DESC
    LIMIT 10
  `;
  db.all(query, (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json(rows || []);
  });
});

// Record match result
app.post('/api/match/result', (req, res) => {
  const { winnerId, loserId } = req.body;
  if (!winnerId || !loserId) return res.status(400).json({ error: 'Winner and loser IDs required' });

  // Record match
  db.run(
    `INSERT INTO matches (player1_id, player2_id, winner_id) VALUES (?, ?, ?)`,
    [winnerId, loserId, winnerId],
    (err) => {
      if (err) console.error('Match insert error:', err);
    }
  );

  // Update winner stats
  db.run(
    `UPDATE player_stats SET wins = wins + 1 WHERE player_id = ?`,
    [winnerId],
    (err) => {
      if (err) console.error('Winner stats update error:', err);
    }
  );

  // Update loser stats
  db.run(
    `UPDATE player_stats SET losses = losses + 1 WHERE player_id = ?`,
    [loserId],
    (err) => {
      if (err) console.error('Loser stats update error:', err);
    }
  );

  res.json({ recorded: true });
});

// Get player stats
app.get('/api/player/stats/:playerId', (req, res) => {
  const { playerId } = req.params;
  db.get(
    `SELECT wins, losses FROM player_stats WHERE player_id = ?`,
    [playerId],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      res.json(row || { wins: 0, losses: 0 });
    }
  );
});

server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
