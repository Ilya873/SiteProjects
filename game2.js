class TicTacToe {
  constructor() {
    this.current_player = "X";
    this.board = [["", "", ""], ["", "", ""], ["", "", ""]];
    this.create_board();
  }

  create_board() {
    const table = $("<table></table>").appendTo("body");
    for (let i = 0; i < 3; i++) {
      const row = $("<tr></tr>").appendTo(table);
      for (let j = 0; j < 3; j++) {
        const button = $("<td></td>").appendTo(row);
        button.css({"font-size": "30px", "width": "50px", "height": "50px", "text-align": "center", "border": "1px solid black"});
        button.on("click", () => this.click_button(i, j));
      }
    }
    // добавим случайность в выбор первого хода ИИ
    if (Math.random() < 0.5) {
      this.current_player = "O";
      this.computer_move();
    }
  }

  click_button(x, y) {
    if (this.board[x][y] === "") {
      $(`table tr:nth-child(${x + 1}) td:nth-child(${y + 1})`).text(this.current_player);
      this.board[x][y] = this.current_player;
      if (this.check_win()) {
        alert(`Ты победил!`);
        this.reset_board();
      } else if (this.check_draw()) {
        alert("Ничья!");
        this.reset_board();
      } else {
        this.switch_player();
        this.computer_move();
      }
    }
  }

  computer_move() {
    if (this.check_win() || this.check_draw()) {
      return;
    }
    const free_cells = this.get_free_cells();
    if (free_cells.length > 0) {
      // добавим вероятность того, что ИИ совершит ошибку при выборе следующего хода
      const should_make_mistake = Math.random() < 0.2;
      let best_move;
      if (should_make_mistake) {
        best_move = free_cells[Math.floor(Math.random() * free_cells.length)];
      } else {
        // уменьшим глубину просмотра для функции минимакс, чтобы сократить время принятия решения
        const depth = Math.floor(Math.random() * 2) + 2;
        best_move = this.get_best_move(depth);
      }
      const x = best_move[0];
      const y = best_move[1];
      $(`table tr:nth-child(${x + 1}) td:nth-child(${y + 1})`).text(this.current_player);
      this.board[x][y] = this.current_player; if (this.check_win()) { alert(Компьютер победил!`);
      this.reset_board();
} else if (this.check_draw()) {
alert("Ничья!");
this.reset_board();
} else {
this.switch_player();
}
}
}

get_free_cells() {
const free_cells = [];
for (let i = 0; i < 3; i++) {
for (let j = 0; j < 3; j++) {
if (this.board[i][j] === "") {
free_cells.push([i, j]);
}
}
}
return free_cells;
}

switch_player() {
this.current_player = this.current_player === "X" ? "O" : "X";
}

check_win() {
for (let i = 0; i < 3; i++) {
if (this.board[i][0] !== "" && this.board[i][0] === this.board[i][1] && this.board[i][1] === this.board[i][2]) {
return true;
}
if (this.board[0][i] !== "" && this.board[0][i] === this.board[1][i] && this.board[1][i] === this.board[2][i]) {
return true;
}
}
if (this.board[0][0] !== "" && this.board[0][0] === this.board[1][1] && this.board[1][1] === this.board[2][2]) {
return true;
}
if (this.board[0][2] !== "" && this.board[0][2] === this.board[1][1] && this.board[1][1] === this.board[2][0]) {
return true;
}
return false;
}

check_draw() {
for (let i = 0; i < 3; i++) {
for (let j = 0; j < 3; j++) {
if (this.board[i][j] === "") {
return false;
}
}
}
return true;
}

reset_board() {
this.current_player = "X";
this.board = [["", "", ""], ["", "", ""], ["", "", ""]];
$("table td").text("");
}

// функция для оценки текущего состояния игрового поля
evaluate() {
if (this.check_win()) {
if (this.current_player === "X") {
return -1;
} else {
return 1;
}
} else {
return 0;
}
}

minimax(depth, maximizing_player) {
if (depth === 0 || this.check_win() || this.check_draw()) {
return this.evaluate();
}

if (maximizing_player) {
  let best_score = -Infinity;
  const free_cells = this.get_free_cells();
  for (let i = 0; i < free_cells.length; i++) {
    const x = free_cells[i][0];
    const y = free_cells[i][1];
    this.board[x][y] = "O";
    const score = this.minimax(depth - 1, false);
    this.board[x][y] = "";
    best_score = Math.max(best_score, score);

}
return best_score;
} else {
let best_score = Infinity;
const free_cells = this.get_free_cells();
for (let i = 0; i < free_cells.length; i++) {
const x = free_cells[i][0];
const y = free_cells[i][1];
this.board[x][y] = "X";
const score = this.minimax(depth - 1, true);
this.board[x][y] = "";
best_score = Math.min(best_score, score);
}
return best_score;
}
}

find_best_move() {
let best_score = -Infinity;
let best_move;
const free_cells = this.get_free_cells();
for (let i = 0; i < free_cells.length; i++) {
const x = free_cells[i][0];
const y = free_cells[i][1];
this.board[x][y] = "O";
const score = this.minimax(5, false);
this.board[x][y] = "";
if (score > best_score) {
best_score = score;
best_move = [x, y];
}
}
return best_move;
}

computer_move() {
const [x, y] = this.find_best_move();
$(table tr:nth-child(${x + 1}) td:nth-child(${y + 1})).text(this.current_player);
this.board[x][y] = this.current_player;
if (this.check_win()) {
alert("Компьютер победил!");
this.reset_board();
} else if (this.check_draw()) {
alert("Ничья!");
this.reset_board();
} else {
this.switch_player();
}
}
}

const game = new TicTacToe();
game.start();
