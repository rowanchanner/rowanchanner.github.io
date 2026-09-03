/* ==============================================================
   SHARKY MOVIES 2 — client script (Netflix-clone refresh)
   ============================================================== */

const API_KEY  = "47745852f22c21e3362f4907231538e1";
const BASE_URL = "https://api.themoviedb.org/3";
const IMG_URL      = "https://image.tmdb.org/t/p/w780";
const POSTER_URL   = "https://image.tmdb.org/t/p/w500";
const BACKDROP_URL = "https://image.tmdb.org/t/p/original";

const PLACEHOLDER_BACKDROP = "https://via.placeholder.com/780x439/0a0a0a/6d6d6d?text=SHARKY";
const PLACEHOLDER_POSTER   = "https://via.placeholder.com/500x750/0a0a0a/6d6d6d?text=SHARKY";

const STORAGE_MY_LIST  = "sharky_movies_2_my_list";
const STORAGE_CONTINUE = "sharky_movies_2_continue_watching";

/* ── DOM ─────────────────────────────────────────────────── */
const navbar          = document.getElementById("navbar");
const searchInput     = document.getElementById("searchInput");
const searchSection   = document.getElementById("searchSection");
const rowsSection     = document.getElementById("rowsSection");
const searchGrid      = document.getElementById("searchGrid");
const searchTitle     = document.getElementById("searchTitle");
const clearSearchBtn  = document.getElementById("clearSearchBtn");

const heroBanner    = document.getElementById("heroBanner");
const heroBg        = document.getElementById("heroBg");
const heroTitle     = document.getElementById("heroTitle");
const heroMeta      = document.getElementById("heroMeta");
const heroDesc      = document.getElementById("heroDesc");
const heroPlayBtn   = document.getElementById("heroPlayBtn");
const heroInfoBtn   = document.getElementById("heroInfoBtn");
const heroListBtn   = document.getElementById("heroListBtn");
const heroPager     = document.getElementById("heroPager");

const detailsModal    = document.getElementById("detailsModal");
const detailsBackdrop = document.getElementById("detailsBackdrop");
const detailsCloseBtn = document.getElementById("detailsCloseBtn");
const detailsHero     = document.getElementById("detailsHero");
const detailsTypeTag  = document.getElementById("detailsTypeTag");
const detailsTitle    = document.getElementById("detailsTitle");
const detailsMeta     = document.getElementById("detailsMeta");
const detailsOverview = document.getElementById("detailsOverview");
const detailsExtra    = document.getElementById("detailsExtra");
const detailsSide     = document.getElementById("detailsSide");
const detailsPlayBtn  = document.getElementById("detailsPlayBtn");
const detailsTrailerBtn = document.getElementById("detailsTrailerBtn");
const detailsListBtn  = document.getElementById("detailsListBtn");

const rowMap = {
  continue:       document.getElementById("continueRow"),
  trendingMovies: document.getElementById("trendingMoviesRow"),
  popularMovies:  document.getElementById("popularMoviesRow"),
  topMovies:      document.getElementById("topMoviesRow"),
  trendingTv:     document.getElementById("trendingTvRow"),
  popularTv:      document.getElementById("popularTvRow"),
  topTv:          document.getElementById("topTvRow"),
  action:         document.getElementById("actionRow"),
  comedy:         document.getElementById("comedyRow"),
  horror:         document.getElementById("horrorRow"),
  scifi:          document.getElementById("scifiRow"),
  romance:        document.getElementById("romanceRow"),
  animation:      document.getElementById("animationRow"),
  doc:            document.getElementById("docRow"),
  myList:         document.getElementById("myListRow"),
};

const continueBlock    = document.getElementById("continueBlock");
const myListBlock      = document.getElementById("myListBlock");
const clearContinueBtn = document.getElementById("clearContinueBtn");
const downloadsBlock   = document.getElementById("downloadsBlock");
const downloadsRow     = document.getElementById("downloadsRow");
const downloadsQuota   = document.getElementById("downloadsQuota");

