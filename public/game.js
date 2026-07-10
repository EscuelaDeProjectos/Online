const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const homeBtn = document.getElementById('homeBtn');
const homePanel = document.getElementById('homePanel');
const battlePanel = document.getElementById('battlePanel');
const qCooldownSpan = document.getElementById('QCooldown');
const eCooldownSpan = document.getElementById('ECooldown');
const fCooldownSpan = document.getElementById('FCooldown');
const rCooldownSpan = document.getElementById('RCooldown');
const cCooldownSpan = document.getElementById('CCooldown');
let gameOver = false;
let socket = null;

// Game Objects
const player1 = {
  x: 0,
  y: 0,
  size: 10,
  color: 'blue',
  hp: 200,
  maxHp: 200,
  lastHitAt: 0,
  invulnDuration: 150,
};

// Player 2 - opponent (practice dummy or multiplayer opponent)
const player2 = {
  x: 0,
  y: 0,
  size: 10,
  color: 'red',
  hp: 200,
  maxHp: 200,
  lastHitAt: 0,
  invulnDuration: 150,
};

// Local player reference (will be either player1 or player2 based on role)
let localPlayer = player1;
let remotePlayer = player2;

const projectiles = [];

// Ability settings
let lastFireballTime = 0;
const fireballSpeed = 5;
const fireballCooldown = 150;

let lastPurpleTime = 0;
const purpleCooldown = 10000;

let windWall = null;
let lastWindWallTime = 0;
const windWallDuration = 5000;
const windWallWidth = 10;
const windWallHeight = 75;
const windWallOffset = 50;
const windWallCooldown = 15000;

let lastSuperFireballTime = 0;
const superFireballSpeed = 5;
const superFireballCooldown = 30000;

let lastDashTime = 0;
const dashCooldown = 5000;

// AI for practice dummy
let lastAIAbilityTime = 0;
const aiAbilityCooldown = 1500;

player1.x = canvas.width / 2;
player1.y = canvas.height / 20;
player2.x = canvas.width / 2;
player2.y = canvas.height - 50;

// Set local player based on role
function setPlayerRole() {
  if (window.gameMode === 'multiplayer' && window.playerRole === 'player2') {
    localPlayer = player2;
    remotePlayer = player1;
  } else {
    localPlayer = player1;
    remotePlayer = player2;
  }
}

let mouseX = 400;
let mouseY = 300;
const keysPressed = {};

function getCooldownText(lastTime, cooldown) {
  if (!lastTime || Date.now() - lastTime >= cooldown) {
    return 'Ready';
  }
  return `${Math.ceil((cooldown - (Date.now() - lastTime)) / 1000)}s`;
}

function updateCooldownHud() {
  if (!qCooldownSpan) return;
  qCooldownSpan.textContent = getCooldownText(lastFireballTime, fireballCooldown);
  eCooldownSpan.textContent = getCooldownText(lastPurpleTime, purpleCooldown);
  fCooldownSpan.textContent = getCooldownText(lastWindWallTime, windWallCooldown);
  rCooldownSpan.textContent = getCooldownText(lastSuperFireballTime, superFireballCooldown);
  cCooldownSpan.textContent = getCooldownText(lastDashTime, dashCooldown);
}

