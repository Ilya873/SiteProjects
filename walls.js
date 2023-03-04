var walls = [
  { x: 100, y: 100, width: 100, height: 200 },
  { x: 200, y: 150, width: 100, height: 300 },
  { x: 300, y: 100, width: 100, height: 200 },
];

function drawWalls() {
  ctx.fillStyle = "black";
  for (var i = 0; i < walls.length; i++) {
    ctx.fillRect(walls[i].x, walls[i].y, walls[i].width, walls[i].height);
  }
}

function drawCircle() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawWalls();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
  ctx.fillStyle = "red";
  ctx.fill();
}