let currentDetailsItem = null;
let currentHeroItem    = null;
let heroItems          = [];
let heroIdx            = 0;
let heroTimer          = null;
let searchTimer        = null;

/* ── Fetch helpers ───────────────────────────────────────── */
async function fetchTMDB(endpoint) {
  const sep = endpoint.includes("?") ? "&" : "?";
  const url = `${BASE_URL}${endpoint}${sep}api_key=${API_KEY}&language=en-US`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("[shark] tmdb fail", endpoint, err);
    return null;
  }
}

async function getList(endpoint, type) {
  const data = await fetchTMDB(endpoint);
  return (data?.results || []).map(item => normalizeItem(item, type));
}

function normalizeItem(item, type) {
  return {
    ...item,
    media_type:   type || item.media_type || (item.name ? "tv" : "movie"),
    sharky_title: item.title || item.name || "Untitled",
    sharky_date:  item.release_date || item.first_air_date || "",
  };
}

/* ── Presentational helpers ─────────────────────────────── */
const getYear = i => i.sharky_date ? i.sharky_date.slice(0, 4) : "";
const getRating = i => {
  const r = Number(i.vote_average || 0);
  return r > 0 ? r.toFixed(1) : "";
};
const getPoster   = i => i.poster_path   ? POSTER_URL   + i.poster_path   : PLACEHOLDER_POSTER;
const getBackdrop = i => i.backdrop_path ? BACKDROP_URL + i.backdrop_path : PLACEHOLDER_BACKDROP;
const getCardImg  = i => i.backdrop_path ? IMG_URL      + i.backdrop_path
                       : i.poster_path   ? POSTER_URL   + i.poster_path
                       : PLACEHOLDER_BACKDROP;

function truncate(text, len = 170) {
  if (!text) return "No overview available.";
  return text.length > len ? text.slice(0, len).trim() + "…" : text;
}

function escapeHTML(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getRuntimeText(item) {
  if (item.media_type === "tv") {
    const s = item.number_of_seasons || 0;
    return s ? `${s} Season${s === 1 ? "" : "s"}` : "TV Show";
  }
  if (!item.runtime) return "";
  const h = Math.floor(item.runtime / 60);
  const m = item.runtime % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

/* ── Skeletons ──────────────────────────────────────────── */
function showSkeletonRow(row, count = 8) {
  if (!row) return;
  row.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const c = document.createElement("div");
    c.className = "skeleton-card";
    row.appendChild(c);
  }
}
function showSkeletonGrid(grid, count = 12) {
  grid.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const c = document.createElement("div");
    c.className = "skeleton-card";
    grid.appendChild(c);
  }
}

