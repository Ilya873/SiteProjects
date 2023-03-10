// определение глобальных переменных
var canvas;
var ctx;
var x = 50; //начальной расположение x
var y = 50; //начальной расположение y
var dx = 0; //начальный импульс x
var dy = 0; //начальный импульс y
var radius = 20; //радиус шара
var gravity = 0.2; //сила гравитации
var friction = 0.05; //сила трения
var bounce = 0.5; //сила отскока
var isMoving = false;
var elem = 0; //0 - шар, 1 - прямоугольник, 2 - треугольник_1, 3 - треугольник_2, 4 - динамит
var score = document.getElementById("Score");
var score_game = 0;
var score_record = document.getElementById("Score_record");
var score_game_record = 0;
var music = new Audio('MusicGame.wav');
var music2 = new Audio('MusicGame2.wav');

score.innerHTML = score_game;
score_record.innerHTML = score_game_record;

const colorBallInput = document.querySelector('#color-ball');
const colorWallInput = document.querySelector('#color-wall');
const colorBackgroundInput = document.querySelector('#color-background');
const colorDynamiteInput = document.querySelector('#color-dynamite');

color_ball = colorBallInput.value; //цвет шара
color_wall = colorWallInput.value; //цвет стен
color_background = colorBackgroundInput.value; //цвет фона
color_dynamite = colorDynamiteInput.value; //цвет динамита

colorBallInput.addEventListener('input', () => {
  color_ball = colorBallInput.value;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawCircle();
    drawWalls();
});

colorWallInput.addEventListener('input', () => {
  color_wall = colorWallInput.value;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawCircle();
    drawWalls();
});

colorBackgroundInput.addEventListener('input', () => {
  color_background = colorBackgroundInput.value;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawCircle();
    drawWalls();
});

colorDynamiteInput.addEventListener('input', () => {
  color_dynamite = colorDynamiteInput.value;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawCircle();
    drawWalls();
});

var config = {
    apiKey: "AIzaSyAAWPiBoZYYImN_yR52qAism8DmBAOdT0s",
    authDomain: "gamescore-713e7.firebaseapp.com",
    databaseURL: "https://gamescore-713e7-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "gamescore-713e7",
    storageBucket: "gamescore-713e7.appspot.com",
    messagingSenderId: "102939775023",
    appId: "1:102939775023:web:d7c320e0be370632ee76da",
    measurementId: "G-GT6P7HP89P"
};
firebase.initializeApp(config);
var messagesRef = firebase.database().ref('scores');

const tableBody = document.querySelector('#table-body');

messagesRef.once('value').then((snapshot) => {
  const data = snapshot.val();
  const maxScores = {};

  // Группируем данные по имени игрока и сохраняем максимальное количество очков
  Object.keys(data).forEach(key => {
    const item = data[key];
    const name = item.name;
    const score = item.score;
    if (!maxScores[name] || score > maxScores[name]) {
      maxScores[name] = score;
    }
  });

  // Создаем список игроков и их максимальных очков
  const sortedData = Object.keys(maxScores)
  .map(name => ({ name, score: maxScores[name] }))
  .sort((a, b) => b.score - a.score)
  .slice(0, 10);
  
  sortedData.forEach((item, index) => {
    const name = item.name;
    const score = item.score;

    const row = document.createElement('tr');
    const indexCell = document.createElement('td');
    const nameCell = document.createElement('td');
    const scoreCell = document.createElement('td');

    indexCell.textContent = index + 1; // добавляем номер ряда
    nameCell.textContent = name;
    scoreCell.textContent = score;

    row.appendChild(indexCell);
    row.appendChild(nameCell);
    row.appendChild(scoreCell);

    tableBody.appendChild(row);
  });
});

