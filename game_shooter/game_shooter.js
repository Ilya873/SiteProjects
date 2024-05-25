const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const scoreElement = document.getElementById('score');
const gameOverElement = document.getElementById('game-over');
const gameOverText = document.getElementById('game-over-text');
const waveElement = document.getElementById('wave');

let player, bullets, enemies, particles, score, gameLoopInterval, keys, mousePos, currentWave, nextWaveTimeout;

class Player {
    constructor() {
        this.radius = 25;
        this.x = canvas.width / 2;
        this.y = canvas.height / 2;
        this.speed = 5;
    }

    draw() {
        const gradient = ctx.createRadialGradient(this.x, this.y, this.radius / 4, this.x, this.y, this.radius);
        gradient.addColorStop(0, 'white');
        gradient.addColorStop(1, 'lightgray');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
    }

    move() {
        if ((keys['ArrowUp'] || keys['w'] || keys['W']) && this.y - this.radius > 0) {
            this.y -= this.speed;
        }
        if ((keys['ArrowDown'] || keys['s'] || keys['S']) && this.y + this.radius < canvas.height) {
            this.y += this.speed;
        }
        if ((keys['ArrowLeft'] || keys['a'] || keys['A']) && this.x - this.radius > 0) {
            this.x -= this.speed;
        }
        if ((keys['ArrowRight'] || keys['d'] || keys['D']) && this.x + this.radius < canvas.width) {
            this.x += this.speed;
        }
    }
}

class Bullet {
    constructor(x, y, angle) {
        this.radius = 5;
        this.x = x;
        this.y = y;
        this.speed = 10;
        this.angle = angle;
    }

    draw() {
        ctx.fillStyle = 'yellow';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'yellow';
    }

    update() {
        this.x += this.speed * Math.cos(this.angle);
        this.y += this.speed * Math.sin(this.angle);
    }
}

class Enemy {
    constructor(x, y) {
        this.radius = 25;
        this.x = x;
        this.y = y;
        this.speed = 2;
    }

    draw() {
        const gradient = ctx.createRadialGradient(this.x, this.y, this.radius / 4, this.x, this.y, this.radius);
        gradient.addColorStop(0, 'green');
        gradient.addColorStop(1, 'darkgreen');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
    }

    update() {
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const angle = Math.atan2(dy, dx);
        this.x += this.speed * Math.cos(angle);
        this.y += this.speed * Math.sin(angle);
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = Math.random() * 3 + 1;
        this.speedX = Math.random() * 3 - 1.5;
        this.speedY = Math.random() * 3 - 1.5;
        this.life = 100;
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.life -= 2;
        if (this.life < 0) {
            this.life = 0;
        }
    }

    draw() {
        ctx.save();
        ctx.shadowBlur = 5;
        ctx.shadowColor = 'yellow';
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}

function init() {
    player = new Player();
    bullets = [];
    enemies = [];
    particles = [];
    score = 0;
    currentWave = 1;
    keys = {};
    mousePos = { x: 0, y: 0 };
    scoreElement.textContent = `Score: ${score}`;
    gameOverElement.style.display = 'none';
	waveElement.textContent = `Wave: ${currentWave}`;
    spawnEnemies(2);
}

function spawnEnemies(waveSize) {
    for (let i = 0; i < waveSize; i++) {
        let x, y;
        do {
            x = Math.random() * (canvas.width - 50);
            y = Math.random() * (canvas.height - 50);
        } while (Math.hypot(x - player.x, y - player.y) < 150);
        enemies.push(new Enemy(x, y));
    }
}

function createParticles(x, y, color) {
    for (let i = 0; i < 10; i++) {
        particles.push(new Particle(x, y, color));
    }
}

function updateGame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    player.move();
    player.draw();

    bullets.forEach((bullet, bulletIndex) => {
        bullet.update();
        bullet.draw();

        if (bullet.x < 0 || bullet.x > canvas.width || bullet.y < 0 || bullet.y > canvas.height) {
            bullets.splice(bulletIndex, 1);
        }
    });

    enemies.forEach((enemy, enemyIndex) => {
        enemy.update();
        enemy.draw();

        if (
            enemy.x - enemy.radius < player.x + player.radius &&
            enemy.x + enemy.radius > player.x - player.radius &&
            enemy.y - enemy.radius < player.y + player.radius &&
            enemy.y + enemy.radius > player.y - player.radius
        ) {
            gameOver();
        }

        bullets.forEach((bullet, bulletIndex) => {
            if (
                bullet.x - bullet.radius < enemy.x + enemy.radius &&
                bullet.x + bullet.radius > enemy.x - enemy.radius &&
                bullet.y - bullet.radius < enemy.y + enemy.radius &&
                bullet.y + bullet.radius > enemy.y - enemy.radius
            ) {
                enemies.splice(enemyIndex, 1);
                bullets.splice(bulletIndex, 1);
                createParticles(enemy.x, enemy.y, 'green');
                score++;
                scoreElement.textContent = `Score: ${score}`;
            }
        });
    });

    particles.forEach((particle, particleIndex) => {
        particle.update();
        if (particle.life <= 0) {
            particles.splice(particleIndex, 1);
        } else {
            particle.draw();
        }
    });

    if (enemies.length === 0 && !nextWaveTimeout) {
        nextWaveTimeout = setTimeout(() => {
            spawnEnemies(2 * currentWave);
            currentWave++;
			waveElement.textContent = `Wave: ${currentWave}`;
            nextWaveTimeout = null;
        }, 2000);
    }
}

function gameOver() {
    clearInterval(gameLoopInterval);
    clearTimeout(nextWaveTimeout);
    nextWaveTimeout = null;
    gameOverText.textContent = `Game Over! Score: ${score}`;
    gameOverElement.style.display = 'block';
}

function startGame() {
    init();
    gameLoopInterval = setInterval(updateGame, 1000 / 60);
}

window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
});

window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

window.addEventListener('click', (e) => {
    const angle = Math.atan2(e.clientY - player.y, e.clientX - player.x);
    bullets.push(new Bullet(player.x, player.y, angle));
});

window.addEventListener('mousemove', (e) => {
    mousePos = { x: e.clientX, y: e.clientY };
});

startGame();
