import { Input } from "./input.js";
import { createBumblebeeMusic } from "./music.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const overlay = document.getElementById("overlay");
const controlPad = document.getElementById("control-pad");
const actionWindow = document.querySelector(".action-window");
const musicToggle = document.getElementById("music-toggle");
const music = createBumblebeeMusic();

const settings = {
  slope: 0,
  groundMargin: 118,
  playerWidth: 46,
  playerHeight: 56,
  playerSpeed: 160, // px / sec
  maxProgress: 2200,
  enemySpeed: 130,
  enemySpawnInterval: 1.2,
  enemyWidth: 50,
  enemyHeight: 66,
  enemyFallDuration: 0.32,
  ballRadius: 16,
  ballGravity: 120,
  ballReturnDelayMin: 0.2,
  ballReturnDelayMax: 0.78,
  ballReturnSpeed: 1900,
  ballMinLaunchSpeed: 220,
  ballMaxLaunchSpeed: 1580,
  ballLifetime: 4.2,
  hitBlink: 0.2,
};

const state = {
  running: false,
  score: 0,
  best: 0,
  frame: 0,
  lastTime: 0,
  progress: 0,
  enemies: [],
  balls: [],
  spawnTimer: 0,
  aim: {
    active: false,
    pull: { x: 0, y: 0 },
  },
  evade: {
    active: false,
    type: "side",
    elapsed: 0,
    duration: 0,
    direction: 1,
  },
  status: "ready", // ready | playing | gameover | complete
};

const player = {
  x: 0,
  y: 0,
  width: settings.playerWidth,
  height: settings.playerHeight,
  dir: 1,
};

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth * ratio;
  const viewportHeight = window.innerHeight * ratio;
  const reservedUi = 220 * ratio;
  const preferredHeight = viewportHeight - reservedUi;
  const minHeight = width * 0.8;
  const maxHeight = width * 1.2;
  const height = Math.round(Math.min(maxHeight, Math.max(minHeight, preferredHeight)));
  canvas.width = width;
  canvas.height = height;
}

function getBounds() {
  return {
    left: 80,
    right: canvas.width - 80,
  };
}

function getGroundY(x) {
  return canvas.height - settings.groundMargin;
}

function playerCenter() {
  return {
    x: player.x + player.width * 0.5,
    y: player.y + player.height * 0.5,
  };
}

function reset() {
  state.running = false;
  state.score = 0;
  state.progress = 0;
  state.frame = 0;
  state.spawnTimer = 0;
  state.enemies = [];
  state.balls = [];
  state.status = "ready";
  state.evade.active = false;
  state.evade.elapsed = 0;

  const bounds = getBounds();
  player.x = bounds.left;
  player.dir = 1;
  player.y = getGroundY(player.x) - player.height + 2;

  scoreEl.textContent = state.score;
  bestEl.textContent = state.best;
  overlay.classList.remove("hidden");
  overlay.querySelector("h2").textContent = "Pull Back to Throw";
  overlay.querySelector("p").textContent =
    "Desktop: click the game or control pad to start. Then drag on the control pad to throw.";
}

function startGame() {
  if (state.running) return;

  // Must run from a user gesture for mobile browser audio policies.
  music.start().catch(() => {
    // Ignore transient audio start failures; user can retry on next tap.
  });

  state.running = true;
  state.status = "playing";
  overlay.classList.add("hidden");
  state.lastTime = performance.now();
  requestAnimationFrame(loop);
}

function endGame(reason = "Game Over") {
  state.running = false;
  state.status = "gameover";
  overlay.classList.remove("hidden");
  overlay.querySelector("h2").textContent = reason;
  overlay.querySelector("p").textContent = "Tap to try again.";
}

function completeLevel() {
  state.running = false;
  state.status = "complete";
  overlay.classList.remove("hidden");
  overlay.querySelector("h2").textContent = "You made it!";
  overlay.querySelector(
    "p"
  ).textContent = `Score: ${state.score} | Tap to run again.`;
}

function spawnEnemy() {
  const bounds = getBounds();
  const x = player.dir > 0 ? bounds.right + 72 : bounds.left - 72;
  const y = getGroundY(x) - settings.enemyHeight;

  state.enemies.push({
    x,
    y,
    width: settings.enemyWidth,
    height: settings.enemyHeight,
    phase: Math.random() * Math.PI * 2,
    fallDirection: 1,
    hitAt: null,
  });
}