// функция инициализации
function init() {
  x_start = x;
  y_start = y;
  canvas = document.getElementById("canvas");
  ctx = canvas.getContext("2d");
  canvas.width = 500;
  canvas.height = 500;
  drawCircle();
  canvas.addEventListener("click", function(event) {
  music.pause();
  music2.loop = true;
  music2.play();
	 if (!isMoving) {
		 		// Вычисление координат ячейки
let cellX = Math.floor((event.clientX - canvas.offsetLeft) / 100);
let cellY = Math.floor((event.clientY - canvas.offsetTop) / 100);

// Вычисление центра ячейки
let centerX = cellX * 100 + 50;
let centerY = cellY * 100 + 50;
		if (elem === 0)
	{
      x = centerX;
      y = centerY;
	  x_start = centerX;
	  y_start = centerY;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawCircle();
      drawWalls();
	}
		if (elem === 1)
	{
		addSquare(centerX, centerY);
		drawWalls();
	}
		if (elem === 2)
	{
		addTriangle_1(centerX, centerY);
		drawWalls();
	}
		if (elem === 3)
	{
		addTriangle_2(centerX, centerY);
		drawWalls();
	}
		if (elem === 4)
	{
		addDynamite(centerX, centerY);
		drawWalls();
	}
	  }
  });
  
canvas.addEventListener("contextmenu", function(event) {
  event.preventDefault(); // предотвращаем открытие контекстного меню браузера
  if (!isMoving) { 
    let mouseX = event.clientX - canvas.offsetLeft;
    let mouseY = event.clientY - canvas.offsetTop;

    // проверяем, находится ли точка клика внутри какой-либо из фигур
    for (let i = 0; i < walls.length; i++) {
      let figure = walls[i];
      if (figure.shape === 'triangle') {
        let triangle = new SAT.Polygon(new SAT.Vector(figure.x, figure.y), [
          new SAT.Vector(figure.points[0].x, figure.points[0].y),
          new SAT.Vector(figure.points[1].x, figure.points[1].y),
          new SAT.Vector(figure.points[2].x, figure.points[2].y)
        ]);
        let point = new SAT.Vector(mouseX, mouseY);
        if (SAT.pointInPolygon(point, triangle)) {
          walls.splice(i, 1); // удаление треугольника из массива walls
          break;
        }
      } else if (mouseX >= figure.x && mouseX <= figure.x + figure.width && mouseY >= figure.y && mouseY <= figure.y + figure.height) {
		  if (figure.shape !== 'dynamite')
		  {
			  walls.splice(i, 1); // удаление фигуры из массива walls
		  }
		  else
		  {
			  walls.splice(i, 1); // удаление фигуры из массива walls
			  dynamites.splice(dynamites.indexOf(figure), 1); // удаление динамита из массива dynamites
		  }
        break;
      }
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawCircle();
    drawWalls();
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
    drawWalls();
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
	  // определяем столкновение с обычными прямоугольниками
	  if (wall.shape !== "triangle" && wall.shape !== "dynamite") {
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
			if (dx>0.1)
{
	    score_game++;
	score.innerHTML = score_game;
}
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
if (dy>0.1)
{
	    score_game++;
	score.innerHTML = score_game;
}
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
if (dx>0.1)
{
	    score_game++;
	score.innerHTML = score_game;
}
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
if (dy>0.1)
{
	    score_game++;
	score.innerHTML = score_game;
}
}
}
}
}
else if (wall.shape === "triangle")
{
  // определяем столкновение с треугольниками
  // определяем вершины треугольника
  var triangle = new SAT.Polygon(new SAT.Vector(wall.x, wall.y), [    new SAT.Vector(wall.points[0].x, wall.points[0].y),
    new SAT.Vector(wall.points[1].x, wall.points[1].y),
    new SAT.Vector(wall.points[2].x, wall.points[2].y)
  ]);
  // определяем круг
  var circle = new SAT.Circle(new SAT.Vector(x, y), radius);
  // проверяем столкновение
  var response = new SAT.Response();
  var collided = SAT.testCirclePolygon(circle, triangle, response);
  if (collided) {
    // произошло столкновение со стеной, определяем направление отскока
    var overlap = response.overlapV;
    var normal = response.overlapN;
    // отбрасываем шарик на расстояние, равное перекрытию
    x -= overlap.x;
    y -= overlap.y;
    // проверяем, находится ли центр шара внутри треугольника
    var isInside = SAT.pointInPolygon(new SAT.Vector(x, y), triangle);
    if (isInside) {
      // отбрасываем шар за пределы треугольника
      var dist = response.overlap;
      x += dist * normal.x;
      y += dist * normal.y;
    }
    // отражаем скорость шарика относительно нормали стены
    var dot = dx * normal.x + dy * normal.y;
    dx = (dx - 1.5 * dot * normal.x) * (1 - friction);
    dy = (dy - 1.5 * dot * normal.y) * (1 - friction);
    if (dy > 2) {
      score_game++;
      score.innerHTML = score_game;
    }
    if (dx > 2) {
      score_game++;
      score.innerHTML = score_game;
    }
  }
}
else if (wall.shape === "dynamite")
{
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
            dx = -dx * bounce*10;
          } else {
            // столкновение произошло с верхней или нижней стороной стены (отскок по вертикали)
            if (y < wall.y + wall.height / 2) {
              // шар столкнулся с верхней стороной стены
              y = wall.y - radius;
            } else {
              // шар столкнулся с нижней стороной стены
              y = wall.y + wall.height + radius;
}
dy = -dy * bounce*10;
}
	    score_game++;
	score.innerHTML = score_game;
walls.splice(i, 1); // удаляем динамит из массива стен
i--;
numWalls--;
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

// функция рисования круга и фона
function drawCircle() {
ctx.fillStyle = color_background; // установка цвета фона в белый
ctx.fillRect(0, 0, canvas.width, canvas.height); // рисование прямоугольника на всю область canvas
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
  ctx.fillStyle = color_ball;
  ctx.fill();
}

// запуск игры
init();