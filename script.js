const API_KEY = "47745852f22c21e3362f4907231538e1";
const BASE_URL = "https://api.themoviedb.org/3";
const IMG_URL = "https://image.tmdb.org/t/p/w500";
const BACKDROP_URL = "https://image.tmdb.org/t/p/original";

const PLACEHOLDER_POSTER = "https://via.placeholder.com/500x750/111111/ffffff?text=No+Poster";
const PLACEHOLDER_BACKDROP = "https://via.placeholder.com/1280x720/080808/ffffff?text=Sharky+Movies+2";

const STORAGE_MY_LIST = "sharky_movies_2_my_list";
const STORAGE_CONTINUE = "sharky_movies_2_continue_watching";

const navbar = document.getElementById("navbar");

const searchInput = document.getElementById("searchInput");
const searchSection = document.getElementById("searchSection");
const rowsSection = document.getElementById("rowsSection");
const searchGrid = document.getElementById("searchGrid");
const searchTitle = document.getElementById("searchTitle");
const clearSearchBtn = document.getElementById("clearSearchBtn");

const heroBanner = document.getElementById("heroBanner");
const heroTitle = document.getElementById("heroTitle");
const heroMeta = document.getElementById("heroMeta");
const heroDesc = document.getElementById("heroDesc");
const heroPlayBtn = document.getElementById("heroPlayBtn");
const heroListBtn = document.getElementById("heroListBtn");

const detailsModal = document.getElementById("detailsModal");
const detailsBackdrop = document.getElementById("detailsBackdrop");
const detailsCloseBtn = document.getElementById("detailsCloseBtn");
const detailsHero = document.getElementById("detailsHero");
const detailsTypeTag = document.getElementById("detailsTypeTag");
const detailsTitle = document.getElementById("detailsTitle");
const detailsMeta = document.getElementById("detailsMeta");
const detailsPoster = document.getElementById("detailsPoster");
const detailsOverview = document.getElementById("detailsOverview");
const detailsExtra = document.getElementById("detailsExtra");
const detailsPlayBtn = document.getElementById("detailsPlayBtn");
const detailsTrailerBtn = document.getElementById("detailsTrailerBtn");
const detailsListBtn = document.getElementById("detailsListBtn");

const rowMap = {
  continue: document.getElementById("continueRow"),
  trendingMovies: document.getElementById("trendingMoviesRow"),
  popularMovies: document.getElementById("popularMoviesRow"),
  topMovies: document.getElementById("topMoviesRow"),
  trendingTv: document.getElementById("trendingTvRow"),
  popularTv: document.getElementById("popularTvRow"),
  topTv: document.getElementById("topTvRow"),
  action: document.getElementById("actionRow"),
  horror: document.getElementById("horrorRow"),
  comedy: document.getElementById("comedyRow"),
  myList: document.getElementById("myListRow")
};

const continueBlock = document.getElementById("continueBlock");
const myListBlock = document.getElementById("myListBlock");
const clearContinueBtn = document.getElementById("clearContinueBtn");

let currentDetailsItem = null;
let currentHeroItem = null;
let searchTimer = null;

async function fetchTMDB(endpoint) {
  const sep = endpoint.includes("?") ? "&" : "?";
  const url = `${BASE_URL}${endpoint}${sep}api_key=${API_KEY}&language=en-US`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TMDB failed: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(err);
    return null;
  }
}

async function getList(endpoint, type) {
  const data = await fetchTMDB(endpoint);
  return (data?.results || []).map((item) => normalizeItem(item, type));
}

function normalizeItem(item, type) {
  return {
    ...item,
    media_type: type || item.media_type || (item.name ? "tv" : "movie"),
    sharky_title: item.title || item.name || "Untitled",
    sharky_date: item.release_date || item.first_air_date || "",
  };
}

function getYear(item) {
  return item.sharky_date ? item.sharky_date.slice(0, 4) : "N/A";
}

