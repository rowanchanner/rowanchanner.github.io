/* ==============================================================
   SHARKY MOVIES 2 — Offline Downloads (Cache API + localStorage)
   Exposes `window.SharkyDownloads` for both index/watch pages.
   ============================================================== */
(function() {
  const CACHE_NAME       = "sharky-downloads-v1";
  const STORAGE_KEY      = "sharky_movies_2_downloads";
  const SHARKY_API       = "https://api.sharkmovie.co.uk";

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

  function downloadUrl(item) {
    const kind = item.media_type || "movie";
    if (kind === "tv") {
      return `${SHARKY_API}/download/tv/${item.id}/${item.season || 1}/${item.episode || 1}`;
    }
    return `${SHARKY_API}/download/movie/${item.id}`;
  }

  async function startDownload(item, onProgress) {
    const url = downloadUrl(item);
    onProgress?.({ phase: "connecting", pct: 0 });

    // Initiate real native file download directly into the user's Downloads folder
    const a = document.createElement("a");
    a.href = url;
    a.setAttribute("download", "");
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 2000);

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
