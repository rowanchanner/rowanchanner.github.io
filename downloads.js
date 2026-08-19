/* ==============================================================
   SHARKY MOVIES 2 — Offline Downloads (Cache API + localStorage)
   Exposes `window.SharkyDownloads` for both index/watch pages.
   ============================================================== */
(function() {
  const CACHE_NAME       = "sharky-downloads-v1";
  const STORAGE_KEY      = "sharky_movies_2_downloads";
  const SHARKY_API       = "https://sharky-movies-api.onrender.com";

  const listeners = new Set();
  function emit(evt) { listeners.forEach(fn => { try { fn(evt); } catch (e) { console.warn(e); } }); }

  function getList() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  }
  function setList(v) { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); }
  function key(item) {
    const kind = item.media_type || "movie";
    return `${kind}:${item.id}:${item.season || ""}:${item.episode || ""}`;
  }
  function proxyUrl(item) {
    const kind = item.media_type || "movie";
    if (kind === "tv") {
      return `${SHARKY_API}/proxy/direct/tv/${item.id}/${item.season || 1}/${item.episode || 1}`;
    }
    return `${SHARKY_API}/proxy/direct/movie/${item.id}`;
  }

  async function isDownloaded(item) {
    const k = key(item);
    return getList().some(x => x._k === k);
  }

  async function startDownload(item, onProgress) {
    if (!("caches" in window)) throw new Error("Cache API not supported");
    const cache = await caches.open(CACHE_NAME);
    const url   = proxyUrl(item);
    onProgress?.({ phase: "connecting", pct: 0 });

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const total = Number(res.headers.get("Content-Length") || 0);

    // Stream + accumulate so we can report progress
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onProgress?.({
        phase: "downloading",
        received, total,
        pct: total ? Math.round(received / total * 100) : null,
      });
    }
    const blob = new Blob(chunks, { type: res.headers.get("Content-Type") || "video/mp4" });
    await cache.put(url, new Response(blob, {
      headers: { "Content-Type": blob.type, "Content-Length": String(blob.size) },
    }));

    // Track metadata
    const list = getList().filter(x => x._k !== key(item));
    list.unshift({
      _k: key(item),
      id: item.id,
      media_type: item.media_type || "movie",
      season: item.season || null,
      episode: item.episode || null,
      sharky_title: item.sharky_title || item.title || item.name || "Untitled",
      sharky_date:  item.sharky_date  || item.release_date || item.first_air_date || "",
      poster_path:  item.poster_path  || null,
      backdrop_path: item.backdrop_path || null,
      vote_average: item.vote_average || 0,
      overview:     item.overview     || "",
      cachedUrl:    url,
      bytes:        blob.size,
      addedAt:      Date.now(),
    });
    setList(list);
    onProgress?.({ phase: "done", pct: 100 });
    emit({ type: "added", item });
    return true;
  }

  async function playOffline(item) {
    const cache = await caches.open(CACHE_NAME);
    const list  = getList();
    const meta  = list.find(x => x._k === key(item));
    if (!meta) throw new Error("Not downloaded");
    const hit = await cache.match(meta.cachedUrl);
    if (!hit) throw new Error("Cache entry missing");
    return URL.createObjectURL(await hit.blob());
  }

  async function deleteDownload(item) {
    const cache = await caches.open(CACHE_NAME);
    const list  = getList();
    const meta  = list.find(x => x._k === key(item));
    if (!meta) return;
    await cache.delete(meta.cachedUrl);
    setList(list.filter(x => x._k !== key(item)));
    emit({ type: "removed", item });
  }

  async function estimate() {
    if (!navigator.storage?.estimate) return null;
    const e = await navigator.storage.estimate();
    return { usage: e.usage || 0, quota: e.quota || 0 };
  }

  window.SharkyDownloads = {
    list: getList,
    isDownloaded,
    startDownload,
    playOffline,
    deleteDownload,
    estimate,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();
