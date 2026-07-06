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

    const genreSet = new Set();

    const actorSet = new Set();

    const directorSet = new Set();

    movies15.forEach(movie => {

        movie.genres.forEach(g => genreSet.add(g));

        movie.actors.forEach(a => actorSet.add(a));

        directorSet.add(movie.director);

    });

    genres = Array.from(genreSet);

    actors = Array.from(actorSet);

    directors = Array.from(directorSet);

    genres.forEach((g, i) => {

        genreIndex.set(g, i);

    });

    actors.forEach((a, i) => {

        actorIndex.set(a, i);

    });

    directors.forEach((d, i) => {

        directorIndex.set(d, i);

    });

    movies15.forEach(movie => {

        movie.genres_bin =
            binary(
                genres.length,
                genreIndex,
                movie.genres
            );

        movie.actors_bin =
            binary(
                actors.length,
                actorIndex,
                movie.actors
            );

        movie.director_bin =
            binary(
                directors.length,
                directorIndex,
                [movie.director]
            );

    });

}
// ==========================================================
// Part 2
// Binary + Cosine Distance + Predictor
// ==========================================================

// --------------------
// Binary Vector
// --------------------

function binary(size, indexMap, values) {

    const vector = new Array(size).fill(0);

    values.forEach(value => {

        const index = indexMap.get(value);

        if (index !== undefined) {

            vector[index] = 1;

        }

    });

    return vector;

}

// --------------------
// Cosine Distance
// 等价于 scipy.spatial.distance.cosine()
// --------------------

function cosineDistance(v1, v2) {

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

    total += cosineDistance(
        movie1.genres_bin,
        movie2.genres_bin
    );

    total += cosineDistance(
        movie1.director_bin,
        movie2.director_bin
    );

    total += cosineDistance(
        movie1.actors_bin,
        movie2.actors_bin
    );

    return total;

}

// --------------------
// Python predictor()
// --------------------

function predictor(newMovie) {

    newMovie.genres_bin = binary(
        genres.length,
        genreIndex,
        newMovie.genres
    );

    newMovie.director_bin = binary(
        directors.length,
        directorIndex,
        [newMovie.director]
    );

    newMovie.actors_bin = binary(
        actors.length,
        actorIndex,
        newMovie.actors
    );

    const vote = movies15.map(movie => {

        return {

            ...movie,

            angle: angle(movie, newMovie)

        };

    });

    vote.sort((a, b) => a.angle - b.angle);

    let sum = 0;

    const topN = 5;

    for (let i = 0; i < topN; i++) {

        sum += vote[i].vote_average;

    }

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

    document.getElementById("stars").textContent =
        generateStars(score);

    document.getElementById("description").textContent =
        getDescription(score);

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
} // 确保这里是文件的绝对末尾，后面没有任何多余的“}”