/* ── Card ───────────────────────────────────────────────── */
function createCard(item, opts = {}) {
  const card = document.createElement("article");
  card.className = "movie-card";
  const typeLabel = item.media_type === "tv" ? "SERIES" : "FILM";
  const year   = getYear(item);
  const rating = getRating(item);
  const removable = opts.removable || false;   // Continue / My List cards

  card.innerHTML = `
    ${removable ? `<button class="card-remove" title="Remove" aria-label="Remove" data-act="remove">&times;</button>` : ""}
    <img src="${getCardImg(item)}" alt="${escapeHTML(item.sharky_title)}" loading="lazy">
    <div class="card-overlay">
      <h3 class="card-title">${escapeHTML(item.sharky_title)}</h3>
      <div class="card-actions">
        <button class="card-ic play"  title="Play"       data-act="play">&#9654;</button>
        <button class="card-ic"       title="My List"    data-act="list">+</button>
        <button class="card-ic"       title="More Info"  data-act="info">&#9432;</button>
      </div>
      <div class="card-meta">
        ${rating ? `<span class="card-rating">&#9733; ${rating}</span>` : ""}
        ${year   ? `<span>${year}</span>` : ""}
        <span class="card-badge">${typeLabel}</span>
        <span class="card-badge">HD</span>
      </div>
    </div>`;

  // Delegated: play / list / info / remove; card itself = info.
  card.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "remove") {
      e.stopPropagation();
      const source = opts.source; // "continue" | "mylist"
      if (source === "continue") removeContinueItem(item);
      else if (source === "mylist") { toggleMyList(item); }
      return;
    }
    if (act === "play") { e.stopPropagation(); playItem(item); return; }
    if (act === "list") { e.stopPropagation(); toggleMyList(item); return; }
    openDetails(item.id, item.media_type);
  });
  return card;
}

function removeContinueItem(item) {
  const list = getStorage(STORAGE_CONTINUE)
    .filter(x => !(Number(x.id) === Number(item.id) && x.media_type === item.media_type));
  setStorage(STORAGE_CONTINUE, list);
  renderContinueWatching();
}

function renderRow(row, items, opts = {}) {
  if (!row) return;
  row.innerHTML = "";
  const filtered = (items || []).filter(i => i.poster_path || i.backdrop_path);
  if (!filtered.length) {
    row.innerHTML = `<p class="empty-message">Nothing here yet.</p>`;
    return;
  }
  filtered.forEach(i => row.appendChild(createCard(i, opts)));
}
function renderGrid(grid, items) {
  grid.innerHTML = "";
  const filtered = (items || []).filter(i => i.poster_path || i.backdrop_path);
  if (!filtered.length) {
    grid.innerHTML = `<p class="empty-message">Nothing found.</p>`;
    return;
  }
  filtered.forEach(i => grid.appendChild(createCard(i)));
}

/* ── HERO ───────────────────────────────────────────────── */
let heroTrailerIframe = null;
let heroTrailerTimer  = null;

function killHeroTrailer() {
  if (heroTrailerTimer) { clearTimeout(heroTrailerTimer); heroTrailerTimer = null; }
  if (heroTrailerIframe) {
    heroTrailerIframe.remove();
    heroTrailerIframe = null;
    heroBanner.classList.remove("has-trailer");
  }
}

async function fetchTrailerKey(item) {
  // TMDB videos endpoint — pick first YouTube trailer, else any YouTube video
  const type = item.media_type || (item.name ? "tv" : "movie");
  const data = await fetchTMDB(`/${type}/${item.id}/videos`);
  const vids = data?.results || [];
  const pick = vids.find(v => v.site === "YouTube" && v.type === "Trailer" && v.key)
            || vids.find(v => v.site === "YouTube" && v.key);
  return pick?.key || null;
}

async function armHeroTrailer(item) {
  const heroIdxAtSchedule = heroIdx;
  const key = await fetchTrailerKey(item);
  // Bail if hero moved on while we were fetching
  if (!key || heroIdx !== heroIdxAtSchedule || currentHeroItem?.id !== item.id) return;
  heroTrailerTimer = setTimeout(() => {
    // Bail again — user may have paged the hero in the last 3s
    if (heroIdx !== heroIdxAtSchedule || currentHeroItem?.id !== item.id) return;
    const iframe = document.createElement("iframe");
    iframe.className = "hero-trailer";
    iframe.allow = "autoplay; encrypted-media";
    iframe.setAttribute("frameborder", "0");
    // start=8 skips studio idents; playlist={key} makes loop work
    iframe.src = `https://www.youtube-nocookie.com/embed/${key}`
               + `?autoplay=1&mute=1&controls=0&showinfo=0&rel=0`
               + `&modestbranding=1&playsinline=1&loop=1&playlist=${key}&start=8&iv_load_policy=3`;
    heroBanner.appendChild(iframe);
    heroTrailerIframe = iframe;
    heroBanner.classList.add("has-trailer");
  }, 3000);
}

