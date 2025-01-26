// states-population.js
let ships = [];
let states = [];
const maxShips = 100;
let highlightedState = null;

function isCoastal(x, y) {
    if (map[y][x].biome === 'ocean') return false;
    for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < mapWidth && ny >= 0 && ny < mapHeight) {
            if (map[ny][nx].biome === 'ocean') {
                return true;
            }
        }
    }
    return false;
}

function processShips() {
    if(ships.length < maxShips) {
        for (let y = 0; y < mapHeight; y++) {
            for (let x = 0; x < mapWidth; x++) {
                const cell = map[y][x];
                if (isCoastal(x, y) && cell.population >= 10000 && Math.random() < 0.1) {
                    const parentState = states.find(s => s.cells.has(`${x},${y}`));
                    ships.push({
                        x, 
                        y,
                        dx: neighbors[Math.floor(Math.random() * neighbors.length)][0],
                        dy: neighbors[Math.floor(Math.random() * neighbors.length)][1],
                        color: parentState ? parentState.color : 'black',
                        owner: parentState
                    });
                    if(ships.length >= maxShips) break;
                }
            }
            if(ships.length >= maxShips) break;
        }
    }

    const shipsToRemove = [];
    ships.forEach((ship, index) => {
        let newX = ship.x + ship.dx;
        let newY = ship.y + ship.dy;

        if (newX < 0 || newX >= mapWidth || newY < 0 || newY >= mapHeight) {
            shipsToRemove.push(index);
            return;
        }

        const targetCell = map[newY][newX];
        if (targetCell.biome !== 'ocean') {
            // Захват территории если корабль принадлежит государству
            if (ship.owner && !isCellInState(newX, newY)) {
                ship.owner.cells.add(`${newX},${newY}`);
                targetCell.population += 10; // Большой бонус к населению
            }
			else
			{
				targetCell.population += 10;
			}
            shipsToRemove.push(index);
        }

        ship.x = newX;
        ship.y = newY;
    });

    shipsToRemove.reverse().forEach(index => ships.splice(index, 1));
}

function isCellInState(x, y) {
    return states.some(state => state.cells.has(`${x},${y}`));
}

function processStates() {
	    // Удаление клеток с нулевым населением из государств
    states.forEach(state => {
        const cellsToRemove = [];
        state.cells.forEach(cellKey => {
            const [x, y] = cellKey.split(',').map(Number);
            if (map[y][x].population === 0) {
                cellsToRemove.push(cellKey);
            }
        });
        
        cellsToRemove.forEach(cellKey => {
            state.cells.delete(cellKey);
        });
    });
	
    // Обновляем ресурсы и технологии существующих государств
    states.forEach(state => {
        // Собираем ресурсы с контролируемых клеток
        state.resources += Array.from(state.cells).reduce((sum, cellKey) => {
            const [x, y] = cellKey.split(',').map(Number);
            const biomeData = biomes[map[y][x].biome];
            return sum + (biomeData?.resources || 0);
        }, 0);

        // Улучшаем технологии при достижении порога
        if (state.resources >= 100 * state.techLevel) {
            state.techLevel++;
            state.resources = 0;
        }
    });

    // Создание новых государств (базовая логика сохранена)
    for (let y = 0; y < mapHeight - 1; y++) {
        for (let x = 0; x < mapWidth - 1; x++) {
            let total = 0;
            let canCreate = true;
            for (let dy = 0; dy <= 1; dy++) {
                for (let dx = 0; dx <= 1; dx++) {
                    total += map[y + dy][x + dx].population;
                    if (isCellInState(x + dx, y + dy)) canCreate = false;
                }
            }
            if (total > 78000 && canCreate && Math.random() < 0.001) {
                const color = `hsla(${Math.random() * 360}, 70%, 50%, 0.5)`;
                const cells = new Set();
                for (let dy = 0; dy <= 1; dy++) {
                    for (let dx = 0; dx <= 1; dx++) {
                        cells.add(`${x + dx},${y + dy}`);
                    }
                }
                states.push({
                    cells,
                    color,
                    techLevel: 1,
                    resources: 0
                });
            }
        }
    }
	
    // Расширение за счет слабых соседей (ТОЛЬКО ГРАНИЧАЩИЕ КЛЕТКИ)
    states.forEach(currentState => {
        const borderCells = new Set();

        // 1. Находим все граничащие клетки государства
        currentState.cells.forEach(cellKey => {
            const [x, y] = cellKey.split(',').map(Number);
            neighbors.forEach(([dx, dy]) => {
                const nx = x + dx;
                const ny = y + dy;
                const neighborKey = `${nx},${ny}`;
                
                if (nx >= 0 && nx < mapWidth && ny >= 0 && ny < mapHeight) {
                    // Проверяем, что клетка принадлежит другому государству
                    const ownerState = states.find(s => 
                        s !== currentState && 
                        s.cells.has(neighborKey)
                    );
                    
                    if (ownerState) {
                        borderCells.add({
                            key: neighborKey,
                            x: nx,
                            y: ny,
                            owner: ownerState
                        });
                    }
                }
            });
        });

        // 2. Обрабатываем только граничащие клетки
        borderCells.forEach(({key, x, y, owner}) => {
            const techDifference = currentState.techLevel - owner.techLevel;
            
            if (techDifference >= 2) {
                const captureChance = 0.001 * (techDifference - 2);
                
                if (Math.random() < captureChance) {
                    // Захват клетки
                    owner.cells.delete(key);
                    currentState.cells.add(key);
                    
                    // Перенос ресурсов
                    currentState.resources += biomes[map[y][x].biome].resources * 0.5;
                    map[y][x].population = Math.max(
                        map[y][x].population - 1000, 
                        0
                    );
                }
            }
        });
    });

    // Расширение государств с учётом технологий
    states.forEach(state => {
        const border = new Set();
        state.cells.forEach(cellKey => {
            const [x, y] = cellKey.split(',').map(Number);
            neighbors.forEach(([dx, dy]) => {
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && nx < mapWidth && ny >= 0 && ny < mapHeight && !isCellInState(nx, ny)) {
                    border.add(`${nx},${ny}`);
                }
            });
        });

        border.forEach(cellKey => {
            const [x, y] = cellKey.split(',').map(Number);
            const cell = map[y][x];
            let baseChance = 0;

            if (cell.population === 0) {
                baseChance = 0;
            } else if (cell.biome === 'ocean') {
                baseChance = 0.01;
            } else {
                baseChance = cell.population < 5000 ? 0.01 :
                    cell.population < 10000 ? 0.03 :
                    cell.population < 15000 ? 0.02 : 0.01;
            }

            // Учёт уровня технологий
            const techBonus = state.techLevel * 0.5;
            const totalChance = Math.min(baseChance * (1 + techBonus), 0.3);

            if (Math.random() < totalChance) {
                state.cells.add(cellKey);
                // Ускоренный рост населения
                cell.population += 50 * state.techLevel;
                // Перенос части ресурсов
                state.resources += biomes[cell.biome].resources * 0.2;
            }
        });
    });

    // Удаление государств без территорий
    states = states.filter(state => state.cells.size > 0);
}