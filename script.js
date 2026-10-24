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
  because:        document.getElementById("becauseRow"),
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
const becauseBlock     = document.getElementById("becauseBlock");
const becauseTitle     = document.getElementById("becauseTitle");
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
let homepagePools      = [];
let homepageKeep       = null;

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
  return (data?.results || []).map(item => normalizeItem(item, type)).filter(i => !isUpcoming(i));
}

function endpointWithPage(endpoint, page) {
  const clean = endpoint.replace(/([?&])page=\d+(&?)/, (m, p1, p2) => p2 ? p1 : '');
  return clean + (clean.includes("?") ? "&" : "?") + "page=" + page;
}

async function getListPages(endpoint, type, pages = 5) {
  const batches = await Promise.all(
    Array.from({ length: pages }, (_, i) => getList(endpointWithPage(endpoint, i + 1), type))
  );
  const seen = new Set();
  const out = [];
  batches.flat().forEach(item => {
    const key = mediaKey(item);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  });
  return out;
}

function normalizeItem(item, type) {
  return {
    ...item,
    media_type:   type || item.media_type || (item.name ? "tv" : "movie"),
    sharky_title: item.title || item.name || "Untitled",
    sharky_date:  item.release_date || item.first_air_date || "",
  };
}

/* ── Coming soon ────────────────────────────────────────────
   A title with a release / first-air date after today is not out yet, so it
   is kept out of the normal rows and shown in "Coming Soon" instead. Titles
   with no date at all are left alone (saved items, odd TMDB entries). */
