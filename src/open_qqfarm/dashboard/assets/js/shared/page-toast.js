(function () {
  const shared = (window.openQQFarmShared = window.openQQFarmShared || {});

  shared.createPageToast = function createPageToast({ state }) {
    function ensureToastLayer() {
      if (state.toastLayer && document.body.contains(state.toastLayer)) {
        return state.toastLayer;
      }
      const layer = document.createElement("div");
      layer.className = "toast-layer";
      document.body.appendChild(layer);
      state.toastLayer = layer;
      return layer;
    }

    function showToast(message, type = "info") {
      const text = String(message || "").trim();
      if (!text) return;
      const layer = ensureToastLayer();
      layer.innerHTML = "";
      const tip = document.createElement("div");
      tip.className = `toast-tip ${type}`;
      tip.textContent = text;
      layer.appendChild(tip);
      window.setTimeout(() => {
        if (tip.parentElement) {
          tip.remove();
        }
      }, 3200);
    }

    return {
      ensureToastLayer,
      showToast
    };
  };
})();