// AI practice dummy logic
function updateAI() {
  if (window.gameMode !== 'practice') return;

  const now = Date.now();
  if (now - lastAIAbilityTime < aiAbilityCooldown) return;

  const dx = player1.x - player2.x;
  const dy = player1.y - player2.y;
  const distance = Math.hypot(dx, dy);

  if (distance > 0 && Math.random() < 0.7) {
    projectiles.push({
      x: player2.x,
      y: player2.y,
      vx: (dx / distance) * fireballSpeed,
      vy: (dy / distance) * fireballSpeed,
      size: 5,
      color: 'red',
      type: 'fireball',
      owner: 'player2',
    });
    lastAIAbilityTime = now;
  }
}
// Input handlers: keydown to trigger abilities/movement, keyup to clear movement
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  keysPressed[k] = true;

  if (k === 'q') {
    const elapsed = Date.now() - lastFireballTime;
    if (elapsed >= fireballCooldown) {
      const dx = mouseX - localPlayer.x;
      const dy = mouseY - localPlayer.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 0) {
        const projectile = {
          x: localPlayer.x,
          y: localPlayer.y,
          vx: (dx / distance) * fireballSpeed,
          vy: (dy / distance) * fireballSpeed,
          size: 5,
          color: 'red',
          type: 'fireball',
          owner: localPlayer === player1 ? 'player1' : 'player2',
        };
        projectiles.push(projectile);
        lastFireballTime = Date.now();
        
        // Send ability fire to opponent in multiplayer
        if (window.gameMode === 'multiplayer' && socket) {
          socket.emit('ability_fire', { matchId: window.matchId, projectile });
        }
      }
    }
  }

  if (k === 'e') {
    const elapsed = Date.now() - lastPurpleTime;
    if (elapsed >= purpleCooldown) {
      const dx = mouseX - localPlayer.x;
      const dy = mouseY - localPlayer.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 0) {
        const projectile = {
          x: localPlayer.x,
          y: localPlayer.y,
          vx: (dx / distance) * fireballSpeed,
          vy: (dy / distance) * fireballSpeed,
          size: 12,
          color: 'purple',
          type: 'purple',
          owner: localPlayer === player1 ? 'player1' : 'player2',
        };
        projectiles.push(projectile);
        lastPurpleTime = Date.now();
        
        // Send ability fire to opponent in multiplayer
        if (window.gameMode === 'multiplayer' && socket) {
          socket.emit('ability_fire', { matchId: window.matchId, projectile });
        }
      }
    }
  }

  if (k === 'f') {
    const elapsed = Date.now() - lastWindWallTime;
    if (elapsed >= windWallCooldown) {
      const dx = mouseX - localPlayer.x;
      const dy = mouseY - localPlayer.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 0) {
        const wallX = localPlayer.x + (dx / distance) * windWallOffset;
        const wallY = localPlayer.y + (dy / distance) * windWallOffset;
        const angle = Math.atan2(dy, dx);
        windWall = {
          x: wallX,
          y: wallY,
          width: windWallWidth,
          height: windWallHeight,
          angle,
          createdAt: Date.now(),
          opacity: 0.5,
        };
        lastWindWallTime = Date.now();
      }
    }
  }

  if (k === 'r') {
    const elapsed = Date.now() - lastSuperFireballTime;
    if (elapsed >= superFireballCooldown) {
      const dx = mouseX - localPlayer.x;
      const dy = mouseY - localPlayer.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 0) {
        const projectile = {
          x: localPlayer.x,
          y: localPlayer.y,
          vx: (dx / distance) * superFireballSpeed,
          vy: (dy / distance) * superFireballSpeed,
          size: 50,
          color: 'red',
          type: 'superFireball',
          owner: localPlayer === player1 ? 'player1' : 'player2',
        };
        projectiles.push(projectile);
        lastSuperFireballTime = Date.now();
        
        // Send ability fire to opponent in multiplayer
        if (window.gameMode === 'multiplayer' && socket) {
          socket.emit('ability_fire', { matchId: window.matchId, projectile });
        }
      }
    }
  }

  if (k === 'c') {
    const elapsed = Date.now() - lastDashTime;
    if (elapsed >= dashCooldown) {
      const dx = mouseX - localPlayer.x;
      const dy = mouseY - localPlayer.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 0) {
        const dashDistance = Math.min(distance, 75);
        localPlayer.x += (dx / distance) * dashDistance;
        localPlayer.y += (dy / distance) * dashDistance;
        lastDashTime = Date.now();
      }
    }
  }
});

window.addEventListener('keyup', (e) => {
  keysPressed[e.key.toLowerCase()] = false;
});

window.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
  mouseY = e.clientY - rect.top;
});