function getRating(item) {
  const rating = Number(item.vote_average || 0);
  return rating > 0 ? rating.toFixed(1) : "N/A";
}

function getPoster(item) {
  return item.poster_path ? IMG_URL + item.poster_path : PLACEHOLDER_POSTER;
}

function getBackdrop(item) {
  return item.backdrop_path ? BACKDROP_URL + item.backdrop_path : PLACEHOLDER_BACKDROP;
}

function truncate(text, len = 170) {
  if (!text) return "No overview available.";
  return text.length > len ? text.slice(0, len).trim() + "..." : text;
}

function escapeHTML(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getRuntimeText(item) {
  if (item.media_type === "tv") {
    const seasons = item.number_of_seasons || 0;
    return seasons ? `${seasons} season${seasons === 1 ? "" : "s"}` : "TV Show";
  }

  if (!item.runtime) return "Runtime unknown";

  const h = Math.floor(item.runtime / 60);
  const m = item.runtime % 60;

  return h ? `${h}h ${m}m` : `${m}m`;
}

function showSkeletonRow(row, count = 10) {
  row.innerHTML = "";

  for (let i = 0; i < count; i++) {
    const card = document.createElement("div");
    card.className = "skeleton-card";
    row.appendChild(card);
  }
}

function showSkeletonGrid(grid, count = 12) {
  grid.innerHTML = "";

  for (let i = 0; i < count; i++) {
    const card = document.createElement("div");
    card.className = "skeleton-card";
    grid.appendChild(card);
  }
}

function createCard(item) {
  const card = document.createElement("article");
  card.className = "movie-card";

  const typeLabel = item.media_type === "tv" ? "TV" : "Movie";

  card.innerHTML = `
    <img src="${getPoster(item)}" alt="${escapeHTML(item.sharky_title)} poster" loading="lazy">

    <div class="card-overlay">
      <h3 class="card-title">${escapeHTML(item.sharky_title)}</h3>

      <div class="card-meta">
        <span class="card-rating">★ ${getRating(item)}</span>
        <span>${getYear(item)}</span>
        <span>${typeLabel}</span>
        <span>HD</span>
      </div>

      <div class="card-play">View Details</div>
    </div>
  `;

  card.addEventListener("click", () => openDetails(item.id, item.media_type));

  return card;
}

function renderRow(row, items) {
  row.innerHTML = "";

  const filtered = (items || []).filter((item) => item.poster_path);

  if (!filtered.length) {
    row.innerHTML = `<p class="empty-message">Nothing found.</p>`;
    return;
  }

  filtered.forEach((item) => row.appendChild(createCard(item)));
}

function renderGrid(grid, items) {
  grid.innerHTML = "";

  const filtered = (items || []).filter((item) => item.poster_path);

  if (!filtered.length) {
    grid.innerHTML = `<p class="empty-message">Nothing found.</p>`;
    return;
  }

  filtered.forEach((item) => grid.appendChild(createCard(item)));
}

function setHero(item) {
  currentHeroItem = item;

  heroBanner.style.backgroundImage = `url("${getBackdrop(item)}")`;
  heroTitle.textContent = item.sharky_title;
  heroDesc.textContent = truncate(item.overview, 190);

  heroMeta.innerHTML = `
    <span>${getYear(item)}</span>
    <span>${item.media_type === "tv" ? "TV Show" : "Movie"}</span>
    <span>HD</span>
    <span>★ ${getRating(item)}</span>
  `;

  heroPlayBtn.onclick = () => playItem(item);
  heroListBtn.onclick = () => toggleMyList(item, heroListBtn);

  updateMyListButton(heroListBtn, item);
}

async function openDetails(id, type) {
  const endpoint =
    type === "tv"
      ? `/tv/${id}?append_to_response=videos,credits`
      : `/movie/${id}?append_to_response=videos,credits`;

  const data = await fetchTMDB(endpoint);
  if (!data) return;

  const item = normalizeItem(data, type);
  currentDetailsItem = item;

  detailsTypeTag.textContent = type === "tv" ? "TV Show" : "Movie";
  detailsHero.style.backgroundImage = `url("${getBackdrop(item)}")`;
  detailsTitle.textContent = item.sharky_title;
  detailsPoster.src = getPoster(item);
  detailsOverview.textContent = item.overview || "No overview available.";

  detailsMeta.innerHTML = `
    <span>${getYear(item)}</span>
    <span>${type === "tv" ? "TV Show" : "Movie"}</span>
    <span>HD</span>
    <span>★ ${getRating(item)}</span>
    <span>${getRuntimeText(item)}</span>
  `;

  const genres = item.genres?.slice(0, 3).map((g) => g.name).join(" • ") || "";
  detailsExtra.textContent = genres;

  detailsPlayBtn.onclick = () => playItem(item);
  detailsTrailerBtn.onclick = () => openTrailer(item);
  detailsListBtn.onclick = () => toggleMyList(item, detailsListBtn);

  updateMyListButton(detailsListBtn, item);

  detailsModal.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeDetails() {
  detailsModal.classList.remove("active");
  document.body.style.overflow = "";
}

detailsCloseBtn.addEventListener("click", closeDetails);
detailsBackdrop.addEventListener("click", closeDetails);

function playItem(item) {
  saveContinueWatching(item);

  if (item.media_type === "tv") {
    const season = item.season || 1;
    const episode = item.episode || 1;

    window.location.href = `tv.html?id=${encodeURIComponent(item.id)}&s=${encodeURIComponent(season)}&e=${encodeURIComponent(episode)}`;
  } else {
    window.location.href = `movie.html?id=${encodeURIComponent(item.id)}`;
  }
}

function openTrailer(item) {
  const videos = item.videos?.results || [];

  const trailer =
    videos.find((v) => v.site === "YouTube" && v.type === "Trailer" && v.key) ||
    videos.find((v) => v.site === "YouTube" && v.key);

  if (!trailer) {
    alert("No trailer found.");
    return;
  }

  window.open(`https://www.youtube.com/watch?v=${trailer.key}`, "_blank", "noopener,noreferrer");
}

function getStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch {
    return [];
  }
}

function setStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function isInMyList(item) {
  return getStorage(STORAGE_MY_LIST).some(
    (x) => Number(x.id) === Number(item.id) && x.media_type === item.media_type
  );
}

function toggleMyList(item, button) {
  const list = getStorage(STORAGE_MY_LIST);
  const exists = isInMyList(item);

  const cleanItem = cleanStorageItem(item);

  const updated = exists
    ? list.filter((x) => !(Number(x.id) === Number(item.id) && x.media_type === item.media_type))
    : [cleanItem, ...list];

  setStorage(STORAGE_MY_LIST, updated);
  updateMyListButton(button, item);
  renderMyList();
}

function updateMyListButton(button, item) {
  if (!button || !item) return;
  button.textContent = isInMyList(item) ? "✓ In My List" : "+ My List";
}

function cleanStorageItem(item) {
  return {
    id: item.id,
    media_type: item.media_type,
    sharky_title: item.sharky_title,
    sharky_date: item.sharky_date,
    poster_path: item.poster_path,
    backdrop_path: item.backdrop_path,
    vote_average: item.vote_average,
    overview: item.overview
  };
}

function saveContinueWatching(item) {
  const list = getStorage(STORAGE_CONTINUE);
  const cleanItem = {
    ...cleanStorageItem(item),
    lastWatched: Date.now()
  };

  const filtered = list.filter(
    (x) => !(Number(x.id) === Number(item.id) && x.media_type === item.media_type)
  );

  setStorage(STORAGE_CONTINUE, [cleanItem, ...filtered].slice(0, 20));
}

function renderContinueWatching() {
  const list = getStorage(STORAGE_CONTINUE);

  if (!list.length) {
    continueBlock.classList.add("hidden");
    rowMap.continue.innerHTML = "";
    return;
  }

  continueBlock.classList.remove("hidden");
  renderRow(rowMap.continue, list);
}

function renderMyList() {
  const list = getStorage(STORAGE_MY_LIST);

  if (!list.length) {
    myListBlock.classList.add("hidden");
    rowMap.myList.innerHTML = "";
    return;
  }

  myListBlock.classList.remove("hidden");
  renderRow(rowMap.myList, list);
}

async function runSearch() {
  const query = searchInput.value.trim();

  if (query.length < 3) {
    searchSection.classList.add("hidden");
    rowsSection.classList.remove("hidden");
    return;
  }

  rowsSection.classList.add("hidden");
  searchSection.classList.remove("hidden");
  searchTitle.textContent = `Search Results for "${query}"`;

  showSkeletonGrid(searchGrid, 12);

  const data = await fetchTMDB(`/search/multi?query=${encodeURIComponent(query)}`);

  const results = (data?.results || [])
    .filter((item) => item.media_type === "movie" || item.media_type === "tv")
    .map((item) => normalizeItem(item));

  renderGrid(searchGrid, results);
}

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 350);
});