function releaseBallFromPull(pull) {
  const raw = Math.hypot(pull.x, pull.y);
  const power = Math.min(1.1, raw / 140);
  if (power < 0.14) return; // ignore tiny drags

  const dirX = pull.x / (raw || 1);
  const dirY = pull.y / (raw || 1);
  const speed =
    settings.ballMinLaunchSpeed +
    (settings.ballMaxLaunchSpeed - settings.ballMinLaunchSpeed) * power;
  const returnAtAge =
    settings.ballReturnDelayMin +
    (settings.ballReturnDelayMax - settings.ballReturnDelayMin) * power;
  const vx = dirX * speed;
  const vy = dirY * speed;
  const center = playerCenter();

  state.balls.push({
    x: center.x,
    y: center.y,
    vx,
    vy,
    radius: settings.ballRadius,
    age: 0,
    returning: false,
    returnAtAge,
  });
}

function update(delta) {
  if (!state.running) return;

  state.frame += 1;
  state.spawnTimer -= delta;

  const bounds = getBounds();

  // Donkey Kong-style switchback climb: same grade, direction flips at edges.
  player.x += player.dir * settings.playerSpeed * delta;
  const risePerTraverse = 260;
  if (player.dir > 0 && player.x > bounds.right) {
    player.x = bounds.right;
    player.dir = -1;
    state.progress = Math.min(state.progress + risePerTraverse, settings.maxProgress);
  } else if (player.dir < 0 && player.x < bounds.left) {
    player.x = bounds.left;
    player.dir = 1;
    state.progress = Math.min(state.progress + risePerTraverse, settings.maxProgress);
  }
  const basePlayerY = getGroundY(player.x) - player.height + 2;

  if (state.progress >= settings.maxProgress) {
    completeLevel();
    return;
  }

  // Spawn enemies
  if (state.spawnTimer <= 0) {
    state.spawnTimer = settings.enemySpawnInterval;
    spawnEnemy();
  }

  // Update enemies
  const enemyDirection = player.dir > 0 ? -1 : 1;
  state.enemies = state.enemies
    .map((enemy) => {
      if (enemy.hitAt) {
        return enemy;
      }
      const speed = settings.enemySpeed + state.score * 2;
      enemy.x += enemyDirection * speed * delta;
      enemy.y = getGroundY(enemy.x) - enemy.height;
      enemy.phase += delta * (4 + speed / 120);
      return enemy;
    })
    .filter((enemy) => {
      if (enemy.x < bounds.left - 120 || enemy.x > bounds.right + 120) {
        return false;
      }

      return true;
    });

  // Auto-avoid fallen zombies: mostly side-scoot, occasional hop.
  if (!state.evade.active) {
    const riderX = player.x + player.width * 0.5;
    const upcomingCorpse = state.enemies.find((enemy) => {
      if (!enemy.hitAt) return false;
      const corpseX = enemy.x + enemy.width * 0.5;
      const ahead =
        player.dir > 0 ? corpseX > riderX && corpseX - riderX < 60 : corpseX < riderX && riderX - corpseX < 60;
      return ahead;
    });

    if (upcomingCorpse) {
      const sideScoot = Math.random() < 0.78;
      state.evade.active = true;
      state.evade.type = sideScoot ? "side" : "jump";
      state.evade.elapsed = 0;
      state.evade.duration = sideScoot ? 0.45 : 0.52;
      state.evade.direction = Math.random() < 0.5 ? -1 : 1;
    }
  }

  let evadeOffsetY = 0;
  if (state.evade.active) {
    state.evade.elapsed += delta;
    const t = Math.min(1, state.evade.elapsed / state.evade.duration);
    if (state.evade.type === "jump") {
      evadeOffsetY = -Math.sin(t * Math.PI) * 44;
    } else {
      evadeOffsetY = Math.sin(t * Math.PI) * 24 * state.evade.direction;
    }
    if (t >= 1) {
      state.evade.active = false;
    }
  }
  player.y = basePlayerY + evadeOffsetY;

  // Enemy contact kills the rider.
  const pc = playerCenter();
  for (const enemy of state.enemies) {
    if (enemy.hitAt) continue;
    const hitPad = 6;
    const enemyLeft = enemy.x + hitPad;
    const enemyRight = enemy.x + enemy.width - hitPad;
    const enemyTop = enemy.y + hitPad;
    const enemyBottom = enemy.y + enemy.height - hitPad;
    const playerLeft = player.x + 6;
    const playerRight = player.x + player.width - 6;
    const playerTop = player.y + 2;
    const playerBottom = player.y + player.height;
    const overlap =
      playerRight > enemyLeft &&
      playerLeft < enemyRight &&
      playerBottom > enemyTop &&
      playerTop < enemyBottom;
    if (overlap) {
      endGame("You got caught!");
      return;
    }
  }

  // Update balls
  state.balls = state.balls
    .map((ball) => {
      ball.age += delta;
      if (!ball.returning) {
        ball.vy += settings.ballGravity * delta;
      }
      if (!ball.returning && ball.age > ball.returnAtAge) {
        ball.returning = true;
      }
      if (ball.returning) {
        const target = playerCenter();
        const toX = target.x - ball.x;
        const toY = target.y - ball.y;
        const dist = Math.hypot(toX, toY) || 1;
        ball.vx = (toX / dist) * settings.ballReturnSpeed;
        ball.vy = (toY / dist) * settings.ballReturnSpeed;
      }
      ball.x += ball.vx * delta;
      ball.y += ball.vy * delta;
      return ball;
    })
    .filter((ball) => {
      const target = playerCenter();
      const caughtOnReturn =
        ball.age > ball.returnAtAge + 0.08 &&
        Math.hypot(ball.x - target.x, ball.y - target.y) < player.width * 0.42;
      const outOfBounds =
        ball.x < -80 ||
        ball.x > canvas.width + 80 ||
        ball.y > canvas.height + 120 ||
        ball.age > settings.ballLifetime;
      return !outOfBounds && !caughtOnReturn;
    });

  // Ball vs enemy collisions
  for (const ball of state.balls) {
    for (const enemy of state.enemies) {
      if (enemy.hitAt) continue;
      // Match collision to the visible zombie footprint (thin body + swinging arms/head).
      const hitLeft = enemy.x - 8;
      const hitRight = enemy.x + enemy.width + 8;
      const hitTop = enemy.y + 8;
      const hitBottom = enemy.y + enemy.height + 10;
      const closestX = Math.max(hitLeft, Math.min(ball.x, hitRight));
      const closestY = Math.max(hitTop, Math.min(ball.y, hitBottom));
      const dx = ball.x - closestX;
      const dy = ball.y - closestY;
      const touching = dx * dx + dy * dy <= ball.radius * ball.radius;
      if (touching) {
        enemy.hitAt = performance.now();
        enemy.fallDirection = ball.vx >= 0 ? 1 : -1;
        state.score += 1;
        scoreEl.textContent = state.score;
        if (state.score > state.best) {
          state.best = state.score;
          bestEl.textContent = state.best;
          localStorage.setItem("bowler-best", state.best);
        }
      }
    }
  }
}

