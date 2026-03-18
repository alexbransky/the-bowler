import { Input } from "./input.js";
import { createBumblebeeMusic } from "./music.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const overlay = document.getElementById("overlay");
const musicToggle = document.getElementById("music-toggle");
const music = createBumblebeeMusic();

const settings = {
  slope: 0.364, // tan(20deg), stable climb grade
  groundMargin: 56,
  playerWidth: 64,
  playerHeight: 82,
  playerSpeed: 160, // px / sec
  maxProgress: 2200,
  enemySpeed: 130,
  enemySpawnInterval: 1.2,
  enemyWidth: 42,
  enemyHeight: 72,
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
  dir: 1,
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
  const dx = player.dir > 0 ? x - bounds.left : bounds.right - x;
  const slope = settings.slope;
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
  player.dir = 1;
  player.y = getGroundY(player.x) - player.height + 2;

  scoreEl.textContent = state.score;
  bestEl.textContent = state.best;
  overlay.classList.remove("hidden");
  overlay.querySelector("h2").textContent = "Pull back to throw";
  overlay.querySelector("p").textContent =
    "Touch the rider (or near the scooter), then pull back to throw.";
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
  return Math.hypot(dx, dy) < 92;
}

function update(delta) {
  if (!state.running) return;

  state.frame += 1;
  state.spawnTimer -= delta;

  const bounds = getBounds();

  // Donkey Kong-style switchback climb: same grade, direction flips at edges.
  player.x += player.dir * settings.playerSpeed * delta;
  const risePerTraverse = settings.slope * (bounds.right - bounds.left);
  if (player.dir > 0 && player.x > bounds.right) {
    player.x = bounds.right;
    player.dir = -1;
    state.progress = Math.min(state.progress + risePerTraverse, settings.maxProgress);
  } else if (player.dir < 0 && player.x < bounds.left) {
    player.x = bounds.left;
    player.dir = 1;
    state.progress = Math.min(state.progress + risePerTraverse, settings.maxProgress);
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
  const enemyDirection = player.dir > 0 ? -1 : 1;
  state.enemies = state.enemies
    .map((enemy) => {
      const speed = settings.enemySpeed + state.score * 2;
      enemy.x += enemyDirection * speed * delta;
      enemy.y = getGroundY(enemy.x) - enemy.height;
      enemy.phase += delta * (4 + speed / 120);
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
      const dy = ball.y - (enemy.y + enemy.height * 0.45);
      const dist = Math.hypot(dx, dy);
      if (dist < ball.radius + enemy.width * 0.45) {
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
    const sway = Math.sin(enemy.phase) * 5;
    const bob = Math.cos(enemy.phase * 2) * 1.8;
    const armSwing = Math.sin(enemy.phase * 1.5) * 3.5;
    ctx.translate(sway, bob);
    ctx.rotate((Math.sin(enemy.phase) * 5 * Math.PI) / 180);

    // Zombie torso
    ctx.fillStyle = "#4d6b47";
    ctx.fillRect(-14, -6, 28, 40);

    // Ripped jacket
    ctx.fillStyle = "#38435b";
    ctx.fillRect(-11, 2, 22, 28);

    // Arms
    ctx.strokeStyle = "#7a9b63";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-11, 8);
    ctx.lineTo(-22 - armSwing, 18);
    ctx.moveTo(11, 10);
    ctx.lineTo(23 + armSwing, 22);
    ctx.stroke();

    // Legs
    ctx.strokeStyle = "#2f3a4e";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-6, 34);
    ctx.lineTo(-10 - armSwing * 0.4, 46);
    ctx.moveTo(6, 34);
    ctx.lineTo(11 + armSwing * 0.4, 46);
    ctx.stroke();

    // Zombie head
    ctx.fillStyle = "#88ad64";
    ctx.beginPath();
    ctx.arc(0, -14, 14, 0, Math.PI * 2);
    ctx.fill();

    // Face shadow
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.beginPath();
    ctx.arc(0, -10, 10, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = "#f14242";
    ctx.beginPath();
    ctx.arc(-5, -16, 2.8, 0, Math.PI * 2);
    ctx.arc(5, -15, 2.8, 0, Math.PI * 2);
    ctx.fill();

    // Mouth
    ctx.strokeStyle = "#2a3426";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, -7);
    ctx.lineTo(6, -6);
    ctx.stroke();

    // Bite mark
    ctx.fillStyle = "#7a2a32";
    ctx.fillRect(-2, 6, 5, 4);
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

  // Player on scooter
  const pc = playerCenter();
  const wheelRadius = 11;
  const deckWidth = 48;
  const deckHeight = 10;

  ctx.save();
  ctx.translate(pc.x, pc.y);
  ctx.rotate(-Math.atan(settings.slope) * player.dir);

  // Wheels
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(-22, 22, wheelRadius, 0, Math.PI * 2);
  ctx.arc(22, 22, wheelRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#666";
  ctx.beginPath();
  ctx.arc(-22, 22, wheelRadius - 3, 0, Math.PI * 2);
  ctx.arc(22, 22, wheelRadius - 3, 0, Math.PI * 2);
  ctx.fill();

  // Deck
  ctx.fillStyle = "#2a2a2a";
  ctx.fillRect(-deckWidth / 2, 11, deckWidth, deckHeight);

  // Pole & handle
  ctx.strokeStyle = "#888";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, 11);
  ctx.lineTo(0, -30);
  ctx.stroke();

  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.lineTo(-16, -36);
  ctx.moveTo(0, -30);
  ctx.lineTo(16, -36);
  ctx.stroke();

  // Legs
  ctx.strokeStyle = "#2d2f3f";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-8, 8);
  ctx.lineTo(-14, 14);
  ctx.moveTo(8, 8);
  ctx.lineTo(14, 14);
  ctx.stroke();

  // Torso and shoulders
  ctx.fillStyle = "#f7b733";
  ctx.fillRect(-11, -32, 22, 40);
  ctx.fillStyle = "#20263f";
  ctx.fillRect(-7, -26, 14, 20);

  // Arms gripping the handlebar
  ctx.strokeStyle = "#f7b733";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-6, -20);
  ctx.lineTo(-14, -34);
  ctx.moveTo(6, -20);
  ctx.lineTo(14, -34);
  ctx.stroke();

  // Head and face
  ctx.fillStyle = "#f6c4d9";
  ctx.beginPath();
  ctx.arc(0, -46, 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(-4, -47, 1.4, 0, Math.PI * 2);
  ctx.arc(4, -47, 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#8a4d56";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-4, -41);
  ctx.lineTo(4, -41);
  ctx.stroke();

  // Bowling-style helmet
  ctx.fillStyle = "#ff5fb5";
  ctx.beginPath();
  ctx.arc(0, -47, 12, Math.PI * 1.05, Math.PI * 0.08, true);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.arc(-5, -48, 1.4, 0, Math.PI * 2);
  ctx.arc(0, -50, 1.4, 0, Math.PI * 2);
  ctx.arc(5, -48, 1.4, 0, Math.PI * 2);
  ctx.fill();

  // Ponytail
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-10, -45);
  ctx.lineTo(-20, -38);
  ctx.stroke();

  // Label to make rider identity obvious in-game
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.fillText("BOWLER", -24, -62);

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
