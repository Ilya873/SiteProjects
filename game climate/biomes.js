// biomes.js
const biomeNames = {
    ocean: "Океан",
    plains: "Луга",
    steppe: "Степь",
    forest: "Лес",
    taiga: "Тайга",
    jungle: "Джунгли",
    desert: "Пустыня",
    snow: "Снег",
    mountain: "Горы",
    swamp: "Болото",
    savanna: "Саванна",
    tundra: "Тундра",
    mangrove: "Мангры",
    alpine: "Альпийские луга",
    volcanic: "Вулканический",
    coral: "Коралловый риф"
};

const biomes = {
    ocean: { 
        color: "#0000FF", 
        baseTemp: 15,
        baseHumidity: 100,
        growthRate: [0, 0],
        decayRate: [0, 0],
		resources: 0.1
    },
    plains: { 
        color: "#7CFC00", 
        baseTemp: 20,
        baseHumidity: 50,
        growthRate: [1, 80],
        decayRate: [1, 2],
		resources: 0.2
    },
    steppe: { 
        color: "#F4A460", 
        baseTemp: 25,
        baseHumidity: 30,
        growthRate: [1, 60],
        decayRate: [1, 10],
		resources: 0.1
    },
    forest: { 
        color: "#228B22", 
        baseTemp: 18,
        baseHumidity: 80,
        growthRate: [1, 60],
        decayRate: [1, 5],
		resources: 0.3
    },
    taiga: { 
        color: "#2E8B57", 
        baseTemp: 10,
        baseHumidity: 80,
        growthRate: [1, 50],
        decayRate: [5, 20],
		resources: 0.15
    },
    jungle: { 
        color: "#006400", 
        baseTemp: 28,
        baseHumidity: 90,
        growthRate: [1, 80],
        decayRate: [5, 15],
		resources: 0.2
    },
    desert: { 
        color: "#FFD700", 
        baseTemp: 35,
        baseHumidity: 10,
        growthRate: [1, 40],
        decayRate: [1, 30],
		resources: 0.05
    },
    snow: { 
        color: "#FFFFFF", 
        baseTemp: -5,
        baseHumidity: 70,
        growthRate: [1, 40],
        decayRate: [1, 30],
		resources: 0.01
    },
    mountain: { 
        color: "#A9A9A9", 
        baseTemp: 5,
        baseHumidity: 50,
        growthRate: [1, 50],
        decayRate: [10, 20],
		resources: 0.3
    },
    swamp: { 
        color: "#4B5320", 
        baseTemp: 12,
        baseHumidity: 95,
        growthRate: [2, 60],
        decayRate: [3, 15],
		resources: 0.1
    },
    savanna: { 
        color: "#C19A6B", 
        baseTemp: 27,
        baseHumidity: 45,
        growthRate: [1, 70],
        decayRate: [2, 25],
		resources: 0.1
    },
    tundra: { 
        color: "#E0FFFF", 
        baseTemp: -15,
        baseHumidity: 55,
        growthRate: [1, 30],
        decayRate: [5, 40],
		resources: 0.05
    },
    mangrove: { 
        color: "#2F4F4F", 
        baseTemp: 26,
        baseHumidity: 100,
        growthRate: [3, 90],
        decayRate: [2, 10],
        coastOnly: true,
		resources: 0.1
    },
    alpine: { 
        color: "#90EE90", 
        baseTemp: 8,
        baseHumidity: 75,
        growthRate: [1, 50],
        decayRate: [3, 20],
        elevation: 0.7,
		resources: 0.1
    },
    volcanic: { 
        color: "#FF4500", 
        baseTemp: 50,
        baseHumidity: 5,
        growthRate: [0, 0],
        decayRate: [10, 100],
        permanent: true,
		resources: 0.2
    },
    coral: { 
        color: "#FF6F61", 
        baseTemp: 25,
        baseHumidity: 100,
        growthRate: [5, 100],
        decayRate: [5, 50],
        coastOnly: true,
		resources: 0.1
    }
};

