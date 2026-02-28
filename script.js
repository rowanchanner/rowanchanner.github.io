const API_KEY = "47745852f22c21e3362f4907231538e1";
const IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const movieGrid = document.getElementById("movieGrid");
const searchInput = document.getElementById("searchInput");

const continueGrid = document.getElementById("continueGrid");
const continueSection = document.getElementById("continueSection");

const popularRow = document.getElementById("popularRow");
const popularSection = document.getElementById("popularSection");

/* ✅ CHANGED: movies/tv are rows now */
const moviesRow = document.getElementById("moviesRow");
const moviesSection = document.getElementById("moviesSection");

const tvRow = document.getElementById("tvRow");
const tvSection = document.getElementById("tvSection");

const browseSection = document.getElementById("browseSection");
const browseTitle = document.getElementById("browseTitle");

let trendingPage = 1;
let discoverPage = 1;
const MAX_TRENDING_PAGES = 50;
const MAX_DISCOVER_PAGES = 50;

let allMovies = [];
let loadedIds = new Set();
let loading = false;
let searching = false;

/* ================= HELPERS ================= */
function show(el){ if(el) el.classList.remove("hidden"); }
function hide(el){ if(el) el.classList.add("hidden"); }

function safePoster(path){
  return path ? (IMAGE_BASE + path) : "";
}

function setSearchingUI(isSearching){
  searching = isSearching;

  if(isSearching){
    hide(continueSection);
    hide(popularSection);
    hide(moviesSection);
    hide(tvSection);
    show(browseSection);
    if (browseTitle) browseTitle.textContent = "Search Results";
  } else {
    show(popularSection);
    show(moviesSection);
    show(tvSection);
    if (browseTitle) browseTitle.textContent = "Browse";
    loadContinueWatching(); // will hide/show itself
  }
}

/* ============== RENDER MOVIES (Browse grid) ================= */
function renderMovies(movies, append = true) {
  if (!movieGrid) return;
  if (!append) movieGrid.innerHTML = "";

  movies.forEach((movie) => {
    if (loadedIds.has(movie.id) && !searching) return;

    const title = movie.title || movie.name;
    const year = (movie.release_date || movie.first_air_date || "").slice(0, 4);

    const a = document.createElement("a");
    const type = movie.media_type || (movie.first_air_date ? "tv" : "movie");
    a.href = type === "tv" ? `tv.html?id=${movie.id}` : `movie.html?id=${movie.id}`;
    a.className = "movie-card";
    a.style.backgroundImage = `url(${safePoster(movie.poster_path || "")})`;

    a.addEventListener("click", () => {
      saveContinueWatching({
        id: movie.id,
        title,
        poster_path: movie.poster_path,
        media_type: type
      });
    });

    a.innerHTML = `
      <div class="movie-overlay">
        <h3>${title}${year ? ` (${year})` : ""}</h3>
        <p>⭐ ${(movie.vote_average || 0).toFixed(1)}</p>
      </div>
    `;
    movieGrid.appendChild(a);

    if (!searching) loadedIds.add(movie.id);
  });
}

/* ============== RENDER ROW (Popular + Movies + TV) ================= */
function renderToRow(targetRow, items, forcedType = null) {
  if (!targetRow) return;
  targetRow.innerHTML = "";

  items.forEach((item) => {
    const title = item.title || item.name;
    const type = forcedType || item.media_type || (item.first_air_date ? "tv" : "movie");

    const a = document.createElement("a");
    a.href = type === "tv" ? `tv.html?id=${item.id}` : `movie.html?id=${item.id}`;
    a.className = "row-card";
    a.style.backgroundImage = `url(${safePoster(item.poster_path || "")})`;

    a.addEventListener("click", () => {
      saveContinueWatching({
        id: item.id,
        title,
        poster_path: item.poster_path,
        media_type: type
      });
    });

    a.innerHTML = `<div class="row-overlay">${title}</div>`;
    targetRow.appendChild(a);
  });
}