// Socket event listeners for multiplayer
function setupSocketListeners() {
  if (!socket) return;
  
  socket.on('ability_fire', (data) => {
    if (data.projectile) {
      const proj = data.projectile;
      // Set owner to remote player
      proj.owner = localPlayer === player1 ? 'player2' : 'player1';
      projectiles.push(proj);
    }
  });
  
  socket.on('player_update', (data) => {
    if (data.x !== undefined) remotePlayer.x = data.x;
    if (data.y !== undefined) remotePlayer.y = data.y;
    if (data.hp !== undefined) remotePlayer.hp = data.hp;
  });
  
  socket.on('player_left', (data) => {
    if (window.gameMode === 'multiplayer') {
      showMessage('Opponent disconnected', 'orange');
      window.gameMode = 'practice';
      window.opponent = null;
    }
  });
  
  socket.on('match_end', (data) => {
    const player = JSON.parse(localStorage.getItem('player'));
    const playerWon = data.winnerId === player.id;
    showGameOver(playerWon);
  });
}

function gameLoop() {
  const player1speed = 3;

  // Set player role based on game mode
  setPlayerRole();

  // Check if socket is available and setup listeners if needed
  if (window.gameMode === 'multiplayer' && window.gameSocket && !socket) {
    socket = window.gameSocket;
    setupSocketListeners();
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  updateCooldownHud();

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const projectile = projectiles[i];
    const previousX = projectile.x;
    const previousY = projectile.y;
    projectile.x += projectile.vx;
    projectile.y += projectile.vy;

    if (windWall) {
      const dx = projectile.x - windWall.x;
      const dy = projectile.y - windWall.y;
      const cos = Math.cos(-windWall.angle);
      const sin = Math.sin(-windWall.angle);
      const localX = dx * cos - dy * sin;
      const localY = dx * sin + dy * cos;
      if (
        localX > -windWall.width / 2 &&
        localX < windWall.width / 2 &&
        localY > -windWall.height / 2 &&
        localY < windWall.height / 2
      ) {
        if (projectile.type === 'superFireball') {
          windWall = null;
        }
        projectiles.splice(i, 1);
        continue;
      }
    }

    if (projectile.type === 'purple') {
      const halfSize = projectile.size / 2;
      ctx.beginPath();
      ctx.moveTo(projectile.x - halfSize, projectile.y - halfSize);
      ctx.lineTo(projectile.x + halfSize, projectile.y - halfSize);
      ctx.lineTo(projectile.x + halfSize, projectile.y + halfSize);
      ctx.lineTo(projectile.x - halfSize, projectile.y + halfSize);
      ctx.closePath();
      ctx.fillStyle = projectile.color;
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, projectile.size, 0, Math.PI * 2);
      ctx.fillStyle = projectile.color;
      ctx.fill();
    }

    if (projectile.owner !== (localPlayer === player1 ? 'player1' : 'player2')) {
      const now = Date.now();
      const canBeHit = now - localPlayer.lastHitAt >= localPlayer.invulnDuration;
      if (canBeHit) {
        const projectileRadius = projectile.type === 'purple' ? projectile.size / 2 : projectile.size;
        const hitRadius = localPlayer.size + projectileRadius;
        const collided = segmentCircleCollision(
          localPlayer.x,
          localPlayer.y,
          hitRadius,
          previousX,
          previousY,
          projectile.x,
          projectile.y
        );
        if (collided) {
          const dmg = projectile.type === 'superFireball' ? 50 : projectile.type === 'purple' ? 30 : 10;
          localPlayer.hp = Math.max(0, localPlayer.hp - dmg);
          localPlayer.lastHitAt = now;
          projectiles.splice(i, 1);
          continue;
        }
      }
    }

    // Check collision with remote player
    if (projectile.owner === (localPlayer === player1 ? 'player1' : 'player2')) {
      const now = Date.now();
      const canBeHit = now - remotePlayer.lastHitAt >= remotePlayer.invulnDuration;
      if (canBeHit) {
        const projectileRadius = projectile.type === 'purple' ? projectile.size / 2 : projectile.size;
        const hitRadius = remotePlayer.size + projectileRadius;
        const collided = segmentCircleCollision(
          remotePlayer.x,
          remotePlayer.y,
          hitRadius,
          previousX,
          previousY,
          projectile.x,
          projectile.y
        );
        if (collided) {
          const dmg = projectile.type === 'superFireball' ? 50 : projectile.type === 'purple' ? 30 : 10;
          remotePlayer.hp = Math.max(0, remotePlayer.hp - dmg);
          remotePlayer.lastHitAt = now;
          projectiles.splice(i, 1);
          continue;
        }
      }
    }

    if (
      projectile.x < 0 ||
      projectile.x > canvas.width ||
      projectile.y < 0 ||
      projectile.y > canvas.height
    ) {
      projectiles.splice(i, 1);
    }
  }

  if (localPlayer.hp <= 0 && !gameOver) {
    showGameOver(false); // local player lost
  }

  if (remotePlayer.hp <= 0 && !gameOver) {
    showGameOver(true); // local player won
  }

  if (gameOver) {
    requestAnimationFrame(gameLoop);
    return;
  }

  updateAI();

  if (keysPressed['w']) localPlayer.y -= player1speed;
  if (keysPressed['s']) localPlayer.y += player1speed;
  if (keysPressed['a']) localPlayer.x -= player1speed;
  if (keysPressed['d']) localPlayer.x += player1speed;

  // Send player position updates in multiplayer
  if (window.gameMode === 'multiplayer' && socket) {
    socket.emit('player_update', { matchId: window.matchId, x: localPlayer.x, y: localPlayer.y, hp: localPlayer.hp });
  }

  if (localPlayer.x < 0) localPlayer.x = canvas.width;
  else if (localPlayer.x > canvas.width) localPlayer.x = 0;
  if (localPlayer.y < 0) localPlayer.y = canvas.height;
  else if (localPlayer.y > canvas.height) localPlayer.y = 0;

  // Draw player1 (blue, top)
  ctx.beginPath();
  ctx.arc(player1.x, player1.y, player1.size, 0, Math.PI * 2);
  ctx.fillStyle = player1.color;
  ctx.fill();

  // Draw player1 HP label
  const labelPadding = 4;
  const labelText = `HP: ${player1.hp}/${player1.maxHp}`;
  ctx.font = '12px sans-serif';
  const textMetrics = ctx.measureText(labelText);
  const labelWidth = textMetrics.width + labelPadding * 2;
  const labelHeight = 12 + labelPadding * 2;
  const labelX = player1.x - labelWidth / 2;
  const labelY = player1.y - player1.size - labelHeight - 4;

  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(labelX - 1, labelY - 1, labelWidth + 2, labelHeight + 2);

  const hpRatio = Math.max(0, player1.hp) / player1.maxHp;
  const barW = labelWidth - labelPadding * 2;
  const barH = 8;
  const barX = labelX + labelPadding;
  const barY = labelY + 4;
  ctx.fillStyle = 'gray';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = hpRatio > 0.5 ? 'green' : hpRatio > 0.2 ? 'orange' : 'red';
  ctx.fillRect(barX, barY, barW * hpRatio, barH);

  ctx.fillStyle = 'white';
  ctx.textBaseline = 'top';
  ctx.fillText(labelText, labelX + labelPadding, barY + barH + 2);

  // Draw player2 (red, bottom - opponent)
  ctx.beginPath();
  ctx.arc(player2.x, player2.y, player2.size, 0, Math.PI * 2);
  ctx.fillStyle = player2.color;
  ctx.fill();

  // Draw player2 HP label
  const label2Text = `HP: ${player2.hp}/${player2.maxHp}`;
  const textMetrics2 = ctx.measureText(label2Text);
  const label2Width = textMetrics2.width + labelPadding * 2;
  const label2Height = 12 + labelPadding * 2;
  const label2X = player2.x - label2Width / 2;
  const label2Y = player2.y - player2.size - label2Height - 4;

  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(label2X - 1, label2Y - 1, label2Width + 2, label2Height + 2);

  const hp2Ratio = Math.max(0, player2.hp) / player2.maxHp;
  const bar2W = label2Width - labelPadding * 2;
  const bar2H = 8;
  const bar2X = label2X + labelPadding;
  const bar2Y = label2Y + 4;
  ctx.fillStyle = 'gray';
  ctx.fillRect(bar2X, bar2Y, bar2W, bar2H);
  ctx.fillStyle = hp2Ratio > 0.5 ? 'green' : hp2Ratio > 0.2 ? 'orange' : 'red';
  ctx.fillRect(bar2X, bar2Y, bar2W * hp2Ratio, bar2H);

  ctx.fillStyle = 'white';
  ctx.textBaseline = 'top';
  ctx.fillText(label2Text, label2X + labelPadding, bar2Y + bar2H + 2);

  if (windWall) {
    const elapsed = Date.now() - windWall.createdAt;
    if (elapsed >= windWallDuration) {
      windWall = null;
    } else {
      ctx.save();
      ctx.translate(windWall.x, windWall.y);
      ctx.rotate(windWall.angle);
      ctx.globalAlpha = windWall.opacity;
      ctx.fillStyle = 'blue';
      ctx.fillRect(-windWall.width / 2, -windWall.height / 2, windWall.width, windWall.height);
      ctx.strokeStyle = 'lightblue';
      ctx.lineWidth = 3;
      ctx.strokeRect(-windWall.width / 2, -windWall.height / 2, windWall.width, windWall.height);
      ctx.restore();
    }
  }

  requestAnimationFrame(gameLoop);
}

