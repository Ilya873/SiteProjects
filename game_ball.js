// определение глобальных переменных
var canvas;
var ctx;
var x = 50; //начальной расположение x
var y = 50; //начальной расположение y
var dx = 2; //начальный импульс x
var dy = -10; //начальный импульс y
var radius = 20; //радиус шара
var gravity = 0.2; //сила гравитации
var friction = 0.05; //сила трения
var bounce = 0.5; //сила отскока
var isMoving = false;

// функция инициализации
function init() {
  canvas = document.getElementById("canvas");
  ctx = canvas.getContext("2d");
  canvas.width = 500;
  canvas.height = 500;
  drawCircle();
  canvas.addEventListener("click", function(event) {
    if (!isMoving) {
      x = event.clientX - canvas.offsetLeft;
      y = event.clientY - canvas.offsetTop;
      drawCircle();
    }
  });
document.addEventListener("keydown", function(event) {
  if (event.keyCode === 13 && !isMoving) {
    isMoving = true;
    animate();
  }
});
}

// функция анимации
function animate() {
  if (isMoving) {
    requestAnimationFrame(animate);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawCircle();
    x += dx;
    y += dy;
    dy += gravity;

    // определяем, находится ли шар на земле
    var isOnGround = y + radius >= canvas.height;

    // изменяем скорость, если шар на земле
    if (isOnGround) {
      y = canvas.height - radius;
      dy = -dy * bounce;
      dx = dx * (1 - friction);
    }

    // обрабатываем столкновения с границами
    if (x + radius > canvas.width) {
      x = canvas.width - radius;
      dx = -dx * (1 - friction);
    } else if (x - radius < 0) {
      x = radius;
      dx = -dx * (1 - friction);
    }

if (y - radius < 0) {
  y = radius;
  dy = -dy * bounce;
}

    // обрабатываем столкновения со стенами
    for (var i = 0; i < walls.length; i++) {
      var wall = walls[i];

      // определяем расстояние от центра шара до границы стены
      var distX = Math.abs(x - wall.x - wall.width / 2);
      var distY = Math.abs(y - wall.y - wall.height / 2);

      // проверяем, находится ли центр шара внутри границ стены
      if (distX <= wall.width / 2 + radius && distY <= wall.height / 2 + radius) {
        // произошло столкновение со стеной, определяем направление отскока

        // определяем сторону стены, с которой произошло столкновение
        var overlapX = wall.width / 2 - distX;
        var overlapY = wall.height / 2 - distY;
        
        // проверяем, находится ли шарик внутри стены
        if (overlapX >= 0 && overlapY >= 0) {
          if (overlapX < overlapY) {
            // столкновение произошло со стороной стены (отскок по горизонтали)
            if (x < wall.x + wall.width / 2) {
              // шар столкнулся с левой стороной стены
              x = wall.x - radius;
            } else {
              // шар столкнулся с правой стороной стены
              x = wall.x + wall.width + radius;
            }
            dx = -dx * bounce;
          } else {
            // столкновение произошло с верхней или нижней стороной стены (отскок по вертикали)
            if (y < wall.y + wall.height / 2) {
              // шар столкнулся с верхней стороной стены
              y = wall.y - radius;
      dx = dx * (1 - friction);
            } else {
              // шар столкнулся с нижней стороной стены
              y = wall.y + wall.height + radius;
}
dy = -dy * bounce;
}
} else {
// столкновение произошло с углом стены (отскок по диагонали)
if (overlapX < overlapY) {
// отскок по горизонтали
if (x < wall.x + wall.width / 2) {
// шар столкнулся с левой стороной стены
x = wall.x - radius;
} else {
// шар столкнулся с правой стороной стены
x = wall.x + wall.width + radius;
}
dx = -dx * bounce;
} else {
// отскок по вертикали
if (y < wall.y + wall.height / 2) {
// шар столкнулся с верхней стороной стены
y = wall.y - radius;
      dx = dx * (1 - friction);
} else {
// шар столкнулся с нижней стороной стены
y = wall.y + wall.height + radius;
}
dy = -dy * bounce;
}
}
}
}

    // останавливаем шар, если он почти не двигается
    if (Math.abs(dx) < 0.1) {
      dx = 0;
    }
    if (Math.abs(dy) < 0.1) {
      dy = 0;
    }
  }
}


// функция рисования круга
function drawCircle() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
  ctx.fillStyle = "red";
  ctx.fill();
}

// запуск игры
init();