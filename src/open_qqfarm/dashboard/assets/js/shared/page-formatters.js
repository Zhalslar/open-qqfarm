(function () {
  const shared = (window.openQQFarmShared = window.openQQFarmShared || {});

  shared.createPageFormatters = function createPageFormatters() {
    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function initials(name) {
      const text = String(name || "?").trim();
      return text ? text.slice(0, 1).toUpperCase() : "?";
    }

    function avatarFallback(name, bg = "#dcebc9", fg = "#2f6338") {
      const first = encodeURIComponent(initials(name));
      return `data:image/svg+xml;utf8,` +
        `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'>` +
        `<rect width='80' height='80' rx='40' fill='${bg}'/>` +
        `<text x='40' y='50' text-anchor='middle' font-size='35' fill='${fg}' font-family='Microsoft YaHei'>${first}</text>` +
        `</svg>`;
    }

    function formatCountdown(sec) {
      const n = Math.max(0, Number(sec || 0));
      const h = Math.floor(n / 3600);
      const m = Math.floor((n % 3600) / 60);
      const s = n % 60;
      if (h > 0) {
        return `${h}h ${m}m`;
      }
      if (m > 0) {
        return `${m}m ${s}s`;
      }
      return `${s}s`;
    }

    function formatLogTime(ts) {
      const d = new Date(Number(ts || 0) * 1000);
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      const ss = String(d.getSeconds()).padStart(2, "0");
      return `${hh}:${mm}:${ss}`;
    }

    return {
      escapeHtml,
      initials,
      avatarFallback,
      formatCountdown,
      formatLogTime
    };
  };
})();
