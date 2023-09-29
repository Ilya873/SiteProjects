const canvas = document.getElementById("snakeCanvas");
const ctx = canvas.getContext("2d");

const WIDTH = 600;
const HEIGHT = 600;
const SPEED = 15;
const BLACK = "#000";

const increaseSnakesButton = document.getElementById("increaseSnakes");
const decreaseSnakesButton = document.getElementById("decreaseSnakes");
const increaseFoodButton = document.getElementById("increaseFood");
const decreaseFoodButton = document.getElementById("decreaseFood");
const restartGameButton = document.getElementById("restartGame");

let snakes = 4;
let foods = 3;

const snakeCountSpan = document.getElementById("snakeCount");
const foodCountSpan = document.getElementById("foodCount");

function updateCounts() {
    snakeCountSpan.textContent = snakes;
    foodCountSpan.textContent = foods;
}

increaseSnakesButton.addEventListener("click", () => {
    snakes++;
    updateCounts(); // Обновляем числа при увеличении змеек
});

decreaseSnakesButton.addEventListener("click", () => {
    if (snakes > 0) {
        snakes--;
        updateCounts(); // Обновляем числа при уменьшении змеек
    }
});

increaseFoodButton.addEventListener("click", () => {
    foods++;
    updateCounts(); // Обновляем числа при увеличении количества еды
});

decreaseFoodButton.addEventListener("click", () => {
    if (foods > 0) {
        foods--;
        updateCounts(); // Обновляем числа при уменьшении количества еды
    }
});

restartGameButton.addEventListener("click", () => {
    game.restartGame(); // Вызываем метод restartGame из объекта game
});

canvas.width = WIDTH;
canvas.height = HEIGHT;
document.title = "Змейка";

function randomColor() {
    const colors = ["#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF"];
    return colors[Math.floor(Math.random() * colors.length)];
}

class Snake {
    constructor() {
        this.body = [{ x: 100, y: 50 }, { x: 90, y: 50 }, { x: 80, y: 50 }];
        this.direction = "RIGHT";
        this.color = "#00FF00";
        this.alive = true;
        this.length = 3; // Длина змейки
    }

    move(food, otherSnakes) {
        if (!this.alive) return;

        const { x, y } = this.body[0];
        let newHead;

        switch (this.direction) {
            case "RIGHT":
                newHead = { x: x + 10, y };
                break;
            case "LEFT":
                newHead = { x: x - 10, y };
                break;
            case "UP":
                newHead = { x, y: y - 10 };
                break;
            case "DOWN":
                newHead = { x, y: y + 10 };
                break;
        }

        // Проверка на столкновение головы змейки с её собственным телом
        if (this.body.slice(1).some(segment => segment.x === newHead.x && segment.y === newHead.y)) {
            this.alive = false;
        }

        this.body.unshift(newHead);

        // Если змейка съела еду, увеличиваем длину
        if (this.body[0].x === food.position.x && this.body[0].y === food.position.y) {
            food.randomizePosition();
            this.length++; // Увеличиваем длину змейки
        }

        // Обрезаем хвост змейки, чтобы она была длины length
        while (this.body.length > this.length) {
            this.body.pop();
        }

        // Проверяем столкновение с границами окна и обеспечиваем переход на противоположную сторону
        if (this.body[0].x < 0) {
            this.body[0].x = WIDTH - 10;
        } else if (this.body[0].x >= WIDTH) {
            this.body[0].x = 0;
        } else if (this.body[0].y < 0) {
            this.body[0].y = HEIGHT - 10;
        } else if (this.body[0].y >= HEIGHT) {
            this.body[0].y = 0;
        }

        // Проверка на столкновение с другими змейками
        for (const snake of otherSnakes) {
            if (snake !== this && this.body.some(segment => snake.body.some(s => s.x === segment.x && s.y === segment.y))) {
                this.alive = false;
            }
        }
    }

    changeDirection(newDirection) {
        if (newDirection === "RIGHT" && this.direction !== "LEFT") {
            this.direction = "RIGHT";
        } else if (newDirection === "LEFT" && this.direction !== "RIGHT") {
            this.direction = "LEFT";
        } else if (newDirection === "UP" && this.direction !== "DOWN") {
            this.direction = "UP";
        } else if (newDirection === "DOWN" && this.direction !== "UP") {
            this.direction = "DOWN";
        }
    }

    getHeadPosition() {
        return this.body[0];
    }

    draw() {
        for (const segment of this.body) {
            ctx.fillStyle = this.color;
            ctx.fillRect(segment.x, segment.y, 10, 10);
        }
    }
}

class Food {
    constructor() {
        this.position = { x: randomPosition(), y: randomPosition() };
        this.isFoodOnScreen = true;
    }