function setHero(item, idx = 0) {
  /* First real item — drop the skeleton. */
  const heroSection = document.getElementById('heroBanner');
  if (heroSection) heroSection.classList.remove('is-loading');
  killHeroTrailer();
  currentHeroItem = item;
  heroIdx = idx;

  // Preload then swap for a smooth crossfade
  const img = new Image();
  img.onload = () => { heroBg.style.backgroundImage = `url("${getBackdrop(item)}")`; };
  img.src = getBackdrop(item);

  heroTitle.textContent = item.sharky_title;
  heroDesc.textContent  = truncate(item.overview, 220);
  armHeroTrailer(item);

  const year   = getYear(item);
  const rating = getRating(item);
  heroMeta.innerHTML = `
    ${rating ? `<span class="rating">&#9733; ${rating}</span>` : ""}
    ${year   ? `<span>${year}</span>` : ""}
    <span>${item.media_type === "tv" ? "TV Series" : "Movie"}</span>
    <span>HD</span>
  `;

  heroPlayBtn.onclick = () => playItem(item);
  heroInfoBtn.onclick = () => openDetails(item.id, item.media_type);
  heroListBtn.onclick = () => { toggleMyList(item); updateMyListButton(heroListBtn, item); };
  updateMyListButton(heroListBtn, item);

  // Update pager dots
  [...heroPager.children].forEach((d, i) => d.classList.toggle("active", i === idx));
}

function startHeroCarousel(items) {
  heroItems = items.slice(0, 6).filter(i => i.backdrop_path);
  if (!heroItems.length) return;
  heroPager.innerHTML = "";
  heroItems.forEach((_, i) => {
    const b = document.createElement("button");
    b.setAttribute("aria-label", `Hero ${i + 1}`);
    b.addEventListener("click", () => { setHero(heroItems[i], i); resetHeroTimer(); });
    heroPager.appendChild(b);
  });
  setHero(heroItems[0], 0);
  resetHeroTimer();
}

function resetHeroTimer() {
  if (heroTimer) clearInterval(heroTimer);
  heroTimer = setInterval(() => {
    if (!heroItems.length) return;
    heroIdx = (heroIdx + 1) % heroItems.length;
    setHero(heroItems[heroIdx], heroIdx);
  }, 9000);
}

/* ── DETAILS MODAL ──────────────────────────────────────── */
async function openDetails(id, type) {
  const endpoint = type === "tv"
    ? `/tv/${id}?append_to_response=videos,credits`
    : `/movie/${id}?append_to_response=videos,credits`;
  const data = await fetchTMDB(endpoint);
  if (!data) return;

  const item = normalizeItem(data, type);
  currentDetailsItem = item;

  detailsTypeTag.textContent = type === "tv" ? "TV Series" : "Movie";
  detailsHero.style.backgroundImage = `url("${getBackdrop(item)}")`;
  detailsTitle.textContent   = item.sharky_title;
  detailsOverview.textContent = item.overview || "No overview available.";

  const year   = getYear(item);
  const rating = getRating(item);
  detailsMeta.innerHTML = `
    ${rating ? `<span class="rating">&#9733; ${rating}</span>` : ""}
    ${year   ? `<span>${year}</span>` : ""}
    <span>${type === "tv" ? "TV Series" : "Movie"}</span>
    <span>HD</span>
    ${getRuntimeText(item) ? `<span>${getRuntimeText(item)}</span>` : ""}
  `;

  const genres = item.genres?.slice(0, 4).map(g => g.name).join(" · ") || "";
  detailsExtra.textContent = genres;

  // Side panel — cast + director / creator
  const cast = (item.credits?.cast || []).slice(0, 4).map(c => c.name).join(", ");
  const crew = item.credits?.crew || [];
  const dirs = type === "tv"
    ? (item.created_by || []).map(c => c.name).join(", ")
    : crew.filter(c => c.job === "Director").map(c => c.name).join(", ");
  const country = (item.production_countries || [])[0]?.name || "";
  detailsSide.innerHTML = `
    ${cast    ? `<div class="side-row"><b>Cast</b><span>${escapeHTML(cast)}</span></div>` : ""}
    ${dirs    ? `<div class="side-row"><b>${type === "tv" ? "Creator" : "Director"}</b><span>${escapeHTML(dirs)}</span></div>` : ""}
    ${genres  ? `<div class="side-row"><b>Genres</b><span>${escapeHTML(genres)}</span></div>` : ""}
    ${country ? `<div class="side-row"><b>Origin</b><span>${escapeHTML(country)}</span></div>` : ""}
  `;

  detailsPlayBtn.onclick    = () => playItem(item);
  detailsTrailerBtn.onclick = () => openTrailer(item);
  detailsListBtn.onclick    = () => { toggleMyList(item); updateMyListButton(detailsListBtn, item); };
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
document.addEventListener("keydown", e => { if (e.key === "Escape") closeDetails(); });

/* ── Actions ────────────────────────────────────────────── */
function playItem(item) {
  saveContinueWatching(item);
  if (item.media_type === "tv") {
    const s = item.season || 1, ep = item.episode || 1;
    location.href = `tv.html?id=${encodeURIComponent(item.id)}&s=${s}&e=${ep}`;
  } else {
    location.href = `movie.html?id=${encodeURIComponent(item.id)}`;
  }
}

function openTrailer(item) {
  const videos = item.videos?.results || [];
  const trailer =
    videos.find(v => v.site === "YouTube" && v.type === "Trailer" && v.key) ||
    videos.find(v => v.site === "YouTube" && v.key);
  if (!trailer) { alert("No trailer found."); return; }
  window.open(`https://www.youtube.com/watch?v=${trailer.key}`, "_blank", "noopener,noreferrer");
}

