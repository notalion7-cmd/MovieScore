// ==========================================================
// Movie Rating Predictor
// Part 1 - 全局变量与数据加载
// ==========================================================

let movies15 = [];
let genres = [];
let actors = [];
let directors = [];
let dataReady = false;

document.addEventListener("DOMContentLoaded", () => {
    loadData();
});

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

function buildDictionary() {
    // 1. 收集 Genres
    const genreSet = new Set();
    movies15.forEach(movie => {
        movie.genres.forEach(g => genreSet.add(g));
    });
    genres = Array.from(genreSet);

    // 2. 收集 Directors 并按照出现次数倒序排列 (完全复刻 Python 的 groupby().sort_values())
    const dirCounts = {};
    movies15.forEach(movie => {
        dirCounts[movie.director] = (dirCounts[movie.director] || 0) + 1;
    });
    directors = Object.keys(dirCounts).sort((a, b) => dirCounts[b] - dirCounts[a]);

    // 3. 收集 Actors
    const actorSet = new Set();
    movies15.forEach(movie => {
        movie.actors.forEach(a => actorSet.add(a));
    });
    actors = Array.from(actorSet);

    // 4. 为历史数据集生成二进制向量并记录原始索引 (平局打破依赖)
    movies15.forEach((movie, idx) => {
        movie.original_index = idx; 
        movie.genres_bin = binaryForPython(genres, movie.genres);
        movie.director_bin = binaryForPython(directors, movie.director); 
        movie.actors_bin = binaryForPython(actors, movie.actors);
    });
}

// ==========================================================
// Part 2 - 核心算法逻辑 (对齐 Python 边界)
// ==========================================================

// 统一的、模拟 Python 'in' 关键字的向量生成函数
function binaryForPython(dictArray, rowValue) {
    const vector = [];
    const valuesToMatch = Array.isArray(rowValue) ? rowValue : [rowValue];

    for (let i = 0; i < dictArray.length; i++) {
        const word = dictArray[i];
        let isMatch = false;

        for (let j = 0; j < valuesToMatch.length; j++) {
            const val = valuesToMatch[j];
            if (val && typeof val === "string") {
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

// 余弦距离
function cosineDistance(v1, v2) {
    if (!v1.includes(1) || !v2.includes(1)) {
        return 1;
    }
    let dot = 0, norm1 = 0, norm2 = 0;
    for (let i = 0; i < v1.length; i++) {
        dot += v1[i] * v2[i];
        norm1 += v1[i] * v1[i];
        norm2 += v2[i] * v2[i];
    }
    if (norm1 === 0 || norm2 === 0) return 1;
    return 1 - dot / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

// 算法 1: 余弦预测器
function predictorCosine(newMovie) {
    const newMovieGenresBin = binaryForPython(genres, newMovie.genres);
    const newMovieDirectorBin = binaryForPython(directors, newMovie.director); 
    const newMovieActorsBin = binaryForPython(actors, newMovie.actors);

    const vote = movies15.map(movie => {
        let total = 0;
        total += cosineDistance(movie.genres_bin, newMovieGenresBin);
        total += cosineDistance(movie.director_bin, newMovieDirectorBin);
        total += cosineDistance(movie.actors_bin, newMovieActorsBin);

        return {
            vote_average: movie.vote_average,
            angle: total,
            original_index: movie.original_index
        };
    });

    // 稳定排序打破平局
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
    return Number((sum / topN).toFixed(2));
}

// 算法 2: 线性回归模型参数 (由 Python 回归模型导出的硬编码权重)
const REGRESSION_WEIGHTS = {
    intercept: 6.54,       // 基础分
    genreWeight: -0.03,     // 每个题材的边际加分
    directorWeight: 0.59,  // 熟面孔导演加成
    actorWeight: -0.15,     // 熟面孔演员加成
    
    getDirectorScore: function(dirName) {
        if (!dirName) return 0;
        const dirCounts = {};
        movies15.forEach(m => { dirCounts[m.director] = (dirCounts[m.director] || 0) + 1; });
        const count = dirCounts[dirName] || 0;
        return count > 5 ? this.directorWeight : (count > 0 ? this.directorWeight * 0.5 : 0);
    },
    
    getActorScore: function(actorList) {
        if (!actorList || actorList.length === 0) return 0;
        let matchedCount = 0;
        const actorSet = new Set();
        movies15.forEach(m => m.actors.forEach(a => actorSet.add(a)));
        
        actorList.forEach(actor => {
            if (actorSet.has(actor)) matchedCount++;
        });
        return matchedCount * this.actorWeight;
    }
};

function predictorLinearRegression(newMovie) {
    let score = REGRESSION_WEIGHTS.intercept;

    const movieGenresBin = binaryForPython(genres, newMovie.genres);
    const genreMatchCount = movieGenresBin.filter(x => x === 1).length;
    score += genreMatchCount * REGRESSION_WEIGHTS.genreWeight;
    score += REGRESSION_WEIGHTS.getDirectorScore(newMovie.director);
    score += REGRESSION_WEIGHTS.getActorScore(newMovie.actors);

    return Math.max(1.0, Math.min(10.0, Number(score.toFixed(2))));
}

// ==========================================================
// Part 3 - 界面交互与绑定 (严格对齐你最新的 HTML ID)
// ==========================================================

function initGenreMenu() {
    const ids = ["genre1", "genre2", "genre3", "genre4", "genre5"];
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

// 绑定对应的 HTML 按钮事件
document.addEventListener("DOMContentLoaded", () => {
    const cosineBtn = document.getElementById("cosineBtn"); // 对应 HTML 里的余弦相似度
    const linearBtn = document.getElementById("linearBtn"); // 对应 HTML 里的线性回归

    if (cosineBtn) {
        cosineBtn.addEventListener("click", () => startPrediction("cosine"));
    }
    if (linearBtn) {
        linearBtn.addEventListener("click", () => startPrediction("linear"));
    }
});

function startPrediction(type) {
    if (!dataReady) {
        alert("数据加载中，请稍后...");
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

        const director = document.getElementById("director").value.trim();

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

        let score = 0;
        if (type === "cosine") {
            score = predictorCosine(movie);
        } else if (type === "linear") {
            score = predictorLinearRegression(movie);
        }

        updateResult(score);
        loading.classList.add("hidden");
    }, 100);
}

function updateResult(score) {
    document.getElementById("score").textContent = score;
    document.getElementById("stars").textContent = generateStars(score);
    document.getElementById("description").textContent = getDescription(score);
}

function generateStars(score) {
    const fullStars = Math.round(score / 2);
    let result = "";
    for (let i = 0; i < 5; i++) {
        result += (i < fullStars) ? "★" : "☆";
    }
    return result;
}

function getDescription(score) {
    score = Number(score);
    if (score >= 8.5) return "太好了！这部电影预计会很受观众喜爱，拥有极高的满意度。";
    if (score >= 7.5) return "非常好，这部电影展现出了极强的高分潜力。";
    if (score >= 6.5) return "还不错，这是一部在平均线之上的作品。";
    if (score >= 5.5) return "表现平平，它可能只会吸引特定圈层的观众。";
    return "低于平均水平。建议继续优化演员阵容、导演选择或题材搭配。";
}