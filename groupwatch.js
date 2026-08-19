/* ==============================================================
   SHARKY MOVIES 2 — Group Watch (SSE pub/sub via shark api)
   Exposes `window.GroupWatch` for movie/tv/roulette pages.
   ============================================================== */
(function() {
  const SHARKY_API = "https://sharky-movies-api.onrender.com";

  function code6() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }
  function userName() {
    let n = localStorage.getItem("sharky_gw_name");
    if (!n) {
      n = "Guest-" + Math.random().toString(36).slice(2, 5).toUpperCase();
      localStorage.setItem("sharky_gw_name", n);
    }
    return n;
  }
  function setUserName(n) {
    if (n && n.trim()) localStorage.setItem("sharky_gw_name", n.trim().slice(0, 24));
  }

  class Room {
    constructor(code) {
      this.code   = code;
      this.self   = userName();
      this.selfId = Math.random().toString(36).slice(2, 10);
      this.es     = null;
      this.handlers = { sync: [], chat: [], presence: [], hello: [] };
    }

    connect() {
      const url = `${SHARKY_API}/room/${encodeURIComponent(this.code)}/stream`;
      this.es = new EventSource(url);
      this.es.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.from && msg.from === this.selfId) return;   // ignore own echo
          (this.handlers[msg.type] || []).forEach(fn => fn(msg));
        } catch {}
      };
      this.es.onerror = () => console.warn("[gw] SSE error");
      // Announce presence
      setTimeout(() => this.emit("presence", { user: this.self, action: "join" }), 300);
    }

    on(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); }

    async emit(type, data) {
      const payload = {
        type, from: this.selfId, user: this.self, ...data,
      };
      try {
        await fetch(`${SHARKY_API}/room/${encodeURIComponent(this.code)}/event`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch (e) { console.warn("[gw] emit fail", e); }
    }

    async close() {
      try { await this.emit("presence", { user: this.self, action: "leave" }); } catch {}
      this.es?.close();
      this.es = null;
    }
  }

  window.GroupWatch = {
    createCode: code6,
    joinRoom: (code) => new Room(code),
    userName, setUserName,
  };
})();
