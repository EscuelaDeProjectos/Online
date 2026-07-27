// Simple auth frontend: register/login by name. Stores current user in localStorage.
window.addEventListener('DOMContentLoaded', () => {
  const authPanel = document.getElementById('authPanel');
  const homePanel = document.getElementById('homePanel');
  const battlePanel = document.getElementById('battlePanel');
  const nameInput = document.getElementById('nameInput');
  const passwordInput = document.getElementById('passwordInput');
  const registerBtn = document.getElementById('registerBtn');
  const loginBtn = document.getElementById('loginBtn');
  const practiceBtn = document.getElementById('practiceBtn');
  const matchmakingBtn = document.getElementById('matchmakingBtn');
  const leaderboardBtn = document.getElementById('leaderboardBtn');
  const homeUsername = document.getElementById('homeUsername');
  const battleUsername = document.getElementById('battleUsername');
  const messages = document.getElementById('messages');
  const leaderboardOverlay = document.getElementById('leaderboardOverlay');
  const closeLeaderboardBtn = document.getElementById('closeLeaderboardBtn');
  const matchmakingOverlay = document.getElementById('matchmakingOverlay');
  const cancelMatchmakingBtn = document.getElementById('cancelMatchmakingBtn');
  let matchmakingPoll = null;

  function showMessage(text, color = 'lightgreen') {
    messages.style.color = color;
    messages.textContent = text;
  }

  function setLoggedIn(user) {
    localStorage.setItem('player', JSON.stringify(user));
    authPanel.style.display = 'none';
    homePanel.style.display = 'block';
    battlePanel.style.display = 'none';
    homeUsername.textContent = `${user.name}`;
    battleUsername.textContent = `${user.name}`;
    showMessage(`Welcome back, ${user.name}!`);
  }

  function setLoggedOut() {
    localStorage.removeItem('player');
    authPanel.style.display = 'block';
    homePanel.style.display = 'none';
    battlePanel.style.display = 'none';
    nameInput.value = '';
    passwordInput.value = '';
    showMessage('Please sign in or register.', 'lightblue');
  }

  function checkLogged() {
    const stored = localStorage.getItem('player');
    if (stored) {
      setLoggedIn(JSON.parse(stored));
    } else {
      setLoggedOut();
    }
  }

  registerBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    const password = passwordInput.value;
    if (!name) return showMessage('Enter a name', 'orange');
    if (!password) return showMessage('Enter a password', 'orange');

    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password }),
    });

    if (res.ok) {
      const user = await res.json();
      setLoggedIn(user);
    } else if (res.status === 409) {
      showMessage('Name already exists', 'orange');
    } else {
      const err = await res.json().catch(() => ({ error: 'Unknown' }));
      showMessage(err.error || 'Register failed', 'red');
    }
  });

  loginBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    const password = passwordInput.value;
    if (!name) return showMessage('Enter a name', 'orange');
    if (!password) return showMessage('Enter a password', 'orange');

    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password }),
    });

    if (res.ok) {
      const user = await res.json();
      setLoggedIn(user);
    } else if (res.status === 404 || res.status === 401) {
      showMessage('Invalid name or password', 'orange');
    } else {
      const err = await res.json().catch(() => ({ error: 'Unknown' }));
      showMessage(err.error || 'Login failed', 'red');
    }
  });

  practiceBtn.addEventListener('click', () => {
    const player = JSON.parse(localStorage.getItem('player'));
    window.gameMode = 'practice';
    window.opponent = null;
    homePanel.style.display = 'none';
    battlePanel.style.display = 'block';
    // Ensure canvas visible and game state reset
    if (typeof resetGame === 'function') resetGame();
    const canvas = document.getElementById('gameCanvas');
    if (canvas) canvas.style.display = 'block';
    showMessage('Practice Mode - Train against a dummy!', 'lightgreen');
  });

  matchmakingBtn.addEventListener('click', async () => {
    const player = JSON.parse(localStorage.getItem('player'));
    matchmakingOverlay.style.display = 'flex';
    showMessage('Searching for opponent...', 'yellow');

    const res = await fetch('/api/matchmaking/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: player.id, playerName: player.name }),
    });

    if (!res.ok) {
      showMessage('Error joining matchmaking', 'red');
      matchmakingOverlay.style.display = 'none';
      return;
    }

    const data = await res.json();
    if (data.matched) {
      window.gameMode = 'multiplayer';
      window.opponent = data.opponent;
      window.matchId = data.matchId;
      window.playerRole = data.role || 'player1';
      matchmakingOverlay.style.display = 'none';
      homePanel.style.display = 'none';
      battlePanel.style.display = 'block';
      if (typeof resetGame === 'function') resetGame();
      const canvas = document.getElementById('gameCanvas');
      if (canvas) canvas.style.display = 'block';
      // connect socket and join match room
      if (window.io) {
        window.socket = window.io();
        window.socket.emit('join_match', { matchId: window.matchId, playerId: player.id, playerName: player.name, role: window.playerRole });
        // Setup socket listeners in game.js
        if (typeof setupSocketListeners === 'function') {
          // Pass the socket to game.js
          window.gameSocket = window.socket;
        }
      }
      showMessage(`Found opponent: ${data.opponent.name}! Fight!`, 'lightgreen');
    } else {
      // Poll for match
      matchmakingPoll = setInterval(async () => {
        try {
          const pollRes = await fetch('/api/matchmaking/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerId: player.id }),
          });
          if (!pollRes.ok) return;
          const pollData = await pollRes.json();
          if (pollData.matched) {
            clearInterval(matchmakingPoll);
            matchmakingPoll = null;
            window.gameMode = 'multiplayer';
            window.opponent = pollData.opponent;
            window.matchId = pollData.matchId;
            window.playerRole = pollData.role || 'player1';
            matchmakingOverlay.style.display = 'none';
            homePanel.style.display = 'none';
            battlePanel.style.display = 'block';
            if (typeof resetGame === 'function') resetGame();
            const canvas = document.getElementById('gameCanvas');
            if (canvas) canvas.style.display = 'block';
            if (window.io) {
              window.socket = window.io();
              window.socket.emit('join_match', { matchId: window.matchId, playerId: player.id, playerName: player.name, role: window.playerRole });
              // Setup socket listeners in game.js
              if (typeof setupSocketListeners === 'function') {
                window.gameSocket = window.socket;
              }
            }
            showMessage(`Found opponent: ${pollData.opponent.name}! Fight!`, 'lightgreen');
          }
        } catch (err) {
          console.error('Matchmaking poll error', err);
        }
      }, 2000);
    }
  });

  cancelMatchmakingBtn.addEventListener('click', async () => {
    const player = JSON.parse(localStorage.getItem('player'));
    if (matchmakingPoll) clearInterval(matchmakingPoll);
    
    await fetch('/api/matchmaking/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: player.id }),
    });

    matchmakingOverlay.style.display = 'none';
    showMessage('Left matchmaking queue', 'yellow');
  });

  leaderboardBtn.addEventListener('click', async () => {
    const res = await fetch('/api/leaderboard');
    if (!res.ok) {
      showMessage('Failed to load leaderboard', 'red');
      return;
    }

    const players = await res.json();
    let html = '<table class="leaderboard-table"><tr><th>Rank</th><th>Player</th><th>Wins</th><th>Losses</th></tr>';
    players.forEach((p, idx) => {
      html += `<tr><td>${idx + 1}</td><td>${p.name}</td><td>${p.wins}</td><td>${p.losses}</td></tr>`;
    });
    html += '</table>';
    document.getElementById('leaderboardContent').innerHTML = html;
    leaderboardOverlay.style.display = 'flex';
  });

  closeLeaderboardBtn.addEventListener('click', () => {
    leaderboardOverlay.style.display = 'none';
  });

  checkLogged();
});