/* ── Storage ────────────────────────────────────────────── */
function getStorage(k) { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } }
function setStorage(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
function isInMyList(item) {
  return getStorage(STORAGE_MY_LIST).some(x => Number(x.id) === Number(item.id) && x.media_type === item.media_type);
}
function toggleMyList(item) {
  const list = getStorage(STORAGE_MY_LIST);
  const exists = isInMyList(item);
  const clean  = cleanStorageItem(item);
  const updated = exists
    ? list.filter(x => !(Number(x.id) === Number(item.id) && x.media_type === item.media_type))
    : [clean, ...list];
  setStorage(STORAGE_MY_LIST, updated);
  updateMyListButton(heroListBtn, currentHeroItem);
  updateMyListButton(detailsListBtn, currentDetailsItem);
  renderMyList();
}
function updateMyListButton(button, item) {
  if (!button || !item) return;
  const inList = isInMyList(item);
  if (button.classList.contains("btn-icon")) {
    button.textContent = inList ? "✓" : "+";
    button.title       = inList ? "Remove from My List" : "Add to My List";
  } else {
    button.textContent = inList ? "✓ In My List" : "+ My List";
  }
}
function cleanStorageItem(item) {
  return {
    id: item.id, media_type: item.media_type,
    sharky_title: item.sharky_title, sharky_date: item.sharky_date,
    poster_path: item.poster_path, backdrop_path: item.backdrop_path,
    vote_average: item.vote_average, overview: item.overview,
  };
}
function saveContinueWatching(item) {
  const list = getStorage(STORAGE_CONTINUE);
  const clean = { ...cleanStorageItem(item), lastWatched: Date.now() };
  const filtered = list.filter(x => !(Number(x.id) === Number(item.id) && x.media_type === item.media_type));
  setStorage(STORAGE_CONTINUE, [clean, ...filtered].slice(0, 20));
}
function renderContinueWatching() {
  const list = getStorage(STORAGE_CONTINUE);
  if (!list.length) { continueBlock.classList.add("hidden"); rowMap.continue.innerHTML = ""; return; }
  continueBlock.classList.remove("hidden");
  renderRow(rowMap.continue, list, { removable: true, source: "continue" });
}
function renderMyList() {
  const list = getStorage(STORAGE_MY_LIST);
  if (!list.length) { myListBlock.classList.add("hidden"); rowMap.myList.innerHTML = ""; return; }
  myListBlock.classList.remove("hidden");
  renderRow(rowMap.myList, list, { removable: true, source: "mylist" });
}

/* ── Downloaded row ─────────────────────────────────────── */
async function renderDownloads() {
  if (!downloadsBlock || !window.SharkyDownloads) return;
  const list = window.SharkyDownloads.list();
  if (!list.length) {
    downloadsBlock.classList.add("hidden");
    if (downloadsRow) downloadsRow.innerHTML = "";
    if (downloadsQuota) downloadsQuota.textContent = "";
    return;
  }
  downloadsBlock.classList.remove("hidden");
  downloadsRow.innerHTML = "";
  list.forEach(meta => {
    const card = createCard(meta, { removable: true, source: "download" });
    // Override click: play offline instead of routing to shark
    card.addEventListener("click", async (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "remove") { e.stopPropagation(); await window.SharkyDownloads.deleteDownload(meta); renderDownloads(); return; }
      if (act === "list" || act === "info") return; // let default handlers fire
      if (act === "play" || !act) {
        e.stopPropagation();
        try {
          const url = await window.SharkyDownloads.playOffline(meta);
          openOfflinePlayer(meta, url);
        } catch (err) { alert("Offline playback failed: " + err.message); }
      }
    }, true);
    downloadsRow.appendChild(card);
  });
  // Quota text
  try {
    const est = await window.SharkyDownloads.estimate();
    if (est) {
      const mb = (est.usage / (1024*1024)).toFixed(0);
      const quotaMb = (est.quota / (1024*1024)).toFixed(0);
      downloadsQuota.textContent = `${list.length} title${list.length===1?"":"s"} · ${mb} MB used of ~${quotaMb} MB`;
    }
  } catch {}
}
if (window.SharkyDownloads) window.SharkyDownloads.onChange(renderDownloads);