function drawAim() {
  if (!state.aim.active) return;
  const start = playerCenter();
  const dx = state.aim.pull.x;
  const dy = state.aim.pull.y;
  const end = {
    x: start.x + dx * 0.35,
    y: start.y + dy * 0.35,
  };
  const power = Math.min(1.1, Math.hypot(dx, dy) / 140);

  ctx.save();
  ctx.strokeStyle = `rgba(255, 221, 87, 0.65)`;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  const arrowSize = 12 + power * 14;
  const angle = Math.atan2(dy, dx);
  ctx.fillStyle = "rgba(255, 221, 87, 0.9)";
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(
    end.x + Math.cos(angle + 0.6) * arrowSize,
    end.y + Math.sin(angle + 0.6) * arrowSize
  );
  ctx.lineTo(
    end.x + Math.cos(angle - 0.6) * arrowSize,
    end.y + Math.sin(angle - 0.6) * arrowSize
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function draw() {
  const { width, height } = canvas;

  ctx.clearRect(0, 0, width, height);

  // Sky
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#152150");
  gradient.addColorStop(0.6, "#0b1022");
  gradient.addColorStop(1, "#0a0d17");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // City skyline (Double Dragon style) - much larger buildings
  const bounds = getBounds();
  const groundY = getGroundY(bounds.left);
  ctx.fillStyle = "#111933";
  const blockCount = 8;
  for (let i = 0; i < blockCount; i++) {
    const bw = 140 + (i % 3) * 50;
    const bh = 200 + ((i * 37) % 240);
    const bx = bounds.left - 50 + i * ((bounds.right - bounds.left + 100) / (blockCount - 1));
    const by = groundY - bh - 20;
    ctx.fillRect(bx, by, bw, bh);
    const windowColors = ["#ffde75", "#5fc7ff", "#ff6b7f", "#7fdc7f"];
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < Math.floor(bw / 20); c++) {
        if ((r + c + i) % 3 === 0) continue;
        ctx.fillStyle = windowColors[(r + c + i) % windowColors.length];
        ctx.globalAlpha = 0.35;
        ctx.fillRect(bx + 8 + c * 18, by + 14 + r * 20, 8, 8);
      }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#111933";
  }

  // Reflective asphalt
  const roadGradient = ctx.createLinearGradient(0, groundY - 34, 0, height);
  roadGradient.addColorStop(0, "rgba(82, 97, 156, 0.38)");
  roadGradient.addColorStop(1, "rgba(10, 14, 28, 0.95)");
  ctx.fillStyle = roadGradient;
  ctx.fillRect(bounds.left, groundY - 28, bounds.right - bounds.left, height - (groundY - 28));

  // Mid-lane glow
  const laneGlow = ctx.createLinearGradient(0, groundY - 4, 0, groundY + 34);
  laneGlow.addColorStop(0, "rgba(128, 145, 215, 0.32)");
  laneGlow.addColorStop(1, "rgba(128, 145, 215, 0)");
  ctx.fillStyle = laneGlow;
  ctx.fillRect(bounds.left, groundY - 4, bounds.right - bounds.left, 40);

  // Bottom road stripe + dashes
  ctx.fillStyle = "#070b16";
  ctx.fillRect(bounds.left, height - 26, bounds.right - bounds.left, 26);
  ctx.strokeStyle = "rgba(236, 221, 122, 0.38)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = bounds.left + 14; x < bounds.right - 12; x += 36) {
    ctx.moveTo(x, height - 13);
    ctx.lineTo(x + 15, height - 13);
  }
  ctx.stroke();

  // Enemies - realistic creepy zombies
  state.enemies.forEach((enemy) => {
    const elapsedHit = enemy.hitAt ? (performance.now() - enemy.hitAt) / 1000 : 0;

    ctx.save();
    ctx.translate(enemy.x + enemy.width * 0.5, enemy.y + enemy.height * 0.5);
    // Much larger zombie scale
    const zombieScale = 2.2;
    ctx.scale(zombieScale, zombieScale);
    const sway = Math.sin(enemy.phase) * 4;
    const bob = Math.cos(enemy.phase * 2) * 1.2;
    const armSwing = Math.sin(enemy.phase * 1.5) * 2;
    ctx.translate(sway, bob);
    if (enemy.hitAt) {
      const fallT = Math.min(1, elapsedHit / settings.enemyFallDuration);
      const fallAngle = enemy.fallDirection * fallT * 1.35;
      ctx.rotate(fallAngle);
      ctx.translate(0, 14 * fallT);
    }

    // Red body - simple and creepy
    ctx.fillStyle = "#b01a1a";
    ctx.fillRect(-9, -2, 18, 38);
    
    // Dark center stripe
    ctx.fillStyle = "#6b0f0f";
    ctx.fillRect(-3, -2, 6, 38);

    // Green hanging arms - long and thin
    ctx.strokeStyle = "#5a8a5a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-9, 6);
    ctx.lineTo(-16 - armSwing, 28);
    ctx.moveTo(9, 6);
    ctx.lineTo(16 + armSwing, 28);
    ctx.stroke();

    // Simple thin legs
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-4, 34);
    ctx.lineTo(-5, 46);
    ctx.moveTo(4, 34);
    ctx.lineTo(5, 46);
    ctx.stroke();

    // Pale skull head - simple and menacing
    ctx.fillStyle = "#d9d490";
    ctx.beginPath();
    ctx.arc(0, -16, 9, 0, Math.PI * 2);
    ctx.fill();

    // Dark eye holes - just holes
    ctx.fillStyle = "#0a0a0a";
    ctx.beginPath();
    ctx.arc(-3, -17, 2, 0, Math.PI * 2);
    ctx.arc(3, -17, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  });

  // Balls
  state.balls.forEach((ball) => {
    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.fillStyle = "#ff5fb5";
    ctx.beginPath();
    ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.beginPath();
    ctx.arc(-6, -8, ball.radius * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  // Player on scooter - 3x bigger
  const pc = playerCenter();
  const wheelRadius = 10;
  const deckWidth = 50;
  const deckHeight = 12;

  ctx.save();
  ctx.translate(pc.x, pc.y);
  const lean = state.evade.active && state.evade.type === "side" ? 0.18 * state.evade.direction : 0;
  ctx.rotate(lean);

  // Wheels
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(-18, 28, wheelRadius, 0, Math.PI * 2);
  ctx.arc(18, 28, wheelRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#666";
  ctx.beginPath();
  ctx.arc(-18, 28, wheelRadius - 4, 0, Math.PI * 2);
  ctx.arc(18, 28, wheelRadius - 4, 0, Math.PI * 2);
  ctx.fill();

  // Deck
  ctx.fillStyle = "#d4a842";
  ctx.fillRect(-deckWidth / 2, 20, deckWidth, deckHeight);

  // Pole & handle
  ctx.strokeStyle = "#8b7500";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, 20);
  ctx.lineTo(0, -12);
  ctx.stroke();

  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(-16, -20);
  ctx.moveTo(0, -12);
  ctx.lineTo(16, -20);
  ctx.stroke();

  // Torso
  ctx.fillStyle = "#f0c857";
  ctx.fillRect(-12, -24, 24, 32);
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(-6, -16, 12, 18);

  // Arms
  ctx.strokeStyle = "#f0c857";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-6, -10);
  ctx.lineTo(-14, -18);
  ctx.moveTo(6, -10);
  ctx.lineTo(14, -18);
  ctx.stroke();

  // Head and face
  ctx.fillStyle = "#f9d5a8";
  ctx.beginPath();
  ctx.arc(0, -32, 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(-4, -34, 2, 0, Math.PI * 2);
  ctx.arc(4, -34, 2, 0, Math.PI * 2);
  ctx.fill();

  // Hat
  ctx.fillStyle = "#d4a842";
  ctx.beginPath();
  ctx.arc(0, -32, 12, Math.PI * 1.05, Math.PI * 0.08, true);
  ctx.fill();

  ctx.restore();

  // Aim line
  drawAim();

  // HUD
  ctx.fillStyle = "rgba(255,255,255,0.86)";
  ctx.font = "bold 13px system-ui, sans-serif";
  ctx.fillText(`SCORE ${state.score}   BEST ${state.best}`, bounds.left + 6, 20);

  // Progress bar
  const progressRatio = Math.min(1, state.progress / settings.maxProgress);
  const barWidth = 160;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 66, barWidth, 10);
  ctx.fillStyle = "rgba(255, 221, 87, 0.85)";
  ctx.fillRect(15, 67, barWidth * progressRatio, 8);
}

function bindInput() {
  const input = new Input(canvas);
  const padInput = controlPad ? new Input(controlPad) : null;

  const startHandler = () => {
    if (!state.running) {
      reset();
      startGame();
    }
  };

  // Allow starting from overlay OR control pad so first-tap UX is forgiving.
  const startTargets = [overlay, actionWindow, controlPad].filter(Boolean);
  startTargets.forEach((target) => {
    target.addEventListener("pointerdown", startHandler);
    target.addEventListener("mousedown", startHandler);
    target.addEventListener("click", startHandler);
    target.addEventListener("touchstart", startHandler, { passive: true });
  });

  window.addEventListener("keydown", (event) => {
    if (state.running) return;
    if (event.code === "Space" || event.code === "Enter") {
      startHandler();
    }
  });

  input.onTap(() => {
    if (!state.running) {
      reset();
      startGame();
    }
  });

  if (padInput) {
    padInput.onDragStart(() => {
      if (!state.running || state.status !== "playing") return;
      state.aim.active = true;
      state.aim.pull = { x: 0, y: 0 };
    });

    padInput.onDragMove((pos) => {
      if (!state.aim.active || state.status !== "playing") return;
      state.aim.pull = {
        x: pos.start.x - pos.x,
        y: pos.start.y - pos.y,
      };
    });

    padInput.onDragEnd((pos) => {
      if (!state.aim.active) return;
      state.aim.active = false;
      if (state.status !== "playing") return;

      const pull = {
        x: pos.start.x - pos.x,
        y: pos.start.y - pos.y,
      };
      releaseBallFromPull(pull);
      state.aim.pull = { x: 0, y: 0 };
    });
  }
}

function loadBestScore() {
  const saved = Number(localStorage.getItem("bowler-best") || 0);
  if (!Number.isNaN(saved)) {
    state.best = saved;
  }
}

function loop(time) {
  const delta = (time - state.lastTime) / 1000;
  state.lastTime = time;

  update(delta);
  draw();
  requestAnimationFrame(loop);
}

init();

function init() {
  resizeCanvas();
  loadBestScore();
  reset();
  bindInput();

  if (musicToggle) {
    musicToggle.addEventListener("click", () => {
      const isMuted = music.toggleMute();
      musicToggle.textContent = isMuted ? "Music: Off" : "Music: On";
    });
  }

  window.addEventListener("resize", () => {
    resizeCanvas();
    reset();
  });
}
