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
let brushType = "round"; // По умолчанию рисуем кругами

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
colorPicker.addEventListener('input', function() {
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

const brushTypeButton = document.getElementById('brush-button');
const brushTypeSelect = document.getElementById('brush-type');

brushTypeButton.addEventListener('click', function() {
  brushTypeSelect.style.display = brushTypeSelect.style.display === "none" ? "inline-block" : "none";
});

brushTypeSelect.addEventListener('change', function() {
  brushType = brushTypeSelect.value;
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
});

canvas.addEventListener('touchmove', function(e) {
  if (isDrawing) {
    const x = e.touches[0].clientX - canvas.offsetLeft;
    const y = e.touches[0].clientY - canvas.offsetTop;
    context.beginPath();
    context.moveTo(lastX, lastY);
    context.lineTo(x, y);
    context.strokeStyle = currentColor;
    context.lineWidth = currentBrushSize;
    context.lineCap = 'round';
    context.globalAlpha = currentOpacity;
    context.stroke();
    lastX = x;
    lastY = y;
    e.preventDefault();
  }
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
      context.fillStyle = currentColor;
      context.globalAlpha = currentOpacity;

      context.beginPath();
      
      if (brushType === "round") {
        const radius = Math.max(1, Math.floor(currentBrushSize / 2));
        context.arc(x, y, radius, 0, 2 * Math.PI);
        context.fill();
      } else if (brushType === "square") {
        const halfSize = Math.floor(currentBrushSize / 2);
        context.fillRect(x - halfSize, y - halfSize, currentBrushSize, currentBrushSize);
      }
      
      lastX = x;
      lastY = y;
    }
  }
}

let scaleFactor = 1; // текущий масштаб

// Нажатие на кнопку "Приблизить"
zoomIn.addEventListener('click', function() {
  scaleFactor *= 1.1;
  // ограничиваем масштабирование
  scaleFactor = Math.max(0.1, Math.min(scaleFactor, 10));
  
  // устанавливаем новый масштаб холста и точку трансформации
  canvas.style.transform = `scale(${scaleFactor})`;
});

// Нажатие на кнопку "Отдалить"
zoomOut.addEventListener('click', function() {
  scaleFactor /= 1.1;
  // ограничиваем масштабирование
  scaleFactor = Math.max(0.1, Math.min(scaleFactor, 10));
  
  // устанавливаем новый масштаб холста и точку трансформации
  canvas.style.transform = `scale(${scaleFactor})`;
});

// Обработчик события колесика мыши для приближения и отдаления холста
canvas.addEventListener('wheel', function(e) {
  e.preventDefault();

  const zoomIntensity = 0.1; // Интенсивность приближения/отдаления

  // Определяем текущий масштаб холста
  let scale = parseFloat(canvas.style.transform.replace('scale(', '').replace(')', '')) || 1;

  // Определяем направление колесика мыши
  const delta = Math.sign(e.deltaY);

  // Меняем масштаб холста в зависимости от направления колесика мыши
  if (delta > 0) {
    scale -= zoomIntensity;
  } else if (delta < 0) {
    scale += zoomIntensity;
  }

  // Ограничиваем масштаб холста от 0.1 до 10
  scale = Math.max(0.1, Math.min(scale, 10));

  // Устанавливаем новый масштаб холста
  canvas.style.transform = `scale(${scale})`;

});