/* Full-screen native <video> for offline playback */
function openOfflinePlayer(meta, blobUrl) {
  let modal = document.getElementById("offlineModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "offlineModal";
    modal.className = "offline-modal";
    modal.innerHTML = `
      <button class="offline-close" aria-label="Close">&times;</button>
      <video id="offlineVideo" controls autoplay playsinline></video>
    `;
    document.body.appendChild(modal);
    modal.querySelector(".offline-close").onclick = () => {
      const v = modal.querySelector("video");
      try { v.pause(); URL.revokeObjectURL(v.src); v.removeAttribute("src"); v.load(); } catch {}
      modal.classList.remove("active");
    };
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && modal.classList.contains("active")) modal.querySelector(".offline-close").click();
    });
  }
  const v = modal.querySelector("video");
  v.src = blobUrl;
  modal.classList.add("active");
}

/* ── Search ─────────────────────────────────────────────── */
async function runSearch() {
  const q = searchInput.value.trim();
  if (q.length < 2) {
    searchSection.classList.add("hidden");
    rowsSection.classList.remove("hidden");
    return;
  }
  rowsSection.classList.add("hidden");
  searchSection.classList.remove("hidden");
  searchTitle.textContent = `Results for "${q}"`;
  showSkeletonGrid(searchGrid, 12);
  const data = await fetchTMDB(`/search/multi?query=${encodeURIComponent(q)}`);
  const results = (data?.results || [])
    .filter(i => i.media_type === "movie" || i.media_type === "tv")
    .map(i => normalizeItem(i));
  renderGrid(searchGrid, results);
}
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 300);
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

/* ── Nav ────────────────────────────────────────────────── */
document.querySelectorAll(".nav-link[data-jump]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-link").forEach(x => x.classList.remove("active"));
    btn.classList.add("active");
    const jump = btn.dataset.jump;
    if (jump === "home")     window.scrollTo({ top: 0, behavior: "smooth" });
    if (jump === "movies")   document.getElementById("moviesBlock")?.scrollIntoView({ behavior: "smooth" });
    if (jump === "tv")       document.getElementById("tvBlock")?.scrollIntoView({ behavior: "smooth" });
    if (jump === "continue") {
      continueBlock.classList.remove("hidden");
      if (!getStorage(STORAGE_CONTINUE).length) {
        rowMap.continue.innerHTML =
          `<p class="empty-message">You haven't started watching anything yet — pick something to begin.</p>`;
      }
      continueBlock.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (jump === "mylist") {
      myListBlock.classList.remove("hidden");
      if (!getStorage(STORAGE_MY_LIST).length) {
        rowMap.myList.innerHTML =
          `<p class="empty-message">Your list is empty — hit &ldquo;+ My List&rdquo; on anything to save it here.</p>`;
      }
      myListBlock.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (jump === "downloads") {
      if (downloadsBlock) {
        downloadsBlock.classList.remove("hidden");
        if (!(window.SharkyDownloads?.list() || []).length) {
          downloadsRow.innerHTML =
            `<p class="empty-message">No downloads yet — open a movie and hit &ldquo;⬇ Download&rdquo; on the player page to save it for offline.</p>`;
        }
        downloadsBlock.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  });
});