clearSearchBtn.addEventListener("click", () => {
  searchInput.value = "";
  searchSection.classList.add("hidden");
  rowsSection.classList.remove("hidden");
  searchGrid.innerHTML = "";
});

clearContinueBtn.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_CONTINUE);
  renderContinueWatching();
});

document.querySelectorAll(".nav-link").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-link").forEach((x) => x.classList.remove("active"));
    btn.classList.add("active");

    const jump = btn.dataset.jump;

    if (jump === "home") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (jump === "movies") {
      document.getElementById("moviesBlock").scrollIntoView({ behavior: "smooth" });
      return;
    }

    if (jump === "tv") {
      document.getElementById("tvBlock").scrollIntoView({ behavior: "smooth" });
      return;
    }

    if (jump === "continue") {
      continueBlock.classList.remove("hidden");
      continueBlock.scrollIntoView({ behavior: "smooth" });
      return;
    }

    if (jump === "mylist") {
      myListBlock.classList.remove("hidden");
      myListBlock.scrollIntoView({ behavior: "smooth" });
    }
  });
});

window.addEventListener("scroll", () => {
  navbar.classList.toggle("scrolled", window.scrollY > 40);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDetails();
});

async function init() {
  Object.values(rowMap).forEach((row) => {
    if (row) showSkeletonRow(row, 10);
  });

  const [
    trendingMovies,
    popularMovies,
    topMovies,
    trendingTv,
    popularTv,
    topTv,
    action,
    horror,
    comedy
  ] = await Promise.all([
    getList("/trending/movie/week", "movie"),
    getList("/movie/popular", "movie"),
    getList("/movie/top_rated", "movie"),
    getList("/trending/tv/week", "tv"),
    getList("/tv/popular", "tv"),
    getList("/tv/top_rated", "tv"),
    getList("/discover/movie?with_genres=28&sort_by=popularity.desc", "movie"),
    getList("/discover/movie?with_genres=27&sort_by=popularity.desc", "movie"),
    getList("/discover/movie?with_genres=35&sort_by=popularity.desc", "movie")
  ]);

  renderRow(rowMap.trendingMovies, trendingMovies);
  renderRow(rowMap.popularMovies, popularMovies);
  renderRow(rowMap.topMovies, topMovies);
  renderRow(rowMap.trendingTv, trendingTv);
  renderRow(rowMap.popularTv, popularTv);
  renderRow(rowMap.topTv, topTv);
  renderRow(rowMap.action, action);
  renderRow(rowMap.horror, horror);
  renderRow(rowMap.comedy, comedy);

  renderContinueWatching();
  renderMyList();

  if (trendingMovies.length) setHero(trendingMovies[0]);
}

init();
