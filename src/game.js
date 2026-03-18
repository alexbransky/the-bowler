import { Input } from "./input.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const overlay = document.getElementById("overlay");

const settings = {
  slope: 0.55, // rise / run
  groundMargin: 56,
  playerWidth: 50,
  playerHeight: 62,
  playerSpeed: 160, // px / sec
  progressStep: 52,
  maxProgress: 520,
  enemySpeed: 130,
  enemySpawnInterval: 1.2,
  enemySize: 44,
  ballRadius: 16,
  ballGravity: 900,
  ballPower: 3.2,
  ballLifetime: 3.2,
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
    start: { x: 0, y: 0 },
    current: { x: 0, y: 0 },
  },
  status: "ready", // ready | playing | gameover | complete
};

const player = {
  x: 0,
  y: 0,
  width: settings.playerWidth,
  height: settings.playerHeight,
};

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth * ratio;
  const height = Math.round(width * 0.56);
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
  const bounds = getBounds();
  const base = canvas.height - settings.groundMargin;
  const slope = settings.slope;
  const dx = x - bounds.left;
  return base - slope * dx - state.progress;
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

  const bounds = getBounds();
  player.x = bounds.left;
  player.y = getGroundY(player.x) - player.height + 2;

  scoreEl.textContent = state.score;
  bestEl.textContent = state.best;
  overlay.classList.remove("hidden");
  overlay.querySelector("h2").textContent = "Pull back to throw";
  overlay.querySelector("p").textContent = "Aim the pink ball at marching enemies.";
}

function startGame() {
  if (state.running) return;

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
  ).textContent = `Score: ${state.score} • Tap to run again.`;
}

function spawnEnemy() {
  const bounds = getBounds();
  const x = bounds.right + 72;
  const y = getGroundY(x) - settings.enemySize;

  state.enemies.push({
    x,
    y,
    width: settings.enemySize,
    height: settings.enemySize,
    hitAt: null,
  });
}

function releaseBall(endPos) {
  const center = playerCenter();
  const pull = {
    x: center.x - endPos.x,
    y: center.y - endPos.y,
  };

  const raw = Math.hypot(pull.x, pull.y);
  const power = Math.min(1.1, raw / 140);
  if (power < 0.14) return; // ignore tiny drags

  const vx = pull.x * settings.ballPower * power;
  const vy = pull.y * settings.ballPower * power;

  state.balls.push({
    x: center.x,
    y: center.y,
    vx,
    vy,
    radius: settings.ballRadius,
    age: 0,
  });
}

function inPlayerArea(pos) {
  const center = playerCenter();
  const dx = pos.x - center.x;
  const dy = pos.y - center.y;
  return Math.hypot(dx, dy) < 70;
}

function update(delta) {
  if (!state.running) return;

  state.frame += 1;
  state.spawnTimer -= delta;

  const bounds = getBounds();

  // Keep the scooter moving forward; wrap to the left after crossing the right edge.
  player.x += settings.playerSpeed * delta;
  while (player.x > bounds.right) {
    player.x = bounds.left + (player.x - bounds.right);
    state.progress = Math.min(
      state.progress + settings.progressStep,
      settings.maxProgress
    );
  }
  player.y = getGroundY(player.x) - player.height + 2;

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
  const enemyDirection = -1;
  state.enemies = state.enemies
    .map((enemy) => {
      const speed = settings.enemySpeed + state.score * 2;
      enemy.x += enemyDirection * speed * delta;
      enemy.y = getGroundY(enemy.x) - enemy.height;
      return enemy;
    })
    .filter((enemy) => {
      if (enemy.hitAt && performance.now() - enemy.hitAt > settings.hitBlink * 3) {
        return false;
      }

      if (enemy.x < bounds.left - 120 || enemy.x > bounds.right + 120) {
        return false;
      }

      return true;
    });

  // Update balls
  state.balls = state.balls
    .map((ball) => {
      ball.age += delta;
      ball.vy += settings.ballGravity * delta;
      ball.x += ball.vx * delta;
      ball.y += ball.vy * delta;
      return ball;
    })
    .filter((ball) => {
      const outOfBounds =
        ball.x < -80 ||
        ball.x > canvas.width + 80 ||
        ball.y > canvas.height + 120 ||
        ball.age > settings.ballLifetime;
      return !outOfBounds;
    });

  // Ball vs enemy collisions
  for (const ball of state.balls) {
    for (const enemy of state.enemies) {
      if (enemy.hitAt) continue;

      const dx = ball.x - (enemy.x + enemy.width / 2);
      const dy = ball.y - (enemy.y + enemy.height / 2);
      const dist = Math.hypot(dx, dy);
      if (dist < ball.radius + enemy.width / 2) {
        enemy.hitAt = performance.now();
        state.score += 1;
        scoreEl.textContent = state.score;
        if (state.score > state.best) {
          state.best = state.score;
          bestEl.textContent = state.best;
          localStorage.setItem("bowler-best", state.best);
        }
        ball.age = settings.ballLifetime; // remove ball
        break;
      }
    }
  }
}

