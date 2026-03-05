(function () {
  const shared = (window.openQQFarmShared = window.openQQFarmShared || {});

  shared.createPageFarmRender = function createPageFarmRender({
    refs,
    state,
    escapeHtml,
    formatCountdown,
    renderOwnerCard,
    updateLandGridTracks,
    applyFarmCamera,
    syncFarmCameraTargets,
    WITHERED_CROP_IMAGE,
    EMPTY_CROP_IMAGE,
    SEED_CROP_IMAGE
  }) {
    function tileSignature(tile) {
      const badges = Array.isArray(tile.badges) ? tile.badges.join("|") : "";
      const operations = Array.isArray(tile.operations) ? tile.operations.join("|") : "";
      return [
        Number(tile.slot || 0),
        Number(tile.land_id || 0),
        Number(tile.land_level || 1),
        Number(tile.phase || 0),
        String(tile.status || ""),
        String(tile.status_label || ""),
        String(tile.plant_name || ""),
        String(tile.phase_label || ""),
        Number(tile.countdown_sec || 0),
        String(tile.image || ""),
        badges,
        operations,
        String(tile.recommended_action || ""),
        tile.actionable ? "1" : "0"
      ].join("~");
    }

    function normalizedLandLevel(tile) {
      const raw = Number(tile.land_level || 0);
      if (!Number.isFinite(raw) || raw <= 0) return 1;
      return Math.max(1, Math.min(4, Math.floor(raw)));
    }

    function landSoilClass(level) {
      if (level <= 1) return "soil-yellow";
      if (level === 2) return "soil-red";
      if (level === 3) return "soil-black";
      return "soil-gold";
    }

    function phaseClass(tile) {
      const phase = Number(tile.phase || 0);
      if (!Number.isFinite(phase) || phase <= 0) return "phase-0";
      return `phase-${Math.max(1, Math.min(6, Math.floor(phase)))}`;
    }

    function growthProgressPercent(tile, status) {
      if (status === "locked" || status === "empty") return 0;
      if (status === "mature") return 100;
      const phase = Number(tile.phase || 0);
      if (!Number.isFinite(phase) || phase <= 0) return 0;
      const clamped = Math.max(1, Math.min(6, Math.floor(phase)));
      return Math.round(((clamped - 1) / 5) * 100);
    }

    function isSeedPhase(tile) {
      const phase = Number(tile?.phase || 0);
      const phaseLabel = String(tile?.phase_label || "");
      if (phaseLabel === "种子") return true;
      return Number.isFinite(phase) && phase === 1;
    }

    function createTileNode() {
      const node = document.createElement("article");
      node.className = "land-tile";
      node.innerHTML = `
      <div class="tile-head">
        <span class="tile-id">#0</span>
        <span class="tile-status"></span>
      </div>
      <div class="tile-crop">
        <div class="tile-effects">
          <span class="effect-weed">🌿</span>
          <span class="effect-insect">🐛</span>
          <span class="effect-star">⭐</span>
          <span class="effect-bucket">🪣</span>
          <span class="effect-water">💧</span>
        </div>
        <img src="/assets/images/logo.png" alt="crop" loading="lazy" />
        <div class="crop-name crop-main"></div>
        <div class="crop-name crop-phase"></div>
      </div>
      <div class="tile-foot"></div>
      <div class="tile-action"></div>
      <div class="tile-progress">
        <span class="tile-progress-fill"></span>
        <span class="tile-progress-tip"></span>
      </div>
    `;
      return node;
    }

    function patchTileNode(node, tile) {
      const status = tile.status || "locked";
      const badges = Array.isArray(tile.badges) ? tile.badges : [];
      const landId = Number(tile.land_id || 0);
      const action = String(tile.recommended_action || "");
      const clickable = Boolean(tile.actionable && landId > 0 && action);
      const landLevel = normalizedLandLevel(tile);
      const soilClass = landSoilClass(landLevel);
      const currentPhaseClass = phaseClass(tile);
      const hasWater = badges.includes("缺水");
      const hasWeed = badges.includes("有草");
      const hasInsect = badges.includes("有虫");
      const statusClasses = [
        currentPhaseClass,
        hasWater ? "state-dry" : "",
        hasWeed ? "state-weed" : "",
        hasInsect ? "state-insect" : ""
      ].filter(Boolean).join(" ");
      const growth = growthProgressPercent(tile, status);

      node.className = `land-tile ${status} ${soilClass} ${statusClasses}${clickable ? " actionable" : ""}`;
      node.dataset.slot = String(Number(tile.slot || 0));
      node.dataset.landId = String(landId);
      node.dataset.landLevel = String(landLevel);
      node.dataset.action = action;
      node.dataset.actionable = clickable ? "1" : "0";
      node.title = "";

      const idEl = node.querySelector(".tile-id");
      const statusEl = node.querySelector(".tile-status");
      const cropMainEl = node.querySelector(".crop-main");
      const cropPhaseEl = node.querySelector(".crop-phase");
      const imgEl = node.querySelector(".tile-crop img");
      const footEl = node.querySelector(".tile-foot");
      const actionEl = node.querySelector(".tile-action");
      const progressEl = node.querySelector(".tile-progress-fill");
      const progressWrapEl = node.querySelector(".tile-progress");
      const progressTipEl = node.querySelector(".tile-progress-tip");

      idEl.textContent = `#${landId || Number(tile.slot || 0)}`;
      statusEl.textContent = tile.status_label || "";

      const plantName = tile.plant_name || "";
      const phaseText = String(tile.phase_label || "");
      const countdownSec = Number(tile.countdown_sec || 0);
      cropMainEl.textContent = plantName && phaseText ? `${plantName} · ${phaseText}` : (plantName || phaseText || "");
      cropPhaseEl.textContent = "";

      const hideCropIcon = status === "empty" || status === "locked";
      const useSeedIcon = !hideCropIcon && status === "growing" && isSeedPhase(tile);
      const nextSrc = hideCropIcon
        ? EMPTY_CROP_IMAGE
        : (status === "dead" ? WITHERED_CROP_IMAGE : (useSeedIcon ? SEED_CROP_IMAGE : (tile.image || "/assets/images/logo.png")));
      if (imgEl.getAttribute("src") !== nextSrc) {
        imgEl.setAttribute("src", nextSrc);
      }
      imgEl.classList.toggle("is-hidden", hideCropIcon);
      imgEl.setAttribute("alt", hideCropIcon ? "" : (status === "dead" ? "withered-crop" : (useSeedIcon ? "seed-crop" : (plantName || "crop"))));
      imgEl.classList.toggle("withered", status === "dead");

      footEl.innerHTML = "";
      actionEl.textContent = "";
      if (progressEl) {
        progressEl.style.width = `${growth}%`;
      }
      if (progressWrapEl && progressTipEl) {
        const showTip = countdownSec > 0 && status !== "empty" && status !== "locked";
        progressWrapEl.classList.toggle("has-time", showTip);
        if (showTip) {
          const tipPos = Math.max(8, Math.min(92, growth));
          progressTipEl.textContent = formatCountdown(countdownSec);
          progressTipEl.style.left = `${tipPos}%`;
        } else {
          progressTipEl.textContent = "";
        }
      }
    }

    function renderSummary(summary) {
      if (!refs.farmSummary) return;
      const isFriend = Boolean(state.farm?.is_friend);
      const defs = [
        { key: "harvestable", label: "一键收获", icon: "🌾", mineAction: "harvest", friendAction: "steal" },
        { key: "need_water", label: "一键浇水", icon: "💧", mineAction: "water", friendAction: "help_water" },
        { key: "need_weed", label: "一键除草", icon: "🌿", mineAction: "weed", friendAction: "help_weed" },
        { key: "need_insect", label: "一键除虫", icon: "🐛", mineAction: "insect", friendAction: "help_insect" },
        { key: "dead", label: "一键清枯", icon: "🪦", mineAction: "remove", friendAction: "" },
        { key: "empty", label: "一键种植", icon: "🌱", mineAction: "plant", friendAction: "" }
      ];

      const buttons = [];
      for (const item of defs) {
        const count = Number(summary?.[item.key] || 0);
        if (count <= 0) continue;
        const action = isFriend ? item.friendAction : item.mineAction;
        if (!action) continue;
        buttons.push(`
        <button class="tool-btn tool-icon-btn icon-only summary-action-btn" data-summary-action="${escapeHtml(action)}" title="${escapeHtml(item.label)}" aria-label="${escapeHtml(item.label)}">
          <span class="tool-icon" aria-hidden="true">${item.icon}</span>
          <span class="summary-count-badge">${Math.max(0, Math.floor(count))}</span>
          <span class="tool-label">${escapeHtml(item.label)}</span>
        </button>
      `);
      }
      refs.farmSummary.innerHTML = buttons.join("");
    }

    function renderFarm() {
      const farm = state.farm;
      if (!farm) return;

      renderSummary(farm.summary || {});
      renderOwnerCard();

      const cols = Math.max(1, Number(farm.grid_cols || 6));
      const rows = Math.max(1, Number(farm.grid_rows || 4));
      updateLandGridTracks(cols, rows);

      const tiles = Array.isArray(farm.lands) ? farm.lands : [];
      const nextSlots = new Set();
      const orderedNodes = [];

      for (const tile of tiles) {
        const slot = Number(tile.slot || orderedNodes.length + 1);
        nextSlots.add(slot);

        let node = state.landNodeBySlot.get(slot);
        if (!node) {
          node = createTileNode();
          state.landNodeBySlot.set(slot, node);
        }

        const signature = tileSignature(tile);
        if (node.dataset.signature !== signature) {
          patchTileNode(node, tile);
          node.dataset.signature = signature;
          if (state.farmRendered) {
            node.classList.remove("tile-refresh");
            void node.offsetWidth;
            node.classList.add("tile-refresh");
          }
        }

        orderedNodes.push(node);
      }

      for (const [slot] of state.landNodeBySlot.entries()) {
        if (!nextSlots.has(slot)) {
          state.landNodeBySlot.delete(slot);
        }
      }

      refs.landGrid.replaceChildren(...orderedNodes);
      applyFarmCamera();
      syncFarmCameraTargets();
      state.farmRendered = true;
    }

    return {
      renderFarm
    };
  };
})();