const worldGenerators = {
    pangea: () => {
        // Генерация одного большого континента
        for (let y = 0; y < mapHeight; y++) {
            for (let x = 0; x < mapWidth; x++) {
                const distanceToCenter = Math.hypot(
                    x/mapWidth - 0.5, 
                    y/mapHeight - 0.5
                );
                const elevation = Math.max(0, 1 - distanceToCenter*2.5);
                
                if (elevation > 0.3) {
                    map[y][x].biome = 'mountain';
                    map[y][x].elevation = elevation;
                } else if (elevation > 0.1) {
                    map[y][x].biome = 'plains';
                    map[y][x].elevation = elevation;
                } else {
                    map[y][x].biome = 'ocean';
                }
                
                map[y][x].temperature = biomes[map[y][x].biome].baseTemp;
                map[y][x].humidity = biomes[map[y][x].biome].baseHumidity;
            }
        }
    },

    continents: () => {
        // Генерация 3-4 континентов
        const continentsCount = 3 + Math.floor(Math.random()*2);
        for (let i = 0; i < continentsCount; i++) {
            const centerX = Math.random() * mapWidth;
            const centerY = Math.random() * mapHeight;
            
            for (let y = 0; y < mapHeight; y++) {
                for (let x = 0; x < mapWidth; x++) {
                    const distance = Math.hypot(x-centerX, y-centerY);
                    if (distance < 15 + Math.random()*2) {
                        map[y][x].biome = distance < 5 ? 'mountain' : 'plains';
                        map[y][x].elevation = 0.3 + Math.random()*0.7;
                        map[y][x].temperature = biomes[map[y][x].biome].baseTemp;
                        map[y][x].humidity = biomes[map[y][x].biome].baseHumidity;
                    }
                }
            }
        }
    },

    islands: () => {
        // Генерация множества мелких островов
        const continentsCount = 5 + Math.floor(Math.random()*2);
        for (let i = 0; i < continentsCount; i++) {
            const centerX = Math.random() * mapWidth;
            const centerY = Math.random() * mapHeight;
            
            for (let y = 0; y < mapHeight; y++) {
                for (let x = 0; x < mapWidth; x++) {
                    const distance = Math.hypot(x-centerX, y-centerY);
                    if (distance < 3 + Math.random()*2) {
                        map[y][x].biome = distance < 2 ? 'mountain' : 'plains';
                        map[y][x].elevation = 0.3 + Math.random()*0.7;
                        map[y][x].temperature = biomes[map[y][x].biome].baseTemp;
                        map[y][x].humidity = biomes[map[y][x].biome].baseHumidity;
                    }
                }
            }
        }
    }
};

function updateBiomeBasedOnConditions(cell) {
    // Постоянные биомы
    if (cell.biome === "ocean" || cell.biome === "mountain" || cell.biome === "volcanic") return;

    // Прибрежные биомы
    if (cell.isCoast) {
        if (cell.temperature >= 22 && cell.humidity > 85) {
            cell.biome = "mangrove";
            return;
        }
        if (cell.temperature >= 20 && cell.humidity === 100) {
            cell.biome = "coral";
            return;
        }
    }

    // Высокогорные биомы
    if (cell.elevation > 0.7) {
        if (cell.temperature > 5 && cell.humidity > 60) {
            cell.biome = "alpine";
            return;
        }
    }

    const t = cell.temperature;
    const h = cell.humidity;

    // Обновленная температурно-влажностная матрица
    if (t >= 45) {
        cell.biome = "volcanic";
    } else if (t >= 35) {
        cell.biome = h > 15 ? "desert" : "volcanic";
    } else if (t >= 28) {
        cell.biome = h > 60 ? "jungle" : h > 35 ? "savanna" : "desert";
    } else if (t >= 22) {
        cell.biome = h > 85 ? "swamp" : h > 65 ? "forest" : h > 45 ? "plains" : "steppe";
    } else if (t >= 15) {
        cell.biome = h > 80 ? "swamp" : h > 60 ? "forest" : h > 40 ? "plains" : "steppe";
    } else if (t >= 5) {
        cell.biome = h > 70 ? "taiga" : h > 50 ? "tundra" : "snow";
    } else if (t >= -10) {
        cell.biome = h > 40 ? "tundra" : "snow";
    } else {
        cell.biome = "snow";
    }
}

// Обновленная функция распространения влаги
function updateHumidityInfluence() {
    const humidityChanges = new Map();

    for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
            const cell = map[y][x];
            let humiditySource = 0;
            
            if (cell.biome === 'ocean') humiditySource = 25;
            else if (cell.biome === 'mangrove') humiditySource = 15;
            else if (cell.biome === 'swamp') humiditySource = 10;
            else if (cell.biome === 'forest') humiditySource = 5;

            if (humiditySource > 0) {
                for (const [dx, dy] of neighbors) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >=0 && nx < mapWidth && ny >=0 && ny < mapHeight) {
                        const key = `${nx},${ny}`;
                        const current = humidityChanges.get(key) || 0;
                        humidityChanges.set(key, current + humiditySource);
                    }
                }
            }
        }
    }

    humidityChanges.forEach((change, key) => {
        const [x, y] = key.split(',').map(Number);
        map[y][x].humidity = Math.min(100, map[y][x].humidity + change * 0.7);
        map[y][x].humidity = Math.max(0, map[y][x].humidity);
    });
}

function getTemperatureColor(temp) {
    const clampedTemp = Math.max(-20, Math.min(50, temp));
    const gradient = (clampedTemp + 20) / 70;
    const red = Math.min(255, 255 * gradient);
    const blue = 255 - red;
    return `rgb(${red}, 0, ${blue})`;
}

function getHumidityColor(humidity) {
    const value = Math.max(0, Math.min(100, humidity));
    return `hsl(240, ${100 - value}%, ${value / 2}%)`;
}