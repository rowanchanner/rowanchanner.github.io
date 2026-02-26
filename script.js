const API_KEY = "47745852f22c21e3362f4907231538e1";
const IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const movieGrid = document.getElementById("movieGrid");
const searchInput = document.getElementById("searchInput");

let trendingPage = 1;
let discoverPage = 1;
const MAX_TRENDING_PAGES = 50; 
const MAX_DISCOVER_PAGES = 50; 
let allMovies = [];
let loadedIds = new Set();
let loading = false;
let searching = false;

// ============== RENDER MOVIES =================
function renderMovies(movies, append = true) {
  if (!movieGrid) return;
  if (!append) movieGrid.innerHTML = "";

  movies.forEach((movie) => {
    if (loadedIds.has(movie.id) && !searching) return;

    const title = movie.title || movie.name;
    const year = (movie.release_date || movie.first_air_date || "").slice(0, 4);

    const a = document.createElement("a");
    a.href = movie.media_type === "tv" ? `tv.html?id=${movie.id}` : `movie.html?id=${movie.id}`;
    a.className = "movie-card";
    a.style.backgroundImage = `url(${IMAGE_BASE + (movie.poster_path || "")})`;
    a.innerHTML = `
      <div class="movie-overlay">
        <h3>${title} (${year})</h3>
        <p>⭐ ${(movie.vote_average || 0).toFixed(1)}</p>
      </div>
    `;
    movieGrid.appendChild(a);

    if (!searching) loadedIds.add(movie.id);
  });
}

// ============== LOAD TRENDING =================
async function loadTrending() {
  if (loading || trendingPage > MAX_TRENDING_PAGES || searching) return;
  loading = true;
  try {
    const res = await fetch(`https://api.themoviedb.org/3/trending/movie/week?api_key=${API_KEY}&page=${trendingPage}`);
    const data = await res.json();
    if (data.results) {
      const newMovies = data.results.filter(m => !loadedIds.has(m.id));
      allMovies.push(...newMovies);
      renderMovies(newMovies);
      trendingPage++;
    }
  } catch (err) { console.error("Trending load error:", err); }
  loading = false;
}

// ============== LOAD DISCOVER =================
async function loadDiscover() {
  if (loading || discoverPage > MAX_DISCOVER_PAGES || searching) return;
  loading = true;
  try {
    const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&sort_by=popularity.desc&page=${discoverPage}`);
    const data = await res.json();
    if (data.results) {
      const newMovies = data.results.filter(m => !loadedIds.has(m.id));
      allMovies.push(...newMovies);
      renderMovies(newMovies);
      discoverPage++;
    }
  } catch (err) { console.error("Discover load error:", err); }
  loading = false;
}

// ============== SEARCH =================
async function searchMovies(query) {
  if (!query) {
    searching = false;
    movieGrid.innerHTML = "";
    renderMovies(allMovies, false); // re-render homepage movies
    return;
  }

  searching = true;
  try {
    const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}&page=1`);
    const data = await res.json();
    if (data.results) {
      renderMovies(data.results.filter(item => item.media_type === "movie" || item.media_type === "tv"), false);
    } else {
      movieGrid.innerHTML = "<p style='color:white; text-align:center;'>No results found.</p>";
    }
  } catch (err) { console.error("Search error:", err); }
}

if (searchInput) {
  searchInput.addEventListener("input", (e) => searchMovies(e.target.value));
}

// ============== INFINITE SCROLL =================
window.addEventListener("scroll", () => {
  if (searching || loading) return;
  if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 200) {
    if (trendingPage <= MAX_TRENDING_PAGES) loadTrending();
    else if (discoverPage <= MAX_DISCOVER_PAGES) loadDiscover();
  }
});

// ============== INITIAL LOAD =================
loadTrending();

// ============== MOVIE PAGE LOGIC =================
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
    })
    .catch(() => {
      movieTitle.textContent = "Movie not found";
      movieDesc.textContent = "";
    });
}