  // обработчики событий на кнопки
document.getElementById("ball-button").addEventListener("click", function(event) {
	//выбор мячика
	elem=0;
  // Обновляем данные пользователя
    var newMessageRef = messagesRef.push();
    newMessageRef.set({
        name: name_game,
        score: score_game
    });
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
	x = x_start;
	y = y_start;
	resetDynamites();
	ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawCircle();
    drawWalls();
	let score_save = score_game;
  	score_game = 0;
	score.innerHTML = score_game;
	let name_game = prompt(`Количество набранных очков: ${score_save}, введите!!! ваше имя (до 10 символов).`);
	name_game = name_game.substring(0, 10);
firebase.auth().signInAnonymously().then(function() {
  var user = firebase.auth().currentUser;
  user.getIdTokenResult().then(function(idTokenResult) {
    if (idTokenResult.claims.guest) {
      firebase.database().ref('data').push({
        	  // Сохраняем имя игрока и количество очков в базу данных
  if (name_game) {
    const messagesRef = firebase.database().ref('scores');
    messagesRef.push({
      name: name_game,
      score: score_save
    });
     // Обновляем таблицу с данными
    updateTable();
  }
        url: 'https://ilya873.github.io/SiteProjects/game_ball.html'
      });
    }
  });
});
});

function updateTable() {
  const messagesRef = firebase.database().ref('scores');
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

    // Очищаем таблицу
    tableBody.innerHTML = '';

    // Заполняем таблицу новыми данными
    sortedData.forEach((item) => {
      const name = item.name;
      const score = item.score;

      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      const scoreCell = document.createElement('td');

      nameCell.textContent = name;
      scoreCell.textContent = score;

      row.appendChild(nameCell);
      row.appendChild(scoreCell);

      tableBody.appendChild(row);
    });
  });
}