function segmentCircleCollision(cx, cy, radius, x1, y1, x2, y2) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const dx = cx - x1;
  const dy = cy - y1;
  const lenSq = vx * vx + vy * vy;
  if (lenSq === 0) {
    return dx * dx + dy * dy <= radius * radius;
  }
  const t = Math.max(0, Math.min(1, (dx * vx + dy * vy) / lenSq));
  const closestX = x1 + vx * t;
  const closestY = y1 + vy * t;
  const distSq = (cx - closestX) * (cx - closestX) + (cy - closestY) * (cy - closestY);
  return distSq <= radius * radius;
}

function showGameOver(playerWon) {
  gameOver = true;
  if (gameOverOverlay) {
    gameOverOverlay.style.display = 'flex';
    const gameOverText = document.getElementById('gameOverText');
    if (playerWon) {
      gameOverText.textContent = 'You won! Great job!';
      gameOverText.style.color = '#90EE90';
    } else {
      gameOverText.textContent = 'You have been defeated.';
      gameOverText.style.color = '#ff6b6b';
    }
  }

  // Send match result to backend if multiplayer
  if (window.gameMode === 'multiplayer' && window.opponent) {
    const player = JSON.parse(localStorage.getItem('player'));
    const winnerId = playerWon ? player.id : window.opponent.id;
    const loserId = playerWon ? window.opponent.id : player.id;

    fetch('/api/match/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winnerId, loserId }),
    }).catch((e) => console.error('Failed to send match result:', e));
  }
}

function resetGame() {
  gameOver = false;
  player1.hp = player1.maxHp;
  player1.x = canvas.width / 2;
  player1.y = canvas.height / 20;
  player1.lastHitAt = 0;
  player2.hp = player2.maxHp;
  player2.x = canvas.width / 2;
  player2.y = canvas.height - 50;
  player2.lastHitAt = 0;
  projectiles.length = 0;
  windWall = null;
  lastAIAbilityTime = 0;
  Object.keys(keysPressed).forEach((key) => {
    keysPressed[key] = false;
  });
  if (gameOverOverlay) {
    gameOverOverlay.style.display = 'none';
  }
  // Set player role after reset
  setPlayerRole();
}

if (homeBtn) {
  homeBtn.addEventListener('click', () => {
    resetGame();
    const homePanel = document.getElementById('homePanel');
    const battlePanel = document.getElementById('battlePanel');
    canvas.style.display = 'none';
    if (battlePanel) battlePanel.style.display = 'none';
    if (homePanel) homePanel.style.display = 'block';
  });
}

gameLoop();