/* ============== LOAD TRENDING (Browse / infinite scroll) ================= */
async function loadTrending() {
  if (loading || trendingPage > MAX_TRENDING_PAGES || searching) return;
  loading = true;
  try {
    const res = await fetch(`https://api.themoviedb.org/3/trending/movie/week?api_key=${API_KEY}&page=${trendingPage}`);
    const data = await res.json();
    if (data.results) {
      const newMovies = data.results.filter(m => !loadedIds.has(m.id));
      allMovies.push(...newMovies);
      renderMovies(newMovies, true);
      trendingPage++;
    }
  } catch (err) { console.error("Trending load error:", err); }
  loading = false;
}

/* ============== LOAD DISCOVER (Browse / infinite scroll) ================= */
async function loadDiscover() {
  if (loading || discoverPage > MAX_DISCOVER_PAGES || searching) return;
  loading = true;
  try {
    const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&sort_by=popularity.desc&page=${discoverPage}`);
    const data = await res.json();
    if (data.results) {
      const newMovies = data.results.filter(m => !loadedIds.has(m.id));
      allMovies.push(...newMovies);
      renderMovies(newMovies, true);
      discoverPage++;
    }
  } catch (err) { console.error("Discover load error:", err); }
  loading = false;
}

/* ============== POPULAR ROW ================= */
async function loadPopularRow() {
  if (!popularRow) return;
  try {
    const res = await fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${API_KEY}&page=1`);
    const data = await res.json();
    if (data.results) renderToRow(popularRow, data.results.slice(0, 20), "movie");
  } catch (err) { console.error("Popular row error:", err); }
}

/* ============== MOVIES SECTION (ROW) ✅ ================= */
async function loadMoviesSection() {
  if (!moviesRow) return;
  try {
    const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&sort_by=popularity.desc&page=1`);
    const data = await res.json();
    if (data.results) renderToRow(moviesRow, data.results.slice(0, 20), "movie");
  } catch (err) { console.error("Movies section error:", err); }
}

/* ============== TV SHOWS SECTION (ROW) ✅ ================= */
async function loadTVSection() {
  if (!tvRow) return;
  try {
    const res = await fetch(`https://api.themoviedb.org/3/trending/tv/week?api_key=${API_KEY}&page=1`);
    const data = await res.json();
    if (data.results) {
      const tvItems = data.results.map(x => ({ ...x, media_type: "tv" }));
      renderToRow(tvRow, tvItems.slice(0, 20), "tv");
    }
  } catch (err) { console.error("TV section error:", err); }
}