    randomizePosition() {
        this.position = { x: randomPosition(), y: randomPosition() };
        this.isFoodOnScreen = true;
    }

    drawFood() {
        if (this.isFoodOnScreen) {
            ctx.fillStyle = randomColor();
            ctx.fillRect(this.position.x, this.position.y, 10, 10);
        }
    }
}

function randomPosition() {
    return Math.floor(Math.random() * (WIDTH / 10)) * 10;
}

class AISnake extends Snake {
    constructor(x, y) {
        super();
        this.body = [{ x, y }, { x: x - 10, y }, { x: x - 20, y }];
		this.color = "#FF0000";
    }

    move(food, otherSnakes) {
        if (!this.alive) return;

        const { x: headX, y: headY } = this.getHeadPosition();
        const { x: foodX, y: foodY } = food.position;

        // Логика движения к ближайшей еде и избегания границ окна
        let newDirection = this.direction;

        if (headX < foodX) {
            newDirection = "RIGHT";
        } else if (headX > foodX) {
            newDirection = "LEFT";
        } else if (headY < foodY) {
            newDirection = "DOWN";
        } else if (headY > foodY) {
            newDirection = "UP";
        }

        // Проверка на столкновение с другими змейками
        for (const snake of otherSnakes) {
            if (snake !== this && this.body.some(segment => snake.body.some(s => s.x === segment.x && s.y === segment.y))) {
                this.alive = false;
            }
        }

        // Проверяем столкновение с границами окна и обеспечиваем переход на противоположную сторону
        if (this.body[0].x < 0) {
            this.body[0].x = WIDTH - 10;
        } else if (this.body[0].x >= WIDTH) {
            this.body[0].x = 0;
        } else if (this.body[0].y < 0) {
            this.body[0].y = HEIGHT - 10;
        } else if (this.body[0].y >= HEIGHT) {
            this.body[0].y = 0;
        }

        if (this.alive) {
            this.changeDirection(newDirection);
            super.move(food, otherSnakes);
        }
    }
}

class Game {
    constructor() {
        this.snakes = [];
        this.foods = [];
        this.playerSnake = new Snake();
        this.snakes.push(this.playerSnake);

        for (let i = 0; i < snakes; i++) {
            const x = randomPosition();
            const y = randomPosition();
            const aiSnake = new AISnake(x, y);
            this.snakes.push(aiSnake);
        }

        for (let i = 0; i < foods; i++) {
            const food = new Food();
            food.randomizePosition();
            this.foods.push(food);
        }
			document.addEventListener("keydown", (event) => {
		switch (event.key) {
			case "ArrowUp":
				game.playerSnake.changeDirection("UP");
				break;
			case "ArrowDown":
				game.playerSnake.changeDirection("DOWN");
				break;
			case "ArrowLeft":
				game.playerSnake.changeDirection("LEFT");
				break;
			case "ArrowRight":
				game.playerSnake.changeDirection("RIGHT");
				break;
		}
	});
    }

    restartGame() {
        this.snakes = [];
        this.foods = [];
        this.playerSnake = new Snake();
        this.snakes.push(this.playerSnake);

        for (let i = 0; i < snakes; i++) {
            const x = randomPosition();
            const y = randomPosition();
            const aiSnake = new AISnake(x, y);
            this.snakes.push(aiSnake);
        }

        for (let i = 0; i < foods; i++) {
            const food = new Food();
            food.randomizePosition();
            this.foods.push(food);
        }
    }

    main() {
        setInterval(() => {
            for (const food of this.foods) {
                for (const snake of this.snakes) {
                    if (snake.getHeadPosition().x === food.position.x && snake.getHeadPosition().y === food.position.y) {
                        food.randomizePosition();
                        snake.length++; // Увеличиваем длину змейки
                    }
                }
            }

            this.playerSnake.move(this.foods[0], this.snakes.filter(snake => snake !== this.playerSnake));

            for (const aiSnake of this.snakes.slice(1)) {
                aiSnake.move(this.foods[0], this.snakes.filter(snake => snake !== aiSnake));
            }

            ctx.fillStyle = BLACK;
            ctx.fillRect(0, 0, WIDTH, HEIGHT);

            for (const [index, snake] of this.snakes.entries()) {
                if (snake.alive) {
                    snake.draw();
                } else {
                    this.snakes.splice(index, 1);
                }
            }

            for (const food of this.foods) {
                food.drawFood();
            }
        }, 1000 / SPEED);

        // Проверка на столкновение игрока с чужой змейкой или границей окна
        setInterval(() => {
            if (!this.playerSnake.alive) {
                this.restartGame();
            }
        }, 1000);
    }
}

const game = new Game();
game.main();
