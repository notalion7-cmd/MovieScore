// ==========================================================
// Movie Rating Predictor
// Part 1
// ==========================================================

// --------------------
// Global Variables
// --------------------

let movies = [];
let credits = [];
let movies15 = [];

let genres = [];
let actors = [];
let directors = [];

let genreIndex = new Map();
let actorIndex = new Map();
let directorIndex = new Map();

let dataReady = false;

// --------------------
// Page Loaded
// --------------------

document.addEventListener("DOMContentLoaded", () => {
    loadData();
});

// --------------------
// Read CSV
// --------------------

async function loadData() {
    try {
        const response = await fetch("movies_processed.json");

        if (!response.ok) {
            throw new Error("Cannot load movies_processed.json");
        }

        movies15 = await response.json();
        buildDictionary();
        initGenreMenu();
        dataReady = true;
        console.log("Data Loaded");

    } catch (err) {
        console.error(err);
        alert("Cannot load csv.");
    }
}

// --------------------
// Extract Name
// --------------------

function extractName(list) {
    return list.map(item => item.name);
}

// --------------------
// Extract Director
// --------------------

function extractDirector(crew, job) {
    for (const person of crew) {
        if (person.job === job)
            return person.name;
    }
    return "";
}

// --------------------
// Build Dictionary
// --------------------

function buildDictionary() {
    // 1. 收集 Genres (和 Python 保持一致)
    const genreSet = new Set();
    movies15.forEach(movie => {
        movie.genres.forEach(g => genreSet.add(g));
    });
    genres = Array.from(genreSet); // 对应 Python 的 genres.index

    // 2. 收集 Directors 并按照出现次数倒序排列 (完全复刻 Python 的 groupby().sort_values())
    const dirCounts = {};
    movies15.forEach(movie => {
        dirCounts[movie.director] = (dirCounts[movie.director] || 0) + 1;
    });
    // 转成数组并按次数降序排列
    directors = Object.keys(dirCounts).sort((a, b) => dirCounts[b] - dirCounts[a]);

    // 3. 收集 Actors (和 Python 保持一致)
    const actorSet = new Set();
    movies15.forEach(movie => {
        movie.actors.forEach(a => actorSet.add(a));
    });
    actors = Array.from(actorSet);

    // 4. 为历史数据集生成二进制向量
    movies15.forEach((movie, idx) => {
        // 记录原始索引，用于在排序平局时严格对齐 Python 的 Pandas 默认顺序
        movie.original_index = idx; 

        movie.genres_bin = binaryForPython(genres, movie.genres);
        // 还原 Python 隐式引发的逻辑：movie.director 是字符串，用包含匹配
        movie.director_bin = binaryForPython(directors, movie.director); 
        movie.actors_bin = binaryForPython(actors, movie.actors);
    });
}


// ==========================================================
// Part 2
// Binary + Cosine Distance + Predictor (Strict Python Alignment)
// ==========================================================

// 统一的、模拟 Python 'in' 关键字的向量生成函数
function binaryForPython(dictArray, rowValue) {
    const vector = [];
    
    // 确保 rowValue 统一转为处理数组
    const valuesToMatch = Array.isArray(rowValue) ? rowValue : [rowValue];

    for (let i = 0; i < dictArray.length; i++) {
        const word = dictArray[i];
        let isMatch = false;

        for (let j = 0; j < valuesToMatch.length; j++) {
            const val = valuesToMatch[j];
            if (val && typeof val === "string") {
                // 完美复刻 Python 的: if word in string_value / word in list_of_strings
                if (val.includes(word)) {
                    isMatch = true;
                    break;
                }
            }
        }
        vector.push(isMatch ? 1 : 0);
    }
    return vector;
}

// 唯一的 Cosine Distance 函数，严格包含 Python 边界条件 (1 not in b1 or 1 not in b2)
function cosineDistance(v1, v2) {
    // 对应 Python 的: if (1 not in b1) or (1 not in b2): return 1
    if (!v1.includes(1) || !v2.includes(1)) {
        return 1;
    }

    let dot = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < v1.length; i++) {
        dot += v1[i] * v2[i];
        norm1 += v1[i] * v1[i];
        norm2 += v2[i] * v2[i];
    }

    if (norm1 === 0 || norm2 === 0) {
        return 1;
    }

    return 1 - dot / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

