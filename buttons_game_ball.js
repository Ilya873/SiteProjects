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
  music2.pause();
  music.loop = true;
  music.play();
		if (!isMoving)
		{
    isMoving = true;
	animate();
		}
  });
  
    document.getElementById("end-button").addEventListener("click", function(event) {
  music.pause();
  music2.loop = true;
  music2.play();
    isMoving = false;
	dx = 0;
	dy = 0;
if (score_game_record<score_game)
{
        score_game_record=score_game;
	score_record.innerHTML = score_game_record;
}
	score_game = 0;
	score.innerHTML = score_game;
	x = x_start;
	y = y_start;
	resetDynamites();
	ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawCircle();
    drawWalls();
  });