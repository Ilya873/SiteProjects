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
  }

  click_button(x, y) {
    if (this.board[x][y] === "") {
      $(`table tr:nth-child(${x + 1}) td:nth-child(${y + 1})`).text(this.current_player);
      this.board[x][y] = this.current_player;
      if (this.check_win()) {
        alert(`Player ${this.current_player} wins!`);
        this.reset_board();
      } else if (this.check_draw()) {
        alert("Draw!");
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
      const best_move = this.get_best_move();
      const x = best_move[0];
      const y = best_move[1];
      $(`table tr:nth-child(${x + 1}) td:nth-child(${y + 1})`).text("O");
      this.board[x][y] = "O";
      if (this.check_win()) {
        alert("You lose!");
        this.reset_board();
      } else if (this.check_draw()) {
        alert("Draw!");
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

get_best_move() {
const free_cells = this.get_free_cells();
let best_score = -Infinity;
let best_move = null;
for (const [x, y] of free_cells) {
this.board[x][y] = "O";
const score = this.minimax(false);
this.board[x][y] = "";
if (score > best_score) {
best_score = score;
best_move = [x, y];
}
}
return best_move;
}

minimax(is_maximizing) {
if (this.check_win()) {
return is_maximizing ? -1 : 1;
}
if (this.check_draw()) {
return 0;
}
if (is_maximizing) {
let best_score = -Infinity;
for (const [x, y] of this.get_free_cells()) {
this.board[x][y] = "O";
const score = this.minimax(false);
this.board[x][y] = "";
best_score = Math.max(best_score, score);
}
return best_score;
} else {
let best_score = Infinity;
for (const [x, y] of this.get_free_cells()) {
this.board[x][y] = "X";
const score = this.minimax(true);
this.board[x][y] = "";
best_score = Math.min(best_score, score);
}
return best_score;
}
}

check_win() {
// check rows
for (let i = 0; i < 3; i++) {
if (this.board[i][0] !== "" && this.board[i][0] === this.board[i][1] && this.board[i][1] === this.board[i][2]) {
return true;
}
}
// check columns
for (let j = 0; j < 3; j++) {
if (this.board[0][j] !== "" && this.board[0][j] === this.board[1][j] && this.board[1][j] === this.board[2][j]) {
return true;
}
}
// check diagonals
if (this.board[1][1] !== "") {
if (this.board[0][0] === this.board[1][1] && this.board[1][1] === this.board[2][2]) {
return true;
}
if (this.board[0][2] === this.board[1][1] && this.board[1][1] === this.board[2][0]) {
return true;
}
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

switch_player() {
this.current_player = this.current_player === "X" ? "O" : "X";
}
  
reset_board() {
this.current_player = "X";
this.board = [["", "", ""], ["", "", ""], ["", "", ""]];
$("table td").text("");
}
}

const game = new TicTacToe();