/* ============== SEARCH ================= */
async function searchMovies(query) {
  if (!query) {
    setSearchingUI(false);
    if (movieGrid) {
      movieGrid.innerHTML = "";
      renderMovies(allMovies, false);
    }
    return;
  }

  setSearchingUI(true);

  try {
    const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}&page=1`);
    const data = await res.json();
    if (data.results) {
      const filtered = data.results.filter(item => item.media_type === "movie" || item.media_type === "tv");
      movieGrid.innerHTML = "";

      filtered.forEach((movie) => {
        const title = movie.title || movie.name;
        const year = (movie.release_date || movie.first_air_date || "").slice(0, 4);
        const type = movie.media_type || (movie.first_air_date ? "tv" : "movie");

        const a = document.createElement("a");
        a.href = type === "tv" ? `tv.html?id=${movie.id}` : `movie.html?id=${movie.id}`;
        a.className = "movie-card";
        a.style.backgroundImage = `url(${safePoster(movie.poster_path || "")})`;

        a.addEventListener("click", () => {
          saveContinueWatching({
            id: movie.id,
            title,
            poster_path: movie.poster_path,
            media_type: type
          });
        });

        a.innerHTML = `
          <div class="movie-overlay">
            <h3>${title}${year ? ` (${year})` : ""}</h3>
            <p>⭐ ${(movie.vote_average || 0).toFixed(1)}</p>
          </div>
        `;
        movieGrid.appendChild(a);
      });
    } else {
      movieGrid.innerHTML = "<p style='color:white; text-align:center;'>No results found.</p>";
    }
  } catch (err) { console.error("Search error:", err); }
}

if (searchInput) {
  searchInput.addEventListener("input", (e) => searchMovies(e.target.value));
}

/* ============== INFINITE SCROLL (Browse only) ================= */
window.addEventListener("scroll", () => {
  if (searching || loading) return;
  if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 200) {
    if (trendingPage <= MAX_TRENDING_PAGES) loadTrending();
    else if (discoverPage <= MAX_DISCOVER_PAGES) loadDiscover();
  }
});

/* ============== INITIAL LOADS ================= */
loadPopularRow();
loadMoviesSection();
loadTVSection();
loadTrending();

/* ============== MOVIE PAGE LOGIC (kept) ================= */
const params = new URLSearchParams(location.search);
const movieId = params.get("id");

const movieTitle = document.getElementById("movieTitle");
const movieDesc = document.getElementById("movieDesc");
const moviePoster = document.getElementById("moviePoster");
const moviePlayer = document.getElementById("moviePlayer");

if (movieId && moviePlayer) {
  fetch(`https://api.themoviedb.org/3/movie/${movieId}?api_key=${API_KEY}`)
    .then(res => res.json())
    .then((movie) => {
      movieTitle.textContent = `${movie.title} (${movie.release_date?.split("-")[0]})`;
      movieDesc.textContent = movie.overview;
      moviePoster.src = IMAGE_BASE + movie.poster_path;
      moviePlayer.src = `https://www.vidking.net/embed/movie/${movieId}?color=e50914`;

      saveContinueWatching({
        id: movie.id,
        title: movie.title,
        poster_path: movie.poster_path,
        media_type: "movie"
      });
    })
    .catch(() => {
      movieTitle.textContent = "Movie not found";
      movieDesc.textContent = "";
    });
}

/* ================= CONTINUE WATCHING ================= */
function saveContinueWatching(movie){
  try {
    let list = JSON.parse(localStorage.getItem("continueWatching") || "[]");

    list = list.filter(m => m.id !== movie.id);

    list.unshift({
      id: movie.id,
      title: movie.title || movie.name,
      poster: movie.poster_path || movie.poster,
      type: movie.media_type || movie.type || "movie"
    });

    list = list.slice(0, 12);
    localStorage.setItem("continueWatching", JSON.stringify(list));
  } catch (e) {
    localStorage.setItem("continueWatching", "[]");
  }
}

function loadContinueWatching(){
  if(!continueGrid || !continueSection) return;

  const list = JSON.parse(localStorage.getItem("continueWatching") || "[]");

  if(list.length === 0){
    continueSection.classList.add("hidden");
    return;
  }

  continueSection.classList.remove("hidden");
  continueGrid.innerHTML = "";

  list.forEach(item=>{
    const a = document.createElement("a");
    a.href = item.type === "tv" ? `tv.html?id=${item.id}` : `movie.html?id=${item.id}`;
    a.className = "continue-card";
    a.style.backgroundImage = `url(${IMAGE_BASE + item.poster})`;
    a.innerHTML = `<div class="continue-overlay">${item.title}</div>`;
    continueGrid.appendChild(a);
  });
}

loadContinueWatching();

/* ============== SCROLL BUTTONS (remote friendly) ============== */
function setupRowScrollButtons(){
  document.querySelectorAll("[data-scroll-left]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const sel = btn.getAttribute("data-scroll-left");
      const row = document.querySelector(sel);
      if(row) row.scrollBy({ left: -Math.max(320, row.clientWidth * 0.85), behavior: "smooth" });
    });
  });

  document.querySelectorAll("[data-scroll-right]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const sel = btn.getAttribute("data-scroll-right");
      const row = document.querySelector(sel);
      if(row) row.scrollBy({ left: Math.max(320, row.clientWidth * 0.85), behavior: "smooth" });
    });
  });
}

setupRowScrollButtons();