// Star Catcher — tiny browser game built from one prompt.
// Run with: node main.ts
// Writes a self-contained index.html into this directory and serves it
// on http://localhost:8080/ . No external dependencies, no network calls.

const fs = require('fs');
const http = require('http');
const path = require('path');

const PORT = 8080;
const OUT_FILE = path.join(__dirname, 'index.html');

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>Star Catcher</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; background: #050510; overflow: hidden; }
  body {
    display: flex; align-items: center; justify-content: center;
    font-family: "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
  }
  #wrap {
    position: relative;
    width: min(100vw, calc(100vh * 0.5625));
    height: min(100vh, calc(100vw / 0.5625));
  }
  canvas {
    display: block; width: 100%; height: 100%;
    border-radius: 12px;
    box-shadow: 0 0 60px rgba(90, 120, 255, 0.35);
    touch-action: none; cursor: pointer;
  }
</style>
</head>
<body>
<div id="wrap"><canvas id="game" width="540" height="960">STAR CATCHER — catch the falling stars with your basket!</canvas></div>
<script>
(function () {
  "use strict";

  var W = 540, H = 960;
  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");

  var PROMPT = "Build a tiny browser game where you catch falling stars with a basket";
  var AUTOPLAY = new URLSearchParams(window.location.search).get("autoplay") === "1";

  // ---------- background stars ----------
  var skyStars = [];
  for (var i = 0; i < 90; i++) {
    skyStars.push({
      x: Math.random() * W,
      y: Math.random() * H * 0.85,
      r: 0.6 + Math.random() * 1.8,
      phase: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 1.5
    });
  }

  // ---------- game state ----------
  var state = "start"; // start | playing | over
  var score = 0;
  var lives = 3;
  var best = 0;
  var stars = [];
  var spawnTimer = 0;
  var flash = 0;        // red flash on a miss
  var popups = [];      // floating "+10" texts
  var time = 0;

  var basket = { x: W / 2, y: 892, w: 120, h: 30, targetX: W / 2, speed: 0 };
  var keys = {};

  // ---------- helpers ----------
  function rand(min, max) { return min + Math.random() * (max - min); }

  function spawnStar() {
    var golden = Math.random() < 0.12;
    stars.push({
      x: rand(30, W - 30),
      y: -24,
      r: golden ? 19 : 14 + Math.random() * 5,
      vy: 0, // set below from score
      rot: rand(0, Math.PI * 2),
      spin: rand(-1.2, 1.2),
      golden: golden,
      tw: rand(0, Math.PI * 2)
    });
    var s = stars[stars.length - 1];
    s.vy = (150 + score * 1.4 + Math.random() * 50) * (golden ? 0.9 : 1);
  }

  function spawnInterval() {
    return Math.max(340, 950 - score * 5);
  }

  function reset() {
    score = 0;
    lives = 3;
    stars = [];
    popups = [];
    spawnTimer = 0;
    flash = 0;
    basket.x = W / 2;
    basket.targetX = W / 2;
    state = "playing";
  }

  function addPopup(x, y, text, color) {
    popups.push({ x: x, y: y, text: text, color: color, life: 1 });
  }

  // ---------- drawing ----------
  function drawBackground(t) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0b1035");
    g.addColorStop(0.55, "#1b2358");
    g.addColorStop(1, "#3a2a63");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // moon
    ctx.save();
    ctx.shadowColor = "rgba(255, 244, 200, 0.9)";
    ctx.shadowBlur = 40;
    ctx.fillStyle = "#fff3c4";
    ctx.beginPath();
    ctx.arc(452, 96, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "rgba(230, 220, 180, 0.55)";
    ctx.beginPath(); ctx.arc(440, 88, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(462, 108, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(458, 82, 4, 0, Math.PI * 2); ctx.fill();

    // twinkling sky stars
    for (var i = 0; i < skyStars.length; i++) {
      var s = skyStars[i];
      var a = 0.35 + 0.65 * Math.abs(Math.sin(t * s.speed + s.phase));
      ctx.globalAlpha = a;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ground
    var gg = ctx.createLinearGradient(0, 928, 0, H);
    gg.addColorStop(0, "#2c2140");
    gg.addColorStop(1, "#17102a");
    ctx.fillStyle = gg;
    ctx.fillRect(0, 928, W, H - 928);
    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    ctx.fillRect(0, 928, W, 2);
  }

  function drawStarShape(x, y, r, rot) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var ang = rot + i * Math.PI / 5 - Math.PI / 2;
      var rad = (i % 2 === 0) ? r : r * 0.45;
      var px = x + Math.cos(ang) * rad;
      var py = y + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function drawFallingStar(s, t) {
    var glow = s.golden ? "rgba(255, 200, 60, 0.95)" : "rgba(150, 200, 255, 0.9)";
    var core = s.golden ? "#ffd94d" : "#cfe6ff";
    var tw = 0.75 + 0.25 * Math.sin(t * 6 + s.tw);
    ctx.save();
    ctx.globalAlpha = tw;
    ctx.shadowColor = glow;
    ctx.shadowBlur = s.golden ? 26 : 16;
    ctx.fillStyle = core;
    drawStarShape(s.x, s.y, s.r, s.rot);
    ctx.fill();
    ctx.restore();
    // sparkle cross
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(s.x - s.r - 6, s.y); ctx.lineTo(s.x - s.r + 2, s.y);
    ctx.moveTo(s.x + s.r - 2, s.y); ctx.lineTo(s.x + s.r + 6, s.y);
    ctx.stroke();
  }

  function drawBasket() {
    var x = basket.x, y = basket.y, w = basket.w, h = basket.h;
    ctx.save();
    ctx.shadowColor = "rgba(255, 190, 90, 0.6)";
    ctx.shadowBlur = 18;
    // basket body: trapezoid
    var grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, "#e8a04c");
    grad.addColorStop(1, "#a86a1e");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.lineTo(x + w / 2, y);
    ctx.lineTo(x + w / 2 - 14, y + h);
    ctx.lineTo(x - w / 2 + 14, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // rim
    ctx.fillStyle = "#f7c873";
    ctx.beginPath();
    ctx.roundRect(x - w / 2 - 6, y - 7, w + 12, 12, 6);
    ctx.fill();
    // weave lines
    ctx.strokeStyle = "rgba(90, 50, 10, 0.55)";
    ctx.lineWidth = 2;
    for (var i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * 30 - 6, y + 4);
      ctx.lineTo(x + i * 30 - 10, y + h - 3);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + 12, y + h / 2);
    ctx.lineTo(x + w / 2 - 12, y + h / 2);
    ctx.stroke();
  }

  function drawHUD() {
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.font = "bold 30px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("SCORE  " + score, 22, 20);
    ctx.textAlign = "right";
    var hearts = "";
    for (var i = 0; i < 3; i++) hearts += (i < lives) ? "♥" : "♡";
    ctx.fillStyle = "#ff6b81";
    ctx.font = "bold 32px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(hearts, W - 22, 18);
    if (AUTOPLAY) {
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
      ctx.font = "14px 'Segoe UI', system-ui, sans-serif";
      ctx.fillText("AUTOPLAY DEMO", W / 2, 58);
    }
  }

  function drawPopups(dt) {
    ctx.textAlign = "center";
    ctx.font = "bold 24px 'Segoe UI', system-ui, sans-serif";
    for (var i = popups.length - 1; i >= 0; i--) {
      var p = popups[i];
      p.y -= 40 * dt;
      p.life -= dt * 1.1;
      if (p.life <= 0) { popups.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }

  function wrapText(text, x, y, maxWidth, lineHeight) {
    var words = text.split(" ");
    var line = "";
    var lines = [];
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = words[i];
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    var startY = y - (lines.length - 1) * lineHeight / 2;
    for (var j = 0; j < lines.length; j++) {
      ctx.fillText(lines[j], x, startY + j * lineHeight);
    }
  }

  function drawStart() {
    ctx.fillStyle = "rgba(5, 5, 20, 0.45)";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.save();
    ctx.shadowColor = "rgba(255, 220, 100, 0.9)";
    ctx.shadowBlur = 30;
    ctx.fillStyle = "#ffe27a";
    ctx.font = "bold 64px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText("STAR", W / 2, 300);
    ctx.fillText("CATCHER", W / 2, 368);
    ctx.restore();

    // decorative star
    ctx.save();
    ctx.shadowColor = "rgba(255, 200, 60, 0.95)";
    ctx.shadowBlur = 24;
    ctx.fillStyle = "#ffd94d";
    drawStarShape(W / 2, 210, 26, 0.3);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.font = "italic 21px 'Segoe UI', system-ui, sans-serif";
    wrapText("“" + PROMPT + "”", W / 2, 470, 440, 30);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText("Press SPACE / click to start", W / 2, 580);

    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.font = "19px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText("Move:  ← →  or  A / D  or  mouse / touch", W / 2, 650);
    ctx.fillText("Catch a star: +10    Golden star: +25", W / 2, 682);
    ctx.fillText("Miss a star: lose a life   •   3 lives", W / 2, 714);

    if (AUTOPLAY) {
      ctx.fillStyle = "#ffd94d";
      ctx.font = "bold 18px 'Segoe UI', system-ui, sans-serif";
      ctx.fillText("AUTOPLAY DEMO — sit back and watch", W / 2, 780);
    }
  }

  function drawGameOver() {
    ctx.fillStyle = "rgba(5, 5, 20, 0.6)";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillStyle = "#ff8fa3";
    ctx.font = "bold 56px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText("GAME OVER", W / 2, 380);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 34px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText("Final score: " + score, W / 2, 470);
    if (score >= best && score > 0) {
      ctx.fillStyle = "#ffd94d";
      ctx.font = "bold 22px 'Segoe UI', system-ui, sans-serif";
      ctx.fillText("★ New best! ★", W / 2, 516);
    }

    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.font = "24px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText("Press R or click to play again", W / 2, 580);
  }

  // ---------- update ----------
  function update(dt) {
    time += dt;
    if (flash > 0) flash -= dt * 2;

    if (state !== "playing") return;

    // basket movement
    var moveSpeed = 560;
    if (AUTOPLAY) {
      // track the lowest falling star
      var target = null;
      for (var i = 0; i < stars.length; i++) {
        if (!target || stars[i].y > target.y) target = stars[i];
      }
      if (target) basket.targetX = target.x;
      var dx = basket.targetX - basket.x;
      var step = Math.max(-moveSpeed * dt, Math.min(moveSpeed * dt, dx));
      basket.x += step;
    } else {
      if (keys["ArrowLeft"] || keys["a"] || keys["A"]) basket.x -= moveSpeed * dt;
      if (keys["ArrowRight"] || keys["d"] || keys["D"]) basket.x += moveSpeed * dt;
      // ease toward pointer target when the pointer moved recently
      var pdx = basket.targetX - basket.x;
      if (Math.abs(pdx) > 2 && pointerActive) {
        basket.x += Math.max(-moveSpeed * dt, Math.min(moveSpeed * dt, pdx));
      }
    }
    basket.x = Math.max(basket.w / 2, Math.min(W - basket.w / 2, basket.x));

    // spawn stars
    spawnTimer -= dt * 1000;
    if (spawnTimer <= 0) {
      spawnStar();
      spawnTimer = spawnInterval();
    }

    // move stars, check catches and misses
    for (var j = stars.length - 1; j >= 0; j--) {
      var s = stars[j];
      s.y += s.vy * dt;
      s.rot += s.spin * dt;
      var caught = s.y + s.r >= basket.y - 4 &&
                   s.y <= basket.y + basket.h &&
                   Math.abs(s.x - basket.x) <= basket.w / 2 + s.r * 0.5;
      if (caught) {
        var pts = s.golden ? 25 : 10;
        score += pts;
        addPopup(s.x, basket.y - 30, "+" + pts, s.golden ? "#ffd94d" : "#ffffff");
        stars.splice(j, 1);
        continue;
      }
      if (s.y - s.r > H - 8) {
        stars.splice(j, 1);
        lives -= 1;
        flash = 1;
        if (lives <= 0) {
          if (score > best) best = score;
          state = "over";
        }
      }
    }
  }

  // ---------- main loop ----------
  var last = performance.now();
  function loop(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    drawBackground(time);
    if (state === "start") {
      drawBasket();
      drawStart();
    } else {
      for (var i = 0; i < stars.length; i++) drawFallingStar(stars[i], time);
      drawBasket();
      drawPopups(dt);
      drawHUD();
      if (flash > 0) {
        ctx.fillStyle = "rgba(255, 40, 60, " + (flash * 0.25) + ")";
        ctx.fillRect(0, 0, W, H);
      }
      if (state === "over") drawGameOver();
    }
    requestAnimationFrame(loop);
  }

  // ---------- input ----------
  var pointerActive = false;

  function pointerX(clientX) {
    var rect = canvas.getBoundingClientRect();
    return (clientX - rect.left) / rect.width * W;
  }

  function press() {
    if (state === "start" || state === "over") reset();
  }

  window.addEventListener("keydown", function (e) {
    keys[e.key] = true;
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); press(); }
    if ((e.key === "r" || e.key === "R") && state === "over") reset();
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") e.preventDefault();
  });
  window.addEventListener("keyup", function (e) { keys[e.key] = false; });

  canvas.addEventListener("mousemove", function (e) {
    pointerActive = true;
    basket.targetX = pointerX(e.clientX);
  });
  canvas.addEventListener("mousedown", function (e) {
    pointerActive = true;
    basket.targetX = pointerX(e.clientX);
    press();
  });
  canvas.addEventListener("touchstart", function (e) {
    e.preventDefault();
    pointerActive = true;
    basket.targetX = pointerX(e.touches[0].clientX);
    press();
  }, { passive: false });
  canvas.addEventListener("touchmove", function (e) {
    e.preventDefault();
    pointerActive = true;
    basket.targetX = pointerX(e.touches[0].clientX);
  }, { passive: false });

  if (AUTOPLAY) {
    // demo mode: jump straight into the game so a recording shows gameplay
    reset();
  }

  requestAnimationFrame(loop);
})();
</script>
</body>
</html>
`;

// Write the game file.
fs.writeFileSync(OUT_FILE, HTML, 'utf8');

// Serve it over HTTP.
const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];
  const filePath = urlPath === '/' ? '/index.html' : urlPath;
  if (filePath !== '/index.html') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found\n');
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(OUT_FILE));
});

server.listen(PORT, () => {
  console.log('Star Catcher is ready!');
  console.log('Open http://localhost:' + PORT + '/ to play.');
  console.log('How to play: move the basket with Arrow keys / A,D / mouse / touch and catch the falling stars. Star = +10, golden star = +25, miss = lose a life (3 lives).');
  console.log('Demo mode (autoplay): http://localhost:' + PORT + '/?autoplay=1');
  console.log('Press Ctrl-C to stop.');
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