function localISODate(d) {
  const z = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
const TODAY_ISO = localISODate(new Date());
const releaseDateOf = i => (i && (i.sharky_date || i.release_date || i.first_air_date)) || "";
function isUpcoming(i) { const d = releaseDateOf(i); return !!d && d > TODAY_ISO; }
function comingDateText(i) {
  const d = releaseDateOf(i);
  if (!d) return "Coming soon";
  const dt = new Date(d + "T00:00:00");
  return isNaN(dt) ? "Coming soon"
    : "Coming " + dt.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
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
const mediaKey = i => i && i.id != null ? `${i.media_type || (i.name ? "tv" : "movie")}:${i.id}` : "";
const titleKey = i => String((i && (i.sharky_title || i.title || i.name)) || "")
  .toLowerCase()
  .replace(/&/g, "and")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

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
  const upcoming  = isUpcoming(item);
  if (upcoming) card.classList.add("is-upcoming");

  card.innerHTML = `
    ${removable ? `<button class="card-remove" title="Remove" aria-label="Remove" data-act="remove">&times;</button>` : ""}
    <img src="${getCardImg(item)}" alt="${escapeHTML(item.sharky_title)}" loading="lazy">
    <div class="card-overlay">
      <h3 class="card-title">${escapeHTML(item.sharky_title)}</h3>
      <div class="card-actions">
        ${upcoming ? "" : `<button class="card-ic play"  title="Play"       data-act="play">&#9654;</button>`}
        <button class="card-ic"       title="My List"    data-act="list">+</button>
        <button class="card-ic"       title="More Info"  data-act="info">&#9432;</button>
      </div>
      <div class="card-meta">
        ${rating ? `<span class="card-rating">&#9733; ${rating}</span>` : ""}
        ${year   ? `<span>${year}</span>` : ""}
        <span class="card-badge">${typeLabel}</span>
        ${upcoming ? `<span class="card-badge card-soon">${escapeHTML(comingDateText(item))}</span>` : `<span class="card-badge">HD</span>`}
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
  refreshBecauseWatched();
}

const SHARKY_API = 'https://api.sharkmovie.co.uk';
const LIBRARY_FILTER_TIMEOUT_MS = 8000;
const sharkyTimeoutSignal = ms =>
  window.AbortSignal && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined;

/* ── Only show what we can actually play ──────────────────────────────────
   The homepage used to list whatever TMDB was promoting, most of which had to
   be scraped on demand and could simply fail. These rows are filtered down to
   what the debrid library already holds, so everything on the front page
   plays immediately. Search is deliberately NOT filtered - it still reaches
   the whole catalogue and scrapes on demand.

   Fails OPEN: if the check errors or times out we show everything, because a
   full homepage with some duds is a great deal better than an empty one. */
async function libraryAvailable(items) {
  const uniq = new Map();
  (items || []).forEach(i => {
    if (i && i.id != null) uniq.set(`${i.media_type || 'movie'}:${i.id}`, i);
  });
  const list = [...uniq.values()];
  if (!list.length) return new Set();

  const keep = new Set();
  const byId = new Map();
  list.forEach(x => {
    const id = String(x.id);
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(mediaKey(x));
  });
  let answered = false;
  const CHUNK_SIZE = 80;
  for (let i = 0; i < list.length; i += CHUNK_SIZE) {
    const chunk = list.slice(i, i + CHUNK_SIZE).map(x => ({
      id: x.id,
      title: x.sharky_title || x.title || x.name || '',
      year: getYear(x) || '',
      kind: x.media_type === 'tv' ? 'tv' : 'movie'
    }));
    try {
      const r = await fetch(`${SHARKY_API}/library/filter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: chunk }),
        signal: sharkyTimeoutSignal(LIBRARY_FILTER_TIMEOUT_MS)
      });
      if (!r.ok) {
        console.warn('[sharky] library check chunk failed', r.status);
        continue;
      }
      answered = true;
      const d = await r.json();
      if (Array.isArray(d.available_keys)) {
        d.available_keys.forEach(key => keep.add(String(key)));
      } else {
        (d.available || []).forEach(id => (byId.get(String(id)) || []).forEach(key => keep.add(key)));
      }
    } catch (e) {
      console.warn('[sharky] library check chunk unavailable', e);
    }
  }
  if (answered) return keep;
  console.warn('[sharky] library check unavailable - showing everything');
  return null;
}

/* Render a homepage row, dropping anything not in the library. An empty row
   is hidden outright rather than left saying "Nothing here yet". */
function playableOnly(items, keep) {
  return keep ? (items || []).filter(i => keep.has(mediaKey(i))) : (items || []);
}

function renderLibraryRow(row, items, keep, fallback = [], target = 8, avoidTitles = new Set()) {
  if (!row) return;
  const filled = [];
  const seenMedia = new Set();
  const seenTitles = new Set();
  const addUnique = item => {
    const key = mediaKey(item);
    const title = titleKey(item);
    if (!key || seenMedia.has(key) || (title && seenTitles.has(title))) return false;
    seenMedia.add(key);
    if (title) seenTitles.add(title);
    filled.push(item);
    return true;
  };
  playableOnly(items, keep).forEach(addUnique);
  for (const item of fallback) {
    if (filled.length >= target) break;
    addUnique(item);
  }
  if (filled.length < target) {
    for (const item of fallback) {
      if (filled.length >= target) break;
      const key = mediaKey(item);
      if (key && !seenMedia.has(key)) {
        seenMedia.add(key);
        filled.push(item);
      }
    }
  }
  const fresh = [];
  const repeats = [];
  filled.forEach(item => (avoidTitles.has(titleKey(item)) ? repeats : fresh).push(item));
  const finalList = fresh.length >= target ? fresh : fresh.concat(repeats.slice(0, target - fresh.length));
  const block = row.closest('.movie-row-block');
  if (!finalList.length) {
    row.innerHTML = '';
    if (block) block.classList.add('hidden');
    return;
  }
  if (block) block.classList.remove('hidden');
  renderRow(row, finalList);
  return finalList;
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
  row.__items = filtered;
}

function rememberRow(recentRows, items, keepRows = 2) {
  const titles = new Set((items || []).map(titleKey).filter(Boolean));
  if (titles.size) recentRows.push(titles);
  while (recentRows.length > keepRows) recentRows.shift();
}

function recentTitleSet(recentRows) {
  const out = new Set();
  recentRows.forEach(row => row.forEach(title => out.add(title)));
  return out;
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

  if (!detailsPlayBtn.dataset.label) detailsPlayBtn.dataset.label = detailsPlayBtn.innerHTML;
  if (isUpcoming(item)) {
    detailsPlayBtn.disabled = true;
    detailsPlayBtn.classList.add("is-upcoming");
    detailsPlayBtn.textContent = comingDateText(item);
    detailsPlayBtn.onclick = null;
  } else {
    detailsPlayBtn.disabled = false;
    detailsPlayBtn.classList.remove("is-upcoming");
    if (detailsPlayBtn.dataset.label) detailsPlayBtn.innerHTML = detailsPlayBtn.dataset.label;
    detailsPlayBtn.onclick = () => playItem(item);
  }
  detailsTrailerBtn.onclick = () => openTrailer(item);
  const detailsShareBtn = document.getElementById("detailsShareBtn");
  if (detailsShareBtn) detailsShareBtn.onclick = () =>
    window.sharkyShare && window.sharkyShare(type, id, "", "", item.sharky_title);
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
  if (isUpcoming(item)) { openDetails(item.id, item.media_type); return; }
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
  // Adding needs a free account (removing never does).
  if (!exists && window.sharkyNeedAccount &&
      !window.sharkyNeedAccount("add this to My List", () => { if (!isInMyList(item)) toggleMyList(item); })) return;
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
    genre_ids: item.genre_ids || [],
  };
}
function saveContinueWatching(item) {
  const list = getStorage(STORAGE_CONTINUE);
  const clean = { ...cleanStorageItem(item), lastWatched: Date.now() };
  const filtered = list.filter(x => !(Number(x.id) === Number(item.id) && x.media_type === item.media_type));
  setStorage(STORAGE_CONTINUE, [clean, ...filtered].slice(0, 20));
}
/* ── Most watched on Sharky ─────────────────────────────────────────────────
   What people here actually watched this week, counted by the server (a view
   = someone watching 2+ minutes). Hidden until there are a few titles, so a
   quiet week never shows a stub of a row. Never blocks the rest of the page. */
/* ── Coming Soon (not yet out) ──────────────────────────────
   Popular films and shows whose release date is after today. They never
   appear in the normal rows (getList filters them out); this row is where
   they live. Cards have no Play button, just the date it comes out. */
async function renderComingSoon() {
  const block = document.getElementById("comingSoonBlock");
  const row = document.getElementById("comingSoonRow");
  if (!block || !row) return;
  try {
    const t = new Date(); t.setDate(t.getDate() + 1);
    const from = localISODate(t);
    const [mv, tv] = await Promise.all([
      fetchTMDB(`/discover/movie?primary_release_date.gte=${from}&sort_by=popularity.desc&include_adult=false`),
      fetchTMDB(`/discover/tv?first_air_date.gte=${from}&sort_by=popularity.desc&include_adult=false`),
    ]);
    const items = [
      ...((mv && mv.results) || []).map(x => normalizeItem(x, "movie")),
      ...((tv && tv.results) || []).map(x => normalizeItem(x, "tv")),
    ].filter(i => isUpcoming(i) && i.poster_path && (i.backdrop_path || i.overview))
     .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
     .slice(0, 24);
    if (items.length < 4) { block.classList.add("hidden"); return; }
    row.innerHTML = "";
    items.forEach(i => row.appendChild(createCard(i)));
    block.classList.remove("hidden");
  } catch (e) {
    console.error("[shark] coming soon", e);
    block.classList.add("hidden");
  }
}

async function renderSharkyTop() {
  const block = document.getElementById("sharkyTopBlock");
  const row = document.getElementById("sharkyTopRow");
  if (!block || !row) return;
  try {
    const r = await fetch(`${SHARKY_API}/top-watched`, { cache: "no-store" });
    const d = await r.json();
    const top = (d && d.items) || [];
    const details = await Promise.all(top.slice(0, 10).map(t =>
      fetch(`${BASE_URL}/${t.kind === "tv" ? "tv" : "movie"}/${encodeURIComponent(t.id)}?api_key=${API_KEY}&language=en-US`)
        .then(x => x.ok ? x.json() : null)
        .then(j => j && j.id ? normalizeItem(j, t.kind === "tv" ? "tv" : "movie") : null)
        .catch(() => null)));
    let items = details.filter(i => i && (i.poster_path || i.backdrop_path));
    /* Always ten: top up from this week's trending if the server is short. */
    if (items.length < 10) {
      try {
        const tr = await fetch(`${BASE_URL}/trending/all/week?api_key=${API_KEY}&language=en-US`).then(x => x.json());
        const seen = new Set(items.map(i => i.media_type + ":" + i.id));
        for (const r of (tr && tr.results) || []) {
          if (items.length >= 10) break;
          if (r.media_type !== "movie" && r.media_type !== "tv") continue;
          const it = normalizeItem(r, r.media_type);
          if (seen.has(it.media_type + ":" + it.id) || !(it.poster_path || it.backdrop_path)) continue;
          seen.add(it.media_type + ":" + it.id);
          items.push(it);
        }
      } catch (e) {}
    }
    items = items.slice(0, 10);
    if (!items.length) { block.classList.add("hidden"); return; }
    block.classList.remove("hidden");
    renderRow(row, items);
    Array.from(row.children).forEach((card, i) => {
      const b = document.createElement("span");
      b.className = "sharky-rank";
      b.textContent = "#" + (i + 1);
      card.appendChild(b);
    });
  } catch (e) {
    block.classList.add("hidden");
  }
}

function renderContinueWatching() {
  const list = getStorage(STORAGE_CONTINUE);
  if (!list.length) { continueBlock.classList.add("hidden"); rowMap.continue.innerHTML = ""; return; }
  continueBlock.classList.remove("hidden");
  renderRow(rowMap.continue, list, { removable: true, source: "continue" });
}
function refreshBecauseWatched() {
  return renderBecauseWatched(homepagePools, homepageKeep);
}
function renderBecauseWatched(pools, keep, avoidTitles = new Set()) {
  if (!becauseBlock || !rowMap.because) return [];
  /* Personalised rows (foryou.js) took over: accounts only, per profile. */
  if (window.SharkyForYou) {
    becauseBlock.classList.add("hidden");
    window.SharkyForYou.render();
    return [];
  }
  const watched = getStorage(STORAGE_CONTINUE);
  if (!watched.length) {
    becauseBlock.classList.add("hidden");
    rowMap.because.innerHTML = "";
    return [];
  }

  const seed = watched[0];
  const seedGenres = new Set(seed.genre_ids || []);
  const watchedKeys = new Set(watched.map(mediaKey));
  const candidates = playableOnly(pools, keep)
    .filter(item => !watchedKeys.has(mediaKey(item)))
    .map(item => {
      const itemGenres = item.genre_ids || [];
      const genreScore = itemGenres.filter(g => seedGenres.has(g)).length;
      const sameType = item.media_type === seed.media_type ? 2 : 0;
      const rating = Number(item.vote_average || 0) / 10;
      return { item, score: genreScore * 4 + sameType + rating };
    })
    .filter(x => x.score > 0 || x.item.media_type === seed.media_type)
    .sort((a, b) => b.score - a.score)
    .map(x => x.item);

  const rendered = renderLibraryRow(rowMap.because, candidates.slice(0, 24), keep, candidates, 8, avoidTitles) || [];
  if (!rendered.length) {
    becauseBlock.classList.add("hidden");
    return [];
  }
  becauseBlock.classList.remove("hidden");
  const name = seed.sharky_title || seed.title || seed.name || "";
  becauseTitle.textContent = name ? `Because You Watched ${name}` : "Because You Watched";
  return rendered;
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
/* ── Search ─────────────────────────────────────────────────
   One box, several kinds of match, shown in this order:
     1. Titles   - TMDB /search/multi (a film literally called "Horror"
                   comes first because TMDB ranks exact titles high).
     2. Genre    - "horror", "scary", "sci fi", "kids", "anime"... -> TMDB
                   /discover by genre (movies + TV), most popular first.
     3. Topic    - TMDB keywords ("zombie", "christmas", "heist",
                   "superhero") -> /discover with_keywords.
     4. People   - search an actor/director -> what they're known for.
   Words like "movies", "films", "shows", "tv", "series" are ignored for
   matching, but "horror films" only shows films and "horror shows" only TV. */
const SEARCH_GENRES = [
  // [aliases, movie genre id, tv genre id, label]
  [["action"],                                   28,    10759, "Action"],
  [["adventure"],                                12,    10759, "Adventure"],
  [["animation","animated","anime","cartoon","cartoons"], 16, 16, "Animation"],
  [["comedy","comedies","funny","comedic"],      35,    35,    "Comedy"],
  [["crime","gangster","gangsters"],             80,    80,    "Crime"],
  [["documentary","documentaries","doc","docs"], 99,    99,    "Documentary"],
  [["drama","dramas"],                           18,    18,    "Drama"],
  [["family","kids","kid","children","childrens"], 10751, 10762, "Family & Kids"],
  [["fantasy"],                                  14,    10765, "Fantasy"],
  [["history","historical"],                     36,    null,  "History"],
  [["horror","horrors","scary"],                 27,    null,  "Horror"],
  [["music","musical","musicals"],               10402, null,  "Music"],
  [["mystery","mysteries"],                      9648,  9648,  "Mystery"],
  [["romance","romantic","romcom","rom com"], 10749, null, "Romance"],
  [["sci fi","scifi","sci-fi","science fiction","sf"], 878, 10765, "Sci-Fi"],
  [["thriller","thrillers","suspense"],          53,    null,  "Thriller"],
  [["war"],                                      10752, 10768, "War"],
  [["western","westerns","cowboy"],              37,    37,    "Western"],
  [["reality","reality tv"],                     null,  10764, "Reality"],
  [["soap","soaps"],                             null,  10766, "Soap"],
  [["talk show","talk shows"],                   null,  10767, "Talk"],
  [["news"],                                     null,  10763, "News"],
];
const SEARCH_FILLER = /\b(movies?|films?|shows?|tv|series|programmes?|programs?|the best|best|top|good)\b/g;

function searchIntent(q) {
  const low = q.toLowerCase().replace(/[^a-z0-9\- ]+/g, " ").replace(/\s+/g, " ").trim();
  let only = null;
  if (/\b(movies?|films?)\b/.test(low)) only = "movie";
  else if (/\b(shows?|tv|series|programmes?|programs?)\b/.test(low)) only = "tv";
  const core = low.replace(SEARCH_FILLER, " ").replace(/\s+/g, " ").trim();
  const flat = core.replace(/-/g, " ");
  const genre = SEARCH_GENRES.find(g => g[0].some(a => a === core || a === flat));
  return { core: core || low, only, genre };
}

function searchSubhead(text) {
  const h = document.createElement("h3");
  h.className = "search-subhead";
  h.style.cssText = "grid-column:1/-1;margin:18px 0 4px;font-size:1.05rem;font-weight:700;color:var(--muted,#aaa)";
  h.textContent = text;
  return h;
}

/* ── Typo-tolerant search ───────────────────────────────────
   TMDB's own search needs the spelling right. So we keep a local list of
   ~1500 well-known films/shows (popular + top rated + trending, cached in
   the browser for a day, plus whatever the homepage already loaded) and
   fuzzy-match the search against it: "intersteller", "brekaing bad",
   "spidermn", "harry poter" all find the real title. */
const SEARCH_INDEX_KEY = "sharky:search-index:v1";
const SEARCH_INDEX_TTL = 24 * 3600 * 1000;
let searchIndexPromise = null;

function compactKey(v) {
  return String(v || "").toLowerCase().replace(/&/g, "and").normalize("NFKD")
    .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
}

function getSearchIndex() {
  if (searchIndexPromise) return searchIndexPromise;
  searchIndexPromise = (async () => {
    try {
      const c = JSON.parse(localStorage.getItem(SEARCH_INDEX_KEY) || "null");
      if (c && c.t && Date.now() - c.t < SEARCH_INDEX_TTL && Array.isArray(c.items) && c.items.length > 200) return c.items;
    } catch (_) {}
    const lists = await Promise.all([
      getListPages("/movie/popular", "movie", 15),
      getListPages("/movie/top_rated", "movie", 10),
      getListPages("/tv/popular", "tv", 8),
      getListPages("/tv/top_rated", "tv", 8),
      getListPages("/trending/all/week", undefined, 3),
    ]);
    const seen = new Set(), items = [];
    lists.flat().forEach(i => {
      const k = mediaKey(i);
      if (!k || seen.has(k) || !(i.poster_path || i.backdrop_path)) return;
      seen.add(k);
      items.push({ id: i.id, media_type: i.media_type, sharky_title: i.sharky_title,
                   sharky_date: i.sharky_date, poster_path: i.poster_path,
                   backdrop_path: i.backdrop_path, vote_average: i.vote_average,
                   popularity: i.popularity || 0, overview: i.overview || "" });
    });
    try { localStorage.setItem(SEARCH_INDEX_KEY, JSON.stringify({ t: Date.now(), items })); } catch (_) {}
    return items;
  })().catch(() => { searchIndexPromise = null; return []; });
  return searchIndexPromise;
}

/* Damerau-Levenshtein (with transpositions: "brekaing" ~ "breaking"). */
function editDistance(a, b) {
  const n = a.length, m = b.length;
  if (!n) return m; if (!m) return n;
  let p2 = null, p1 = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = [i];
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(p1[j] + 1, cur[j - 1] + 1, p1[j - 1] + cost);
      if (p2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1);
      cur.push(v);
    }
    p2 = p1; p1 = cur;
  }
  return p1[m];
}

/* 0..1, how well what was typed matches a title. Handles typos, missing
   spaces/dashes ("spiderman"), and typing only the start of a long title
   ("harry poter" -> "Harry Potter and the ..."). */
const stripArticle = s => s.replace(/^(the|a|an)(?=[a-z0-9]{3})/, "");
function titleSimilarity(q, title) {
  return Math.max(titleSimilarity1(compactKey(q), compactKey(title)),
                  titleSimilarity1(stripArticle(compactKey(q)), stripArticle(compactKey(title))),
                  wordSimilarity(q, title));
}
/* Word by word: "the dark nite" -> dark=dark, nite~knight. Each typed word
   is matched to its closest word in the title (in order), weighted by length. */
const SIM_STOP = new Set(["the", "a", "an", "of", "and"]);
/* Rough "sounds like": knight/nite, phone/fone, back/bak, light/lite. */
const soundKey = w => w.replace(/^kn/, "n").replace(/gh/g, "").replace(/ph/g, "f")
  .replace(/ck/g, "k").replace(/(.)\1+/g, "$1").replace(/e$/, "");
function wordSimilarity(q, title) {
  const words = v => String(v || "").toLowerCase().replace(/&/g, " and ").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter(w => w && !SIM_STOP.has(w));
  const qa = words(q), ta = words(title);
  if (qa.length < 2 || !ta.length || ta.length > qa.length + 3) return 0;
  let tot = 0, got = 0, from = 0;
  for (const w of qa) {
    let best = 0, at = from;
    for (let j = from; j < ta.length; j++) {
      const t = ta[j];
      const ws = soundKey(w), tsk = soundKey(t);
      const sc = Math.max(1 - editDistance(w, t) / Math.max(w.length, t.length),
                          ws && tsk ? (1 - editDistance(ws, tsk) / Math.max(ws.length, tsk.length)) * 0.97 : 0);
      if (sc > best) { best = sc; at = j; }
    }
    if (best >= 0.5) from = at + 1;
    tot += w.length; got += w.length * best;
  }
  return (got / tot) * 0.95;
}
function titleSimilarity1(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const whole = 1 - editDistance(a, b) / Math.max(a.length, b.length);
  let start = 0;
  if (a.length >= 4 && b.length > a.length) {
    const head = b.slice(0, a.length + 1);
    start = (1 - Math.min(editDistance(a, head), editDistance(a, head.slice(0, a.length))) / a.length) * 0.92;
  }
  return Math.max(whole, start);
}

function fuzzyTitleMatches(q, pool, limit = 8) {
  const seen = new Set();
  return pool
    .filter(i => { const k = mediaKey(i); if (!k || seen.has(k)) return false; seen.add(k); return true; })
    .map(i => ({ i, sc: titleSimilarity(q, i.sharky_title) }))
    .filter(x => x.sc >= 0.7)
    .sort((x, y) => (y.sc - x.sc) || ((y.i.popularity || 0) - (x.i.popularity || 0)))
    .slice(0, limit)
    .map(x => ({ ...x.i, title: x.i.sharky_title }));   // normalizeItem() reads .title
}

searchInput.addEventListener("focus", () => { getSearchIndex(); }, { once: true });

let searchSeq = 0;
async function runSearch() {
  const q = searchInput.value.trim();
  if (q.length < 2) {
    searchSection.classList.add("hidden");
    rowsSection.classList.remove("hidden");
    return;
  }
  const mySeq = ++searchSeq;
  rowsSection.classList.add("hidden");
  searchSection.classList.remove("hidden");
  searchTitle.textContent = `Results for "${q}"`;
  showSkeletonGrid(searchGrid, 12);

  const { core, only, genre } = searchIntent(q);
  const today = TODAY_ISO;
  const wantMovie = only !== "tv", wantTv = only !== "movie";
  const enc = encodeURIComponent;

  const jobs = {
    multi:   fetchTMDB(`/search/multi?query=${enc(q)}&include_adult=false`),
    multi2:  core !== q.toLowerCase() ? fetchTMDB(`/search/multi?query=${enc(core)}&include_adult=false`) : null,
    gMovie:  genre && genre[1] && wantMovie ? fetchTMDB(`/discover/movie?with_genres=${genre[1]}&sort_by=popularity.desc&vote_count.gte=300&primary_release_date.lte=${today}&include_adult=false`) : null,
    gMovie2: genre && genre[1] && wantMovie ? fetchTMDB(`/discover/movie?with_genres=${genre[1]}&sort_by=popularity.desc&vote_count.gte=300&primary_release_date.lte=${today}&include_adult=false&page=2`) : null,
    gTv:     genre && genre[2] && wantTv ? fetchTMDB(`/discover/tv?with_genres=${genre[2]}&sort_by=popularity.desc&vote_count.gte=100&first_air_date.lte=${today}`) : null,
    kw:      core.length >= 3 ? fetchTMDB(`/search/keyword?query=${enc(genre ? genre[3].toLowerCase() : core)}`) : null,
  };
  jobs.index = Promise.race([getSearchIndex(), new Promise(r => setTimeout(() => r([]), 3000))]);
  const keys = Object.keys(jobs);
  const vals = await Promise.all(keys.map(k => jobs[k]));
  const R = Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
  if (mySeq !== searchSeq) return;               // a newer search has started

  const seen = new Set();
  const take = (arr, type) => (arr || [])
    .map(i => normalizeItem(i, type || i.media_type))
    .filter(i => (i.media_type === "movie" || i.media_type === "tv")
              && (i.poster_path || i.backdrop_path)
              && (!only || i.media_type === only))
    .filter(i => { const k = mediaKey(i); if (!k || seen.has(k)) return false; seen.add(k); return true; });

  const multiAll = [...(R.multi?.results || []), ...(R.multi2?.results || [])];

  // 1. Titles. Exact title matches first, then TMDB's own order.
  const coreKey = titleKey({ sharky_title: core });
  const titles = take(multiAll.filter(i => i.media_type !== "person"))
    .map((i, n) => ({ i, n, exact: titleKey(i) === coreKey || titleKey(i) === titleKey({ sharky_title: q }) }))
    .sort((a, b) => (b.exact - a.exact) || (a.n - b.n))
    .map(x => x.i);

  // Typos: if TMDB found nothing that really looks like what was typed,
  // fuzzy-match against the local list of well-known titles.
  let fuzzy = [];
  const bestHit = titles.slice(0, 10).reduce((m, i) => Math.max(m, titleSimilarity(core, i.sharky_title)), 0);
  if (!genre && bestHit < 0.9) {
    const pool = [...(R.index || []), ...(homepagePools || [])];
    fuzzy = take(fuzzyTitleMatches(core, pool, 8).filter(i => titleSimilarity(core, i.sharky_title) > bestHit));
    // Top guess: also pull TMDB's results for the corrected title, so sequels
    // and the TV/film versions show up too.
    if (fuzzy.length) {
      const fix = await fetchTMDB(`/search/multi?query=${enc(fuzzy[0].sharky_title)}&include_adult=false`);
      if (mySeq !== searchSeq) return;
      fuzzy = [...fuzzy, ...take((fix?.results || []).filter(i => i.media_type !== "person")).slice(0, 12)];
    }
  }

  // 2. Genre.
  let genreItems = [];
  if (genre) {
    genreItems = [...take(R.gMovie?.results, "movie"), ...take(R.gTv?.results, "tv"), ...take(R.gMovie2?.results, "movie")]
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  }

  // 3. Topic keyword (only when it isn't a genre). Exact keyword name only,
  //    so "batman" doesn't drag in every film tagged with some odd keyword.
  let topicItems = [], topicName = "";
  const kwWant = genre ? genre[3].toLowerCase() : core;
  const kwHit = (R.kw?.results || []).find(k => (k.name || "").toLowerCase() === kwWant);
  const kwForGenreTv = genre && !genre[2] && wantTv;      // e.g. horror: TMDB TV has no horror genre
  if (kwHit && (!genre || kwForGenreTv)) {
    topicName = kwHit.name;
    const [km, kt] = await Promise.all([
      wantMovie && !genre ? fetchTMDB(`/discover/movie?with_keywords=${kwHit.id}&sort_by=popularity.desc&vote_count.gte=20&primary_release_date.lte=${today}&include_adult=false`) : null,
      wantTv ? fetchTMDB(`/discover/tv?with_keywords=${kwHit.id}&sort_by=popularity.desc&vote_count.gte=${genre ? 50 : 10}&first_air_date.lte=${today}`) : null,
    ]);
    if (mySeq !== searchSeq) return;
    topicItems = [...take(km?.results, "movie"), ...take(kt?.results, "tv")]
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    if (genre) {                     // genre search: these are just more of the genre (TV side)
      genreItems = [...genreItems, ...topicItems].sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
      topicItems = []; topicName = "";
    }
  }

  // 4. People: the best-matching person's best-known work.
  let personItems = [], personName = "";
  /* Only when the search really is their name: "tom hanks" -> Tom Hanks,
     but "zombie" must not pull in Rob Zombie. */
  const person = genre ? null : multiAll.find(i => {
    if (i.media_type !== "person" || (i.popularity || 0) <= 1) return false;
    const pk = titleKey({ sharky_title: i.name });
    return pk === coreKey || (coreKey.includes(" ") && pk.includes(coreKey));
  });
  if (person) {
    const cr = await fetchTMDB(`/person/${person.id}/combined_credits`);
    if (mySeq !== searchSeq) return;
    personName = person.name;
    /* Real roles only: no chat shows, news, reality, or "Himself" cameos,
       best-known (most voted) first. */
    const credits = [...(cr?.cast || []), ...(cr?.crew || []).filter(c => c.job === "Director" || c.job === "Creator")]
      .filter(c => !(c.genre_ids || []).some(g => g === 10767 || g === 10763 || g === 10764 || g === 99))
      .filter(c => !/\b(self|himself|herself|themselves|host|guest)\b/i.test(c.character || ""))
      .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0));
    personItems = take(credits).slice(0, 30);
  }

  searchGrid.innerHTML = "";
  if (fuzzy.length) {
    searchTitle.innerHTML = `Results for "${escapeHTML(q)}" <span style="font-weight:400;font-size:.7em;color:var(--muted,#aaa)">· did you mean <a href="#" id="searchDidYouMean" style="color:inherit;text-decoration:underline">${escapeHTML(fuzzy[0].sharky_title)}</a>?</span>`;
    document.getElementById("searchDidYouMean")?.addEventListener("click", ev => {
      ev.preventDefault(); searchInput.value = fuzzy[0].sharky_title; runSearch();
    });
  }
  const groups = person ? [
    [personItems, `With ${personName}`],
    [fuzzy,       "Did you mean"],
    [titles,      titles.length ? "Titles" : ""],
  ] : [
    [fuzzy,       fuzzy.length && titles.length ? "Did you mean" : ""],
    [titles,      titles.length && (fuzzy.length || genreItems.length || topicItems.length || personItems.length) ? (fuzzy.length ? "Other matches" : "Titles") : ""],
    [genreItems,  genre ? `${genre[3]} ${only === "tv" ? "shows" : only === "movie" ? "films" : "films & shows"}` : ""],
    [topicItems,  topicName ? `About "${topicName}"` : ""],
    [personItems, personName ? `With ${personName}` : ""],
  ];
  let any = false;
  groups.forEach(([items, label]) => {
    if (!items.length) return;
    any = true;
    if (label) searchGrid.appendChild(searchSubhead(label));
    items.forEach(i => searchGrid.appendChild(createCard(i)));
  });
  if (!any) searchGrid.innerHTML = `<p class="empty-message">Nothing found.</p>`;
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

  const ROW_PAGES = 3;
  const [
    trendingAll,
    trendingMovies, popularMovies, topMovies,
    trendingTv, popularTv, topTv,
    action, comedy, horror, scifi, romance, animation, doc,
  ] = await Promise.all([
    getListPages("/trending/all/day", undefined, 3),
    getListPages("/trending/movie/week", "movie", ROW_PAGES),
    getListPages("/movie/popular", "movie", ROW_PAGES),
    getListPages("/movie/top_rated", "movie", ROW_PAGES),
    getListPages("/trending/tv/week", "tv", ROW_PAGES),
    getListPages("/tv/popular", "tv", ROW_PAGES),
    getListPages("/tv/top_rated", "tv", ROW_PAGES),
    getListPages("/discover/movie?with_genres=28&sort_by=popularity.desc", "movie", ROW_PAGES),
    getListPages("/discover/movie?with_genres=35&sort_by=popularity.desc", "movie", ROW_PAGES),
    getListPages("/discover/movie?with_genres=27&sort_by=popularity.desc", "movie", ROW_PAGES),
    getListPages("/discover/movie?with_genres=878&sort_by=popularity.desc", "movie", ROW_PAGES),
    getListPages("/discover/movie?with_genres=10749&sort_by=popularity.desc", "movie", ROW_PAGES),
    getListPages("/discover/movie?with_genres=16&sort_by=popularity.desc", "movie", ROW_PAGES),
    getListPages("/discover/movie?with_genres=99&sort_by=popularity.desc", "movie", ROW_PAGES),
  ]);

  /* One round trip for the whole page, then render each row from the answer.
     Doing it per row would be a dozen requests against a single-CPU box. */
  const keep = await libraryAvailable([
    ...trendingMovies, ...popularMovies, ...topMovies,
    ...trendingTv, ...popularTv, ...topTv,
    ...action, ...comedy, ...horror, ...scifi, ...romance, ...animation, ...doc
  ]);

  const movieFallback = playableOnly([
    ...trendingMovies, ...popularMovies, ...topMovies,
    ...action, ...comedy, ...horror, ...scifi, ...romance, ...animation, ...doc
  ], keep);
  const tvFallback = playableOnly([...trendingTv, ...popularTv, ...topTv], keep);

  renderContinueWatching();
  renderSharkyTop();
  renderComingSoon();
  const movieRecentRows = [];
  const tvRecentRows = [];
  const allPlayable = [...movieFallback, ...tvFallback];
  homepagePools = allPlayable;
  homepageKeep = keep;
  const becauseItems = refreshBecauseWatched();
  rememberRow(movieRecentRows, becauseItems.filter(i => i.media_type !== "tv"));
  rememberRow(tvRecentRows, becauseItems.filter(i => i.media_type === "tv"));

  let rendered = renderLibraryRow(rowMap.trendingMovies, trendingMovies, keep, movieFallback, 8, recentTitleSet(movieRecentRows));
  rememberRow(movieRecentRows, rendered);
  rendered = renderLibraryRow(rowMap.popularMovies, popularMovies, keep, movieFallback, 8, recentTitleSet(movieRecentRows));
  rememberRow(movieRecentRows, rendered);
  rendered = renderLibraryRow(rowMap.topMovies, topMovies, keep, movieFallback, 8, recentTitleSet(movieRecentRows));
  rememberRow(movieRecentRows, rendered);
  rendered = renderLibraryRow(rowMap.trendingTv, trendingTv, keep, tvFallback, 8, recentTitleSet(tvRecentRows));
  rememberRow(tvRecentRows, rendered);
  rendered = renderLibraryRow(rowMap.popularTv, popularTv, keep, tvFallback, 8, recentTitleSet(tvRecentRows));
  rememberRow(tvRecentRows, rendered);
  rendered = renderLibraryRow(rowMap.topTv, topTv, keep, tvFallback, 8, recentTitleSet(tvRecentRows));
  rememberRow(tvRecentRows, rendered);
  rendered = renderLibraryRow(rowMap.action, action, keep, movieFallback, 8, recentTitleSet(movieRecentRows));
  rememberRow(movieRecentRows, rendered);
  rendered = renderLibraryRow(rowMap.comedy, comedy, keep, movieFallback, 8, recentTitleSet(movieRecentRows));
  rememberRow(movieRecentRows, rendered);
  rendered = renderLibraryRow(rowMap.horror, horror, keep, movieFallback, 8, recentTitleSet(movieRecentRows));
  rememberRow(movieRecentRows, rendered);
  rendered = renderLibraryRow(rowMap.scifi, scifi, keep, movieFallback, 8, recentTitleSet(movieRecentRows));
  rememberRow(movieRecentRows, rendered);
  rendered = renderLibraryRow(rowMap.romance, romance, keep, movieFallback, 8, recentTitleSet(movieRecentRows));
  rememberRow(movieRecentRows, rendered);
  rendered = renderLibraryRow(rowMap.animation, animation, keep, movieFallback, 8, recentTitleSet(movieRecentRows));
  rememberRow(movieRecentRows, rendered);
  rendered = renderLibraryRow(rowMap.doc, doc, keep, movieFallback, 8, recentTitleSet(movieRecentRows));
  rememberRow(movieRecentRows, rendered);

  renderMyList();
  renderDownloads();

  // Hero — rotate through top trending
  /* The hero is the biggest Play button on the page, so it must never offer
     something we can't actually serve. Same library filter as the rows, with
     the same fail-open: if the check didn't answer, fall back to the old
     behaviour rather than showing no hero at all. */
  let heroPool = (trendingAll.length ? trendingAll : trendingMovies)
    .filter(i => i.backdrop_path && i.overview);
  if (keep) {
    const owned = heroPool.filter(i => keep.has(mediaKey(i)));
    if (owned.length) heroPool = owned;
  }
  startHeroCarousel(heroPool);

  /* Every row keeps going sideways as you scroll it. */
  [
    [rowMap.trendingMovies, "/trending/movie/week", "movie", trendingMovies],
    [rowMap.popularMovies,  "/movie/popular",       "movie", popularMovies],
    [rowMap.topMovies,      "/movie/top_rated",     "movie", topMovies],
    [rowMap.trendingTv,     "/trending/tv/week",    "tv",    trendingTv],
    [rowMap.popularTv,      "/tv/popular",          "tv",    popularTv],
    [rowMap.topTv,          "/tv/top_rated",        "tv",    topTv],
    [rowMap.action,    "/discover/movie?with_genres=28&sort_by=popularity.desc",    "movie", action],
    [rowMap.comedy,    "/discover/movie?with_genres=35&sort_by=popularity.desc",    "movie", comedy],
    [rowMap.horror,    "/discover/movie?with_genres=27&sort_by=popularity.desc",    "movie", horror],
    [rowMap.scifi,     "/discover/movie?with_genres=878&sort_by=popularity.desc",   "movie", scifi],
    [rowMap.romance,   "/discover/movie?with_genres=10749&sort_by=popularity.desc", "movie", romance],
    [rowMap.animation, "/discover/movie?with_genres=16&sort_by=popularity.desc",    "movie", animation],
    [rowMap.doc,       "/discover/movie?with_genres=99&sort_by=popularity.desc",    "movie", doc],
  ].forEach(([row, ep, type, first]) => makeRowEndless(row, ep, type, playableOnly(first, keep), ROW_PAGES + 1));
}

/* ── Endless rows ───────────────────────────────────────────────────────
   Scroll a row sideways (arrows, trackpad, swipe or the TV remote) and more
   titles keep arriving on the end: first the rest of what was already fetched
   for that row, then the next TMDB pages, each filtered to what the library
   can actually play. Stops only when TMDB runs out, or at a cap so a phone
   isn't asked to hold thousands of cards. */
const ENDLESS_ROW_MAX = 400;
const ENDLESS_BATCH = 12;          // cards added per top-up
const ENDLESS_PAGES = 2;           // TMDB pages fetched per trip

function makeRowEndless(row, ep, type, spare, nextPage) {
  if (!row || row.__endless) return;
  const src = {
    row, ep, type, page: nextPage, loading: false, done: false, dry: 0,
    queue: [], keys: new Set(),
  };
  /* Whatever renderLibraryRow put on screen is already "used". */
  (row.__items || []).forEach(i => src.keys.add(mediaKey(i)));
  (spare || []).forEach(i => {
    const k = mediaKey(i);
    if (k && !src.keys.has(k)) { src.keys.add(k); src.queue.push(i); }
  });
  row.__endless = src;
  row.addEventListener("scroll", () => checkRowEndless(row), { passive: true });
  row.addEventListener("focusin", () => setTimeout(() => checkRowEndless(row), 120));
  checkRowEndless(row);
}

function rowNearEnd(row) {
  return row.scrollLeft + row.clientWidth * 2.5 >= row.scrollWidth;
}

function checkRowEndless(row) {
  const src = row.__endless;
  if (!src || src.loading || src.done) return;
  if (!rowNearEnd(row)) return;
  topUpRow(src);
}

async function topUpRow(src) {
  const { row } = src;
  if (row.querySelectorAll(".movie-card").length >= ENDLESS_ROW_MAX) { src.done = true; return; }
  src.loading = true;
  try {
    /* Keep pulling pages until there is a batch's worth to add (or we've
       tried a fair few pages and the library simply doesn't have more). */
    let tries = 0;
    while (src.queue.length < ENDLESS_BATCH && !src.done && tries < 4) {
      tries++;
      const first = src.page;
      src.page += ENDLESS_PAGES;
      const pages = await Promise.all(
        Array.from({ length: ENDLESS_PAGES }, (_, i) =>
          fetchTMDB(endpointWithPage(src.ep, first + i)).catch(() => null)));
      if (pages.every(d => !d)) { src.page = first; break; }        // offline: retry next scroll
      const fresh = [];
      pages.forEach(d => {
        if (!d) return;
        if (d.total_pages && d.page >= d.total_pages) src.done = true;
        (d.results || []).forEach(raw => {
          const i = normalizeItem(raw, src.type);
          const k = mediaKey(i);
          if (!k || src.keys.has(k) || (!i.poster_path && !i.backdrop_path) || isUpcoming(i)) return;
          src.keys.add(k);
          fresh.push(i);
        });
      });
      if (first > 500) src.done = true;
      const keep = fresh.length ? await libraryAvailable(fresh) : null;
      const owned = playableOnly(fresh, keep);
      src.dry = owned.length ? 0 : src.dry + 1;
      if (src.dry >= 5) src.done = true;
      src.queue.push(...owned);
    }
    const batch = src.queue.splice(0, ENDLESS_BATCH);
    batch.forEach(i => row.appendChild(createCard(i)));
    if (!src.queue.length && src.done && !batch.length) return;
  } catch (e) {
    console.warn("[sharky] endless row failed", e);
  } finally {
    src.loading = false;
  }
  /* Still near the end (wide screen, or nothing playable came back)? Go again. */
  if (!src.done || src.queue.length) setTimeout(() => checkRowEndless(row), 60);
}

init();
