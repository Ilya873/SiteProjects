// Получаем элементы из DOM
const canvas = document.getElementById('canvas');
const context = canvas.getContext('2d');
const colorPicker = document.getElementById('color-picker');
const brushSize = document.getElementById('brush-size');
const opacitySlider = document.getElementById('opacity');
const saveButton = document.getElementById('save-button');

// Сохраняем холст в PNG при нажатии на кнопку
saveButton.addEventListener('click', function() {
  const fileName = prompt('Введите имя файла:', 'myCanvas');
  const link = document.createElement('a');
  link.download = fileName + '.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
});

// Устанавливаем размер холста в соответствии с размером экрана
canvas.width = window.innerWidth * 0.8;
canvas.height = window.innerHeight * 0.8;

// Устанавливаем начальный цвет, размер кисти и прозрачность
let currentColor = colorPicker.value;
let currentBrushSize = brushSize.value;
let currentOpacity = opacitySlider.value;

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

// Отслеживаем перемещение мыши на холсте и рисуем линию
let isDrawing = false;
let lastX = 0;
let lastY = 0;

canvas.addEventListener('mousedown', function(e) {
  isDrawing = true;
  lastX = e.clientX - canvas.offsetLeft;
  lastY = e.clientY - canvas.offsetTop;
  drawLine(e);
});

canvas.addEventListener('mousemove', drawLine);

canvas.addEventListener('mouseup', function() {
  isDrawing = false;
});

canvas.addEventListener('mouseleave', function() {
  isDrawing = false;
});

// Функция рисования линии
function drawLine(e) {
  if (isDrawing === true) {
    const x = e.clientX - canvas.offsetLeft;
    const y = e.clientY - canvas.offsetTop;
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