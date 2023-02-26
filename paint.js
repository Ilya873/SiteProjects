// Получаем элементы из DOM
const canvas = document.getElementById('canvas');
const context = canvas.getContext('2d');
const colorPicker = document.getElementById('color-picker');
const brushSize = document.getElementById('brush-size');
const opacitySlider = document.getElementById('opacity');
const saveButton = document.getElementById('save-button');
const canvasWidthInput = document.getElementById('canvas-width');
const canvasHeightInput = document.getElementById('canvas-height');
const resizeButton = document.getElementById('resize-button');
const clearButton = document.getElementById('clear-button');
const fillButton = document.getElementById('fill-button');
const brushButton = document.getElementById('brush-button');
const zoomIn = document.getElementById('zoom-in');
const zoomOut = document.getElementById('zoom-out');

let fillMode = false;

// Сохраняем холст в PNG при нажатии на кнопку
saveButton.addEventListener('click', function() {
  const fileName = prompt('Введите имя файла:', 'myCanvas');
  const link = document.createElement('a');
  link.download = fileName + '.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
});

// Устанавливаем размер холста
const newWidth = parseInt(canvasWidthInput.value);
const newHeight = parseInt(canvasHeightInput.value);
canvas.width = newWidth;
canvas.height = newHeight;

// Устанавливаем начальный цвет, размер кисти и прозрачность
let currentColor = colorPicker.value;
let currentBrushSize = brushSize.value;
let currentOpacity = opacitySlider.value;

// Отслеживаем изменения размера холста
resizeButton.addEventListener('click', function() {
  const newWidth = parseInt(canvasWidthInput.value);
  const newHeight = parseInt(canvasHeightInput.value);
  canvas.width = newWidth;
  canvas.height = newHeight;
});

// Добавляем обработчик события клика на кнопку
clearButton.addEventListener('click', function() {
  // Очищаем холст
  context.clearRect(0, 0, canvas.width, canvas.height);
});

// Отслеживаем изменения выбранного цвета
colorPicker.addEventListener('change', function() {
  currentColor = colorPicker.value;
});

// Отслеживаем изменения размера кисти
brushSize.addEventListener('change', function() {
  currentBrushSize = brushSize.value;
});

// Отслеживаем изменения прозрачности кисти
opacitySlider.addEventListener('input', function() {
  currentOpacity = opacitySlider.value;
});

// Нажатие на кнопку "Заливка"
fillButton.addEventListener('click', function() {
  fillMode = true;
});

// Нажатие на кнопку "Кисть"
brushButton.addEventListener('click', function() {
  fillMode = false;
});

// Отслеживаем перемещение мыши на холсте и рисуем линию
let isDrawing = false;
let lastX = 0;
let lastY = 0;

canvas.addEventListener('mousedown', function(e) {
  isDrawing = true;
lastX = e.offsetX;
lastY = e.offsetY;
  drawLine(e);
});

canvas.addEventListener('mousemove', drawLine);

canvas.addEventListener('mouseup', function() {
  isDrawing = false;
});

canvas.addEventListener('mouseleave', function() {
  isDrawing = false;
});

canvas.addEventListener('touchstart', function(e) {
  isDrawing = true;
  lastX = e.touches[0].clientX - canvas.offsetLeft;
  lastY = e.touches[0].clientY - canvas.offsetTop;
  drawLine(e);
});

canvas.addEventListener('touchmove', function(e) {
  e.preventDefault();
  drawLine(e.touches[0]);
});

canvas.addEventListener('touchend', function() {
  isDrawing = false;
});

function fillCanvas(x, y, fillColor) {
  // Создаем пустой стек и помещаем в него начальную точку
  const stack = [[x, y]];
  
  // Получаем текущий цвет пикселя в начальной точке
  const startColor = context.getImageData(x, y, 1, 1).data;
  
  // Пока стек не пустой
  while (stack.length > 0) {
    // Извлекаем последнюю точку из стека
    const [x, y] = stack.pop();
    
    // Если текущий пиксель не является начальным цветом, пропускаем его
    const pixelColor = context.getImageData(x, y, 1, 1).data;
    if (!colorsMatch(pixelColor, startColor)) {
      continue;
    }
    
    // Иначе закрашиваем текущий пиксель нужным цветом
    context.fillStyle = fillColor;
    context.fillRect(x, y, 1, 1);
    
    // Добавляем в стек соседние точки
    if (x > 0) {
      stack.push([x - 1, y]);
    }
    if (x < canvas.width - 1) {
      stack.push([x + 1, y]);
    }
    if (y > 0) {
      stack.push([x, y - 1]);
    }
    if (y < canvas.height - 1) {
      stack.push([x, y + 1]);
    }
  }
}

// Функция для сравнения цветов
function colorsMatch(color1, color2) {
  return color1[0] === color2[0]
    && color1[1] === color2[1]
    && color1[2] === color2[2]
    && color1[3] === color2[3];
}

// Функция рисования линии, закраски
function drawLine(e) {
  if (isDrawing === true) {
    const x = e.offsetX;
    const y = e.offsetY;
    if (fillMode === true) {
      const fillColor = currentColor;
      fillCanvas(x, y, fillColor);
    } else {
      context.strokeStyle = currentColor;
      context.lineWidth = currentBrushSize;
      context.globalAlpha = currentOpacity;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(lastX, lastY);
      context.lineTo(x, y);
      context.stroke();
      lastX = x;
      lastY = y;
    }
  }
}

let scaleFactor = 1; // текущий масштаб

canvas.addEventListener('wheel', function(e) {
  e.preventDefault();
  
  // определяем направление скролла
  let delta = Math.max(-1, Math.min(1, (e.wheelDelta || -e.detail)));
  
  // вычисляем позицию курсора на холсте
  const canvasRect = canvas.getBoundingClientRect();
  const mouseX = (e.clientX - canvasRect.left) / scaleFactor;
  const mouseY = (e.clientY - canvasRect.top) / scaleFactor;
  
  // увеличиваем или уменьшаем масштаб
  if (delta > 0) {
    scaleFactor *= 1.1;
  } else {
    scaleFactor /= 1.1;
  }
  
  // ограничиваем масштабирование
  scaleFactor = Math.max(0.1, Math.min(scaleFactor, 10));
  
  // устанавливаем новый масштаб холста и точку трансформации
  const canvasOriginX = mouseX / canvas.width;
  const canvasOriginY = mouseY / canvas.height;
  canvas.style.transformOrigin = `${canvasOriginX * 100}% ${canvasOriginY * 100}%`;
  canvas.style.transform = `scale(${scaleFactor})`;
});

// Нажатие на кнопку "Приблизить"
zoomIn.addEventListener('click', function() {
  scaleFactor *= 1.1;
  // ограничиваем масштабирование
  scaleFactor = Math.max(0.1, Math.min(scaleFactor, 10));
  
  // устанавливаем новый масштаб холста и точку трансформации
  // устанавливаем новый масштаб холста и точку трансформации
  canvas.style.transformOrigin = `${50}% ${50}%`;
  canvas.style.transform = `scale(${scaleFactor})`;
});

// Нажатие на кнопку "Отдалить"
zoomOut.addEventListener('click', function() {
  scaleFactor /= 1.1;
  // ограничиваем масштабирование
  scaleFactor = Math.max(0.1, Math.min(scaleFactor, 10));
  
  // устанавливаем новый масштаб холста и точку трансформации
  canvas.style.transformOrigin = `${50}% ${50}%`;
  canvas.style.transform = `scale(${scaleFactor})`;
});