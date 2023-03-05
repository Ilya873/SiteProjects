var walls = [];

//Создание квадрата
function addSquare(x, y) {
  // Создание объекта фигуры с использованием координат x и y
  let figure = { x: x-50, y: y-50, width: 100, height: 100 };
  
  // Добавление объекта фигуры в массив walls
  walls.push(figure);
}

//Создание треугольника_1
function addTriangle_1(x, y) {
  // Создание объекта фигуры с использованием координат x и y
  let figure = { x: x+50, y: y-100, points: [{x: 0, y: 50}, {x: 0, y: 150}, {x: -100, y: 150}], shape: 'triangle' };
  
  // Добавление объекта фигуры в массив walls
  walls.push(figure);
}

//Создание треугольника_2
function addTriangle_2(x, y) {
  // Создание объекта фигуры с использованием координат x и y
  let figure = { x: x-150, y: y-100, points: [{x: 100, y: 50}, {x: 200, y: 150}, {x: 100, y: 150}], shape: 'triangle' };
  
  // Добавление объекта фигуры в массив walls
  walls.push(figure);
}

//Создание динамита
function addDynamite(x, y) {
  // Создание объекта фигуры с использованием координат x и y
  let figure = { x: x-50, y: y-50, width: 100, height: 100, shape: 'dynamite' };
  
  // Добавление объекта фигуры в массив walls
  walls.push(figure);
}

function drawWalls() {
for (var i = 0; i < walls.length; i++) {
if (walls[i].shape === 'triangle') {
ctx.fillStyle = "black";
ctx.beginPath();
ctx.moveTo(walls[i].points[0].x + walls[i].x, walls[i].points[0].y + walls[i].y);
ctx.lineTo(walls[i].points[1].x + walls[i].x, walls[i].points[1].y + walls[i].y);
ctx.lineTo(walls[i].points[2].x + walls[i].x, walls[i].points[2].y + walls[i].y);
ctx.closePath();
ctx.fill();
} else if (walls[i].shape === 'dynamite'){
ctx.fillStyle = "red";
ctx.fillRect(walls[i].x, walls[i].y, walls[i].width, walls[i].height);
}
else
{
ctx.fillStyle = "black";
ctx.fillRect(walls[i].x, walls[i].y, walls[i].width, walls[i].height);
}
}
}