// --------------------
// Python angle()
// --------------------
function angle(movie1, movie2) {
    let total = 0;
    total += cosineDistance(movie1.genres_bin, movie2.genres_bin);
    total += cosineDistance(movie1.director_bin, movie2.director_bin);
    total += cosineDistance(movie1.actors_bin, movie2.actors_bin);
    return total;
}

// --------------------
// Python predictor()
// --------------------
function predictor(newMovie) {
    // 新片和历史电影采用完全相同的二值化判定，消除单字符串与数组的内部不一致
    const newMovieGenresBin = binaryForPython(genres, newMovie.genres);
    const newMovieDirectorBin = binaryForPython(directors, newMovie.director); 
    const newMovieActorsBin = binaryForPython(actors, newMovie.actors);

    const vote = movies15.map(movie => {
        let total = 0;
        
        // 计算总余弦距离
        total += cosineDistance(movie.genres_bin, newMovieGenresBin);
        total += cosineDistance(movie.director_bin, newMovieDirectorBin);
        total += cosineDistance(movie.actors_bin, newMovieActorsBin);

        return {
            vote_average: movie.vote_average,
            angle: total,
            original_index: movie.original_index
        };
    });

    // 严格按照余弦距离升序排列；如果距离完全相等，则按照原始索引升序排（稳定排序，复刻 Pandas）
    vote.sort((a, b) => {
        if (Math.abs(a.angle - b.angle) < 1e-9) {
            return a.original_index - b.original_index;
        }
        return a.angle - b.angle;
    });

    let sum = 0;
    const topN = 5;
    for (let i = 0; i < topN; i++) {
        sum += vote[i].vote_average;
    }

    // 返回与 Python np.mean() 后 round(x, 2) 相同精度的数值
    return Number((sum / topN).toFixed(2));
}

// --------------------
// Initialize Genre Menu
// --------------------

function initGenreMenu() {
    const ids = [
        "genre1",
        "genre2",
        "genre3",
        "genre4",
        "genre5"
    ];

    ids.forEach(id => {
        const select = document.getElementById(id);
        genres.forEach(g => {
            const option = document.createElement("option");
            option.value = g;
            option.textContent = g;
            select.appendChild(option);
        });
    });

    console.log("Genre Menu Ready.");
}


// ==========================================================
// Part 3
// UI + Predict Button
// ==========================================================

// --------------------
// Predict Button
// --------------------

document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("predictBtn");
    btn.addEventListener("click", predictMovie);
});

// --------------------
// Read Input
// --------------------

function predictMovie() {
    if (!dataReady) {
        alert("Data is still loading.");
        return;
    }

    const loading = document.getElementById("loading");
    loading.classList.remove("hidden");

    setTimeout(() => {
        const genresInput = [
            document.getElementById("genre1").value,
            document.getElementById("genre2").value,
            document.getElementById("genre3").value,
            document.getElementById("genre4").value,
            document.getElementById("genre5").value
        ].filter(g => g !== "");

        const director = document
            .getElementById("director")
            .value
            .trim();

        const actorsInput = [
            document.getElementById("actor1").value,
            document.getElementById("actor2").value,
            document.getElementById("actor3").value,
            document.getElementById("actor4").value,
            document.getElementById("actor5").value
        ]
        .map(a => a.trim())
        .filter(a => a !== "");

        const movie = {
            genres: genresInput,
            director: director,
            actors: actorsInput
        };

        const score = predictor(movie);
        updateResult(score);
        loading.classList.add("hidden");
    }, 100);
}

// --------------------
// Update Result
// --------------------

function updateResult(score) {
    document.getElementById("score").textContent = score;
    document.getElementById("stars").textContent = generateStars(score);
    document.getElementById("description").textContent = getDescription(score);
}

// --------------------
// Generate Stars
// --------------------

function generateStars(score) {
    const fullStars = Math.round(score / 2);
    let result = "";
    for (let i = 0; i < 5; i++) {
        if (i < fullStars)
            result += "★";
        else
            result += "☆";
    }
    return result;
}

// --------------------
// Rating Description
// --------------------

function getDescription(score) {
    score = Number(score);

    if (score >= 8.5) {
        return "Excellent! This movie has very high predicted audience satisfaction.";
    }
    if (score >= 7.5) {
        return "Very Good. It has strong potential.";
    }
    if (score >= 6.5) {
        return "Good. An above-average movie.";
    }
    if (score >= 5.5) {
        return "Average. It may appeal to specific audiences.";
    }

    return "Below average. Consider improving the cast or genre combination.";
}