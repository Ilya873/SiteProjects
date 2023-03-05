  // обработчики событий на кнопки
  document.getElementById("ball-button").addEventListener("click", function(event) {
    //выбор мячика
	elem=0;
  });
  document.getElementById("square-button").addEventListener("click", function(event) {
    //выбор прямоугольника
	elem=1;
  });

  document.getElementById("triangle1-button").addEventListener("click", function(event) {
    //выбор треугольника1
	elem=2;
  });

  document.getElementById("triangle2-button").addEventListener("click", function(event) {
    //выбор треугольника2
	elem=3;
  });

  document.getElementById("bomb-button").addEventListener("click", function(event) {
    //выбор бомбы
	elem=4;
  });
  
    document.getElementById("start-button").addEventListener("click", function(event) {
    isMoving = true;
	animate();
  });
  
    document.getElementById("end-button").addEventListener("click", function(event) {
    //завершение игры
  });