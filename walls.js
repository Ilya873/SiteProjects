var walls = [
  { x: 100, y: 100, width: 100, height: 200 },
  { x: 200, y: 150, width: 100, height: 300 },
  { x: 300, y: 100, width: 100, height: 200 },
  { x: 150, y: 350, width: 150, height: 150, type: "triangle" },
  { x: 350, y: 250, width: 200, height: 100, type: "triangle" }
];

function drawWalls() {
  ctx.fillStyle = "black";
  for (var i = 0; i < walls.length; i++) {
    if (walls[i].type === "triangle") {
      ctx.beginPath();
      ctx.moveTo(walls[i].x, walls[i].y + walls[i].height);
      ctx.lineTo(walls[i].x + walls[i].width, walls[i].y + walls[i].height);
      ctx.lineTo(walls[i].x + walls[i].width, walls[i].y);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillRect(walls[i].x, walls[i].y, walls[i].width, walls[i].height);
    }
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