function drawAim() {
  if (!state.aim.active) return;
  const start = state.aim.start;
  const end = state.aim.current;
  const dx = start.x - end.x;
  const dy = start.y - end.y;
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

  // Sloping ground
  const bounds = getBounds();
  const leftY = getGroundY(bounds.left);
  const rightY = getGroundY(bounds.right);

  ctx.fillStyle = "#1f2e4a";
  ctx.beginPath();
  ctx.moveTo(bounds.left, leftY);
  ctx.lineTo(bounds.right, rightY);
  ctx.lineTo(bounds.right, height);
  ctx.lineTo(bounds.left, height);
  ctx.closePath();
  ctx.fill();

  // Ground stripes
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  const stripeCount = 10;
  for (let i = 0; i <= stripeCount; i++) {
    const t = i / stripeCount;
    const x = bounds.left + (bounds.right - bounds.left) * t;
    const y = leftY + (rightY - leftY) * t;
    ctx.moveTo(x, y);
    ctx.lineTo(x + 18, y + 20);
  }
  ctx.stroke();

  // Enemies
  state.enemies.forEach((enemy) => {
    const hitProgress = enemy.hitAt
      ? (performance.now() - enemy.hitAt) / settings.hitBlink
      : 0;
    const visible = !enemy.hitAt || Math.floor(hitProgress * 6) % 2 === 0;
    if (!visible) return;

    ctx.save();
    ctx.translate(enemy.x + enemy.width * 0.5, enemy.y + enemy.height * 0.5);
    ctx.fillStyle = "#c74c5c";
    ctx.beginPath();
    ctx.arc(0, 0, enemy.width * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // eyes
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(-8, -6, 4, 0, Math.PI * 2);
    ctx.arc(8, -6, 4, 0, Math.PI * 2);
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

  // Player (Carol on scooter)
  const pc = playerCenter();
  const wheelRadius = 10;
  const deckWidth = 38;
  const deckHeight = 8;

  ctx.save();
  ctx.translate(pc.x, pc.y);
  ctx.rotate(-Math.atan(settings.slope));

  // Wheels
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(-18, 16, wheelRadius, 0, Math.PI * 2);
  ctx.arc(18, 16, wheelRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#666";
  ctx.beginPath();
  ctx.arc(-18, 16, wheelRadius - 3, 0, Math.PI * 2);
  ctx.arc(18, 16, wheelRadius - 3, 0, Math.PI * 2);
  ctx.fill();

  // Deck
  ctx.fillStyle = "#222";
  ctx.fillRect(-deckWidth / 2, 8, deckWidth, deckHeight);

  // Pole & handle
  ctx.strokeStyle = "#888";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.lineTo(0, -22);
  ctx.stroke();

  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(-16, -30);
  ctx.moveTo(0, -22);
  ctx.lineTo(16, -30);
  ctx.stroke();

  // Head
  ctx.fillStyle = "#f6c4d9";
  ctx.beginPath();
  ctx.arc(0, -40, 10, 0, Math.PI * 2);
  ctx.fill();

  // Helmet (pink)
  ctx.fillStyle = "#ff5fb5";
  ctx.beginPath();
  ctx.arc(0, -40, 10, Math.PI * 1.1, Math.PI * 0.1, true);
  ctx.fill();

  ctx.restore();

  // Aim line
  drawAim();

  // HUD
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(14, 14, 164, 46);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 14px system-ui, sans-serif";
  ctx.fillText(`Score: ${state.score}`, 22, 32);
  ctx.fillText(`Best: ${state.best}`, 22, 50);

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

  // Allow starting the game by tapping the splash overlay (which covers the canvas)
  const startHandler = () => {
    if (!state.running) {
      reset();
      startGame();
    }
  };

  overlay.addEventListener("pointerdown", startHandler);
  overlay.addEventListener("click", startHandler);
  overlay.addEventListener("touchstart", startHandler, { passive: true });

  input.onTap(() => {
    if (!state.running) {
      reset();
      startGame();
      return;
    }

    // If game is running but not yet complete, allow tap to throw a small tap shot
    if (state.status === "playing") {
      releaseBall(playerCenter());
    }
  });

  input.onDragStart((pos) => {
    if (!state.running || state.status !== "playing") return;
    if (!inPlayerArea(pos)) return;

    state.aim.active = true;
    state.aim.start = playerCenter();
    state.aim.current = pos;
  });

  input.onDragMove((pos) => {
    if (!state.aim.active) return;
    state.aim.current = pos;
  });

  input.onDragEnd((pos) => {
    if (!state.aim.active) return;
    state.aim.active = false;

    if (state.status === "playing") {
      releaseBall(pos);
    }
  });
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

  window.addEventListener("resize", () => {
    resizeCanvas();
    reset();
  });
}