/* ── Row arrow scrolling ────────────────────────────────── */
document.querySelectorAll(".row-viewport").forEach(vp => {
  const row = vp.querySelector(".movie-row");
  vp.querySelector(".row-arrow.left")?.addEventListener("click",
    () => row.scrollBy({ left: -row.clientWidth * .8, behavior: "smooth" }));
  vp.querySelector(".row-arrow.right")?.addEventListener("click",
    () => row.scrollBy({ left:  row.clientWidth * .8, behavior: "smooth" }));
});

/* ── Scroll → navbar solid ──────────────────────────────── */
window.addEventListener("scroll", () => {
  navbar.classList.toggle("scrolled", window.scrollY > 40);
});

/* ── Keep sticky browse-strip flush against the (variable-height) navbar ── */
function syncNavHeight() {
  const h = navbar.getBoundingClientRect().height;
  document.documentElement.style.setProperty("--nav-h", `${Math.round(h)}px`);
}
window.addEventListener("resize", syncNavHeight);
window.addEventListener("load",   syncNavHeight);
syncNavHeight();

/* ── Init ───────────────────────────────────────────────── */
async function init() {
  Object.values(rowMap).forEach(r => showSkeletonRow(r, 8));

  const [
    trendingAll,
    trendingMovies, popularMovies, topMovies,
    trendingTv, popularTv, topTv,
    action, comedy, horror, scifi, romance, animation, doc,
  ] = await Promise.all([
    getList("/trending/all/day"),
    getList("/trending/movie/week", "movie"),
    getList("/movie/popular", "movie"),
    getList("/movie/top_rated", "movie"),
    getList("/trending/tv/week", "tv"),
    getList("/tv/popular", "tv"),
    getList("/tv/top_rated", "tv"),
    getList("/discover/movie?with_genres=28&sort_by=popularity.desc", "movie"),
    getList("/discover/movie?with_genres=35&sort_by=popularity.desc", "movie"),
    getList("/discover/movie?with_genres=27&sort_by=popularity.desc", "movie"),
    getList("/discover/movie?with_genres=878&sort_by=popularity.desc", "movie"),
    getList("/discover/movie?with_genres=10749&sort_by=popularity.desc", "movie"),
    getList("/discover/movie?with_genres=16&sort_by=popularity.desc", "movie"),
    getList("/discover/movie?with_genres=99&sort_by=popularity.desc", "movie"),
  ]);

  renderRow(rowMap.trendingMovies, trendingMovies);
  renderRow(rowMap.popularMovies,  popularMovies);
  renderRow(rowMap.topMovies,      topMovies);
  renderRow(rowMap.trendingTv,     trendingTv);
  renderRow(rowMap.popularTv,      popularTv);
  renderRow(rowMap.topTv,          topTv);
  renderRow(rowMap.action,    action);
  renderRow(rowMap.comedy,    comedy);
  renderRow(rowMap.horror,    horror);
  renderRow(rowMap.scifi,     scifi);
  renderRow(rowMap.romance,   romance);
  renderRow(rowMap.animation, animation);
  renderRow(rowMap.doc,       doc);

  renderContinueWatching();
  renderMyList();
  renderDownloads();

  // Hero — rotate through top trending
  const heroPool = (trendingAll.length ? trendingAll : trendingMovies)
    .filter(i => i.backdrop_path && i.overview);
  startHeroCarousel(heroPool);
}

init();
