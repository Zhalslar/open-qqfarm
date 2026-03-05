(function () {
  const shared = (window.openQQFarmShared = window.openQQFarmShared || {});

  shared.createPageFarmActions = function createPageFarmActions({
    refs,
    state,
    request,
    showToast,
    renderFarm,
    loadFarm,
    renderRuntimeAndAccount,
    refreshHotbarItems,
    pushAutomationPanelActionEvent,
    normalizeActionEvent
  }) {
    const reqFn = typeof request === "function" ? request : () => Promise.resolve(null);
    const loadFarmFn = typeof loadFarm === "function" ? loadFarm : async () => { };
    const renderFarmFn = typeof renderFarm === "function" ? renderFarm : () => { };
    const renderRuntimeAndAccountFn = typeof renderRuntimeAndAccount === "function" ? renderRuntimeAndAccount : () => { };
    const refreshHotbarItemsFn = typeof refreshHotbarItems === "function"
      ? refreshHotbarItems
      : async () => { };
    const showToastFn = typeof showToast === "function"
      ? showToast
      : () => { };
    const MAX_PENDING_LAND_ACTIONS = 8;
    const PLANT_SEED_FLY_DURATION_MS = 2000;
    const REMOVE_ACTION_MIN_MS = 1000;
    const EXTERNAL_ACTION_QUEUE_LIMIT = 20;
    const EXTERNAL_ACTION_WAIT_MS = 120;
    let pendingLandActions = [];
    let pendingExternalActionOps = [];
    let pendingExternalActionSeq = 0;
    let externalActionPlaybackRunning = false;
    const plantPreviewSnapshots = new WeakMap();

    function queuePendingLandAction(tileNode) {
      const landId = Number(tileNode?.dataset?.landId || 0);
      const action = String(tileNode?.dataset?.action || "").trim();
      if (landId <= 0 || !action) return;

      // Keep only the latest click for the same tile+action pair.
      pendingLandActions = pendingLandActions.filter((item) => {
        return !(item.landId === landId && item.action === action);
      });
      pendingLandActions.push({ landId, action });

      if (pendingLandActions.length > MAX_PENDING_LAND_ACTIONS) {
        pendingLandActions = pendingLandActions.slice(
          pendingLandActions.length - MAX_PENDING_LAND_ACTIONS
        );
      }
    }

    function takePendingLandActionNode() {
      if (!refs.landGrid) return null;
      while (pendingLandActions.length > 0) {
        const pending = pendingLandActions.shift();
        if (!pending?.landId) continue;
        const node = refs.landGrid.querySelector(`.land-tile[data-land-id="${pending.landId}"]`);
        if (!node || node.dataset.actionable !== "1") continue;
        const nodeAction = String(node.dataset.action || "").trim();
        if (!nodeAction || nodeAction !== pending.action) continue;
        return node;
      }
      return null;
    }

    function actionAnimClass(action) {
      if (action === "harvest" || action === "steal") return "anim-harvest";
      if (action === "water" || action === "help_water") return "anim-water";
      if (action === "fertilize_normal" || action === "fertilize_organic") return "anim-water";
      if (action === "weed" || action === "help_weed") return "anim-weed";
      if (action === "insect" || action === "help_insect") return "anim-insect";
      if (action === "remove") return "anim-remove";
      return "";
    }

    function normalizeActionName(action) {
      const value = String(action || "").trim();
      if (value === "normal_fertilize") return "fertilize_normal";
      if (value === "organic_fertilize") return "fertilize_organic";
      return value;
    }

    const ACTION_SFX_PATTERNS = {
      plant: [
        { at: 0.0, f: 392, to: 523, d: 0.09, w: "triangle", g: 0.052 },
        { at: 0.1, f: 523, to: 659, d: 0.11, w: "sine", g: 0.046 }
      ],
      harvest: [
        { at: 0.0, f: 740, to: 988, d: 0.08, w: "square", g: 0.048 },
        { at: 0.09, f: 988, to: 1318, d: 0.1, w: "triangle", g: 0.044 }
      ],
      water: [
        { at: 0.0, f: 620, to: 430, d: 0.14, w: "sine", g: 0.043 },
        { at: 0.08, f: 510, to: 320, d: 0.16, w: "triangle", g: 0.036 }
      ],
      fertilize_normal: [
        { at: 0.0, f: 600, to: 450, d: 0.11, w: "sine", g: 0.042 },
        { at: 0.08, f: 520, to: 370, d: 0.11, w: "triangle", g: 0.036 }
      ],
      fertilize_organic: [
        { at: 0.0, f: 540, to: 420, d: 0.12, w: "sine", g: 0.044 },
        { at: 0.085, f: 460, to: 340, d: 0.13, w: "triangle", g: 0.038 }
      ],
      weed: [
        { at: 0.0, f: 280, to: 190, d: 0.07, w: "sawtooth", g: 0.044 },
        { at: 0.075, f: 330, to: 220, d: 0.075, w: "sawtooth", g: 0.04 }
      ],
      insect: [
        { at: 0.0, f: 980, to: 720, d: 0.08, w: "sawtooth", g: 0.042 },
        { at: 0.07, f: 860, to: 640, d: 0.09, w: "square", g: 0.04 }
      ],
      remove: [
        { at: 0.0, f: 200, to: 118, d: 0.16, w: "triangle", g: 0.05 }
      ],
      steal: [
        { at: 0.0, f: 520, to: 430, d: 0.07, w: "triangle", g: 0.038 },
        { at: 0.08, f: 430, to: 650, d: 0.09, w: "sine", g: 0.032 }
      ],
      help_water: [
        { at: 0.0, f: 560, to: 430, d: 0.14, w: "sine", g: 0.032 }
      ],
      help_weed: [
        { at: 0.0, f: 360, to: 250, d: 0.075, w: "triangle", g: 0.034 },
        { at: 0.085, f: 410, to: 290, d: 0.08, w: "triangle", g: 0.031 }
      ],
      help_insect: [
        { at: 0.0, f: 820, to: 610, d: 0.08, w: "triangle", g: 0.034 },
        { at: 0.075, f: 730, to: 560, d: 0.09, w: "sine", g: 0.03 }
      ]
    };

    function ensureSfxEngine() {
      if (state.sfx?.context && state.sfx?.master) {
        return state.sfx;
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;

      const context = new AudioCtx();
      const master = context.createGain();
      master.gain.value = 0.24;
      master.connect(context.destination);

      state.sfx = { context, master };
      return state.sfx;
    }

    function unlockSfxAudio() {
      const engine = ensureSfxEngine();
      if (!engine?.context) return;
      if (engine.context.state === "suspended") {
        void engine.context.resume().catch(() => { });
      }
    }

    function scheduleActionTone(context, master, startAt, note, volumeScale) {
      const freq = Math.max(30, Number(note?.f || 440));
      const duration = Math.max(0.02, Number(note?.d || 0.1));
      const at = Math.max(0, Number(note?.at || 0));
      const type = String(note?.w || "sine");
      const target = Math.max(30, Number(note?.to || freq));
      const peak = Math.max(0.0001, Number(note?.g || 0.04) * Math.max(0.4, volumeScale));

      const osc = context.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startAt + at);
      osc.frequency.exponentialRampToValueAtTime(target, startAt + at + duration);

      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, startAt + at);
      gain.gain.exponentialRampToValueAtTime(peak, startAt + at + Math.min(0.025, duration * 0.35));
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + at + duration);

      osc.connect(gain);
      gain.connect(master);
      osc.start(startAt + at);
      osc.stop(startAt + at + duration + 0.02);
    }

    function playActionSfx(action, options = {}) {
      const actionName = String(action || "").trim();
      if (!actionName) return;
      const pattern = ACTION_SFX_PATTERNS[actionName];
      if (!pattern || pattern.length <= 0) return;

      const engine = ensureSfxEngine();
      if (!engine?.context || !engine?.master) return;
      if (engine.context.state !== "running") {
        void engine.context.resume().then(() => {
          playActionSfx(actionName, options);
        }).catch(() => { });
        return;
      }

      const isBatch = Boolean(options?.batch);
      const volumeScale = isBatch ? 0.86 : 1.0;
      const startAt = engine.context.currentTime + 0.01;
      for (const note of pattern) {
        scheduleActionTone(engine.context, engine.master, startAt, note, volumeScale);
      }
    }

    function waitMs(ms) {
      const delay = Math.max(0, Number(ms || 0));
      if (delay <= 0) return Promise.resolve();
      return new Promise((resolve) => {
        window.setTimeout(resolve, delay);
      });
    }

    function collectBatchActionTileNodes(actionName) {
      if (!refs.landGrid) return [];
      const action = String(actionName || "").trim();
      if (!action) return [];

      // Prefer what user currently sees/can click in DOM to guarantee optimistic playback.
      const domNodes = Array.from(
        refs.landGrid.querySelectorAll(`.land-tile[data-actionable="1"][data-action="${action}"]`)
      ).filter((node) => node && node.isConnected);
      if (domNodes.length > 0) {
        return domNodes;
      }

      const lands = Array.isArray(state.farm?.lands) ? state.farm.lands : [];
      const picked = [];
      for (const tile of lands) {
        const landId = Number(tile?.land_id || 0);
        const operations = Array.isArray(tile?.operations) ? tile.operations : [];
        if (landId <= 0 || !operations.includes(action)) continue;
        const node = refs.landGrid.querySelector(`.land-tile[data-land-id="${landId}"]`);
        if (node) {
          picked.push(node);
        }
      }
      return picked;
    }

    function startBatchActionAnimation(actionName) {
      const animClass = actionAnimClass(actionName);
      if (!animClass) {
        return { hasTargets: false, nodes: [], cleanup: () => { } };
      }
      const nodes = collectBatchActionTileNodes(actionName);
      if (nodes.length <= 0) {
        return { hasTargets: false, nodes: [], cleanup: () => { } };
      }

      for (const node of nodes) {
        node.classList.remove("action-running");
        node.classList.remove(animClass);
      }
      void refs.landGrid.offsetWidth;
      for (const node of nodes) {
        if (!node.isConnected) continue;
        node.classList.add("busy");
        node.classList.add("action-running", animClass);
      }

      return {
        hasTargets: true,
        nodes,
        cleanup: () => {
          for (const node of nodes) {
            node.classList.remove("busy");
            node.classList.remove("action-running");
            node.classList.remove(animClass);
          }
        }
      };
    }

    function resolveHotbarMoreButton() {
      return refs.hotbarSlots?.querySelector("[data-hotbar-more='1']") || null;
    }

    function resolveFirstEmptyHotbarSlotButton() {
      const slotUids = Array.isArray(state.hotbar?.slotUids) ? state.hotbar.slotUids : [];
      if (!refs.hotbarSlots || slotUids.length <= 0) return null;
      for (let i = 0; i < slotUids.length; i += 1) {
        const uid = Number(slotUids[i] || 0);
        if (uid > 0) continue;
        const slotBtn = refs.hotbarSlots.querySelector(
          `.hotbar-slot[data-hotbar-slot="${i}"]`
        );
        if (slotBtn) return slotBtn;
      }
      return refs.hotbarSlots.querySelector(".hotbar-slot.empty[data-hotbar-slot]") || null;
    }

    function resolveHotbarReceiveTarget() {
      const emptySlot = resolveFirstEmptyHotbarSlotButton();
      if (emptySlot) return emptySlot;
      return resolveHotbarMoreButton() || refs.hotbar || null;
    }

    function playHarvestFlyToWarehouse(tileNode, options = {}) {
      const sourceImg = tileNode?.querySelector(".tile-crop img");
      const targetBtn = resolveHotbarReceiveTarget();
      if (!sourceImg || !targetBtn) return;
      const src = String(sourceImg.getAttribute("src") || "").trim();
      if (!src) return;
      const delayMs = Math.max(0, Number(options?.delayMs || 0));

      const start = sourceImg.getBoundingClientRect();
      const tileRect = tileNode.getBoundingClientRect();
      const cropRect = tileNode.querySelector(".tile-crop")?.getBoundingClientRect() || tileRect;
      const end = targetBtn.getBoundingClientRect();
      const sourceWidth = Math.max(24, Number(start.width || 0));
      const sourceHeight = Math.max(24, Number(start.height || 0));
      const sx = start.left + sourceWidth / 2;
      const sy = start.top + sourceHeight / 2;
      const ex = end.left + end.width / 2;
      const ey = end.top + end.height / 2;
      const dx = ex - sx;
      const dy = ey - sy;
      const durationMs = 2200;
      const tileWidth = Math.max(1, Number(tileRect.width || 0));
      const tileHeight = Math.max(1, Number(tileRect.height || 0));
      const popX = Math.max(20, Math.min(42, tileWidth * 0.28));
      const popY = -Math.max(88, Math.min(132, tileHeight * 1.22));
      const dropPaddingX = Math.max(6, sourceWidth * 0.45);
      const dropPaddingTop = Math.max(6, sourceHeight * 0.35);
      const dropPaddingBottom = Math.max(8, sourceHeight * 0.28);
      const dropTargetXRaw = cropRect.left + cropRect.width * 0.58;
      const dropTargetYRaw = cropRect.top + cropRect.height * 0.76;
      const dropTargetX = tileRect.left + Math.max(
        dropPaddingX,
        Math.min(tileWidth - dropPaddingX, dropTargetXRaw - tileRect.left)
      );
      const dropTargetY = tileRect.top + Math.max(
        dropPaddingTop,
        Math.min(tileHeight - dropPaddingBottom, dropTargetYRaw - tileRect.top)
      );
      const dropX = dropTargetX - sx;
      const dropY = dropTargetY - sy;
      const preDropY1 = dropY - Math.max(74, tileHeight * 0.88);
      const preDropY2 = dropY - Math.max(30, tileHeight * 0.36);
      const arcY = Math.min(-96, dy * 0.3 - 94);
      const spinDir = Math.random() < 0.5 ? -1 : 1;
      const rot = (deg) => `${Math.round(Number(deg || 0) * spinDir)}deg`;
      const landedRot = rot(470);

      const ghost = document.createElement("img");
      ghost.className = "harvest-fly-item";
      ghost.src = src;
      ghost.alt = "";
      ghost.style.width = `${sourceWidth}px`;
      ghost.style.height = `${sourceHeight}px`;
      ghost.style.left = `${sx - sourceWidth / 2}px`;
      ghost.style.top = `${sy - sourceHeight / 2}px`;
      ghost.style.opacity = "0";
      document.body.appendChild(ghost);

      const anim = ghost.animate(
        [
          { transform: "translate(0, 0) scale(0.96) rotate(0deg)", opacity: 0, offset: 0 },
          { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 0.96, offset: 0.06 },
          { transform: `translate(${popX}px, ${popY}px) scale(2) rotate(${rot(120)})`, opacity: 1, offset: 0.26 },
          { transform: `translate(${popX + 2}px, ${popY + 16}px) scale(1.96) rotate(${rot(210)})`, opacity: 1, offset: 0.34 },
          { transform: `translate(${dropX - 8}px, ${preDropY1}px) scale(1.7) rotate(${rot(300)})`, opacity: 1, offset: 0.46 },
          { transform: `translate(${dropX - 2}px, ${preDropY2}px) scale(1.42) rotate(${rot(390)})`, opacity: 1, offset: 0.56 },
          { transform: `translate(${dropX}px, ${dropY}px) scale(1.2) rotate(${landedRot})`, opacity: 1, offset: 0.64 },
          { transform: `translate(${dropX}px, ${dropY}px) scale(1.16) rotate(${landedRot})`, opacity: 1, offset: 0.82 },
          { transform: `translate(${dx * 0.45}px, ${dy * 0.34 + arcY}px) scale(1.02) rotate(${landedRot})`, opacity: 1, offset: 0.9 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.24) rotate(${landedRot})`, opacity: 0.24, offset: 1 }
        ],
        {
          duration: durationMs,
          delay: delayMs,
          easing: "cubic-bezier(0.16, 0.74, 0.18, 1)",
          fill: "forwards"
        }
      );

      window.setTimeout(() => {
        targetBtn.classList.add("receive-item");
      }, delayMs + durationMs - 320);
      window.setTimeout(() => {
        targetBtn.classList.remove("receive-item");
      }, delayMs + durationMs - 40);

      anim.onfinish = () => {
        ghost.remove();
      };
      anim.oncancel = () => {
        ghost.remove();
      };
    }

    function resolveExpTrackNode() {
      const fromExpBar = refs.accountExpBar?.parentElement;
      if (fromExpBar?.classList?.contains("account-exp-track")) {
        return fromExpBar;
      }
      return refs.accountCard?.querySelector(".account-exp-track") || null;
    }

    function pulseExpTrack(trackNode) {
      if (!trackNode) return;
      if (trackNode.__expPulseTimer) {
        clearTimeout(trackNode.__expPulseTimer);
      }
      trackNode.classList.add("receive-exp");
      trackNode.__expPulseTimer = window.setTimeout(() => {
        trackNode.classList.remove("receive-exp");
        trackNode.__expPulseTimer = 0;
      }, 420);
    }

    function playHarvestStarToExp(tileNode, options = {}) {
      const targetTrack = resolveExpTrackNode();
      if (!targetTrack) return;
      const sourceNode =
        tileNode?.querySelector(".effect-star") ||
        tileNode?.querySelector(".tile-crop img");
      if (!sourceNode) return;
      const delayMs = Math.max(0, Number(options?.delayMs || 0));

      const start = sourceNode.getBoundingClientRect();
      const end = targetTrack.getBoundingClientRect();
      const sx = start.left + start.width / 2;
      const sy = start.top + start.height / 2;
      const ex = end.left + Math.max(14, Math.min(end.width * 0.28, end.width - 12));
      const ey = end.top + end.height / 2;
      const dx = ex - sx;
      const dy = ey - sy;
      const bendY = Math.min(-62, dy * 0.2 - 48);
      const durationMs = 1640;
      const popX = -30;
      const popY = -32;

      const ghost = document.createElement("span");
      ghost.className = "harvest-exp-star-fly";
      ghost.textContent = "⭐";
      ghost.style.left = `${sx - 11}px`;
      ghost.style.top = `${sy - 11}px`;
      ghost.style.opacity = "0";
      document.body.appendChild(ghost);

      const anim = ghost.animate(
        [
          { transform: "translate(0, 0) scale(0.7) rotate(-10deg)", opacity: 0, offset: 0 },
          { transform: "translate(0, 0) scale(1) rotate(-10deg)", opacity: 0.96, offset: 0.06 },
          { transform: `translate(${popX}px, ${popY}px) scale(2) rotate(-12deg)`, opacity: 1, offset: 0.22 },
          { transform: `translate(${popX}px, ${popY + 4}px) scale(2) rotate(8deg)`, opacity: 1, offset: 0.4 },
          { transform: `translate(${popX + 2}px, ${popY + 6}px) scale(1.92) rotate(3deg)`, opacity: 1, offset: 0.56 },
          { transform: `translate(${dx * 0.44}px, ${dy * 0.35 + bendY}px) scale(1.16) rotate(10deg)`, opacity: 1, offset: 0.82 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.38) rotate(16deg)`, opacity: 0.08, offset: 1 }
        ],
        {
          duration: durationMs,
          delay: delayMs,
          easing: "cubic-bezier(0.14, 0.74, 0.2, 1)",
          fill: "forwards"
        }
      );

      window.setTimeout(() => {
        pulseExpTrack(targetTrack);
      }, delayMs + durationMs - 200);
      anim.onfinish = () => {
        ghost.remove();
      };
      anim.oncancel = () => {
        ghost.remove();
      };
    }

    function playHarvestRewards(tileNodes, { maxTiles = 64, staggerMs = 92 } = {}) {
      const sourceNodes = Array.isArray(tileNodes)
        ? tileNodes.filter((node) => node && node.isConnected)
        : [];
      if (sourceNodes.length <= 0) return;
      const limit = Math.max(1, Math.min(sourceNodes.length, Number(maxTiles || 0) || 1));
      for (let i = 0; i < limit; i += 1) {
        const tileNode = sourceNodes[i];
        const delayMs = i * Math.max(0, Number(staggerMs || 0));
        playHarvestFlyToWarehouse(tileNode, { delayMs });
        playHarvestStarToExp(tileNode, { delayMs: delayMs + 120 });
      }
    }

    function isInsectAction(action) {
      return action === "insect" || action === "help_insect";
    }

    function isWeedAction(action) {
      return action === "weed" || action === "help_weed";
    }

    function isSeedWarehouseRow(row) {
      if (!row || typeof row !== "object") return false;
      const itemId = Number(row.item_id || 0);
      const interactionType = String(row.interaction_type || "").trim().toLowerCase();
      if (Boolean(row.is_seed)) return true;
      if (itemId >= 20000) return true;
      return interactionType.includes("seed");
    }

    function isWarehouseRowAvailable(row) {
      if (!row || typeof row !== "object") return false;
      const countRaw = Number(row.count);
      if (!Number.isFinite(countRaw)) return true;
      return countRaw > 0;
    }

    function resolveWarehouseSeedRows({ onlyAvailable = true } = {}) {
      const rows = Array.isArray(state.hotbar?.items) ? state.hotbar.items : [];
      return rows.filter((row) => {
        if (!isSeedWarehouseRow(row)) return false;
        if (!onlyAvailable) return true;
        return isWarehouseRowAvailable(row);
      });
    }

    function resolveSeedRowByItemId(itemId, { onlyAvailable = true } = {}) {
      const targetItemId = Number(itemId || 0);
      if (targetItemId <= 0) return null;
      const rows = resolveWarehouseSeedRows({ onlyAvailable });
      return rows.find((row) => Number(row?.item_id || 0) === targetItemId) || null;
    }

    function resolveHighlightedHotbarSlot() {
      const selectedBtn = refs.hotbarSlots?.querySelector(".hotbar-slot.selected[data-hotbar-slot]");
      if (selectedBtn) {
        const index = Number(selectedBtn.dataset.hotbarSlot || -1);
        if (Number.isFinite(index) && index >= 0) {
          return {
            index: Math.floor(index),
            slotBtn: selectedBtn
          };
        }
      }
      const indexRaw = Number(state.hotbar?.selectedIndex);
      if (!Number.isFinite(indexRaw) || indexRaw < 0) return null;
      const index = Math.floor(indexRaw);
      const slotBtn = refs.hotbarSlots?.querySelector(`.hotbar-slot[data-hotbar-slot="${index}"]`) || null;
      return { index, slotBtn };
    }

    function resolveHighlightedHotbarRow() {
      const selected = resolveHighlightedHotbarSlot();
      if (!selected) return null;
      const slotUids = Array.isArray(state.hotbar?.slotUids) ? state.hotbar.slotUids : [];
      const uid = Number(slotUids[selected.index] || 0);
      if (uid <= 0) return null;
      const rows = Array.isArray(state.hotbar?.items) ? state.hotbar.items : [];
      const row = rows.find((item) => Number(item?.uid || 0) === uid);
      if (!row) return null;
      return {
        index: selected.index,
        uid,
        row,
        slotBtn: selected.slotBtn
      };
    }

    function resolveHighlightedSeedItemId() {
      const selected = resolveHighlightedHotbarRow();
      if (!selected || !isSeedWarehouseRow(selected.row)) return 0;
      if (!isWarehouseRowAvailable(selected.row)) return 0;
      const itemId = Number(selected.row.item_id || 0);
      return itemId > 0 ? itemId : 0;
    }

    function resolveConfiguredPlantSeedItemId() {
      const mode = String(state.config?.data?.farm?.seed_mode || "").trim().toLowerCase();
      const rows = resolveWarehouseSeedRows({ onlyAvailable: true });
      if (rows.length <= 0) return 0;

      if (mode === "preferred_id") {
        const preferredId = Number(state.config?.data?.farm?.preferred_seed_id || 0);
        if (preferredId <= 0) return 0;
        return resolveSeedRowByItemId(preferredId, { onlyAvailable: true }) ? preferredId : 0;
      }

      const selected = rows.reduce((best, row) => {
        const itemId = Number(row?.item_id || 0);
        const uid = Number(row?.uid || 0);
        if (!best) return row;
        const bestItemId = Number(best?.item_id || 0);
        const bestUid = Number(best?.uid || 0);
        if (itemId > bestItemId) return row;
        if (itemId < bestItemId) return best;
        return uid > bestUid ? row : best;
      }, null);

      const selectedItemId = Number(selected?.item_id || 0);
      return selectedItemId > 0 ? selectedItemId : 0;
    }

    function resolvePlantVisualSeedItemId(seedItemId = 0) {
      const explicitSeedItemId = Number(seedItemId || 0);
      if (explicitSeedItemId > 0) {
        const explicitRow = resolveSeedRowByItemId(explicitSeedItemId, { onlyAvailable: true });
        if (explicitRow) return explicitSeedItemId;
      }
      return resolveConfiguredPlantSeedItemId();
    }

    function playInsectDropAndSmoke(tileNode, options = {}) {
      const sourceSelector = String(options?.sourceSelector || ".effect-insect").trim() || ".effect-insect";
      const sourceNode = tileNode?.querySelector(sourceSelector);
      if (!sourceNode) return;
      const delayMs = Math.max(0, Number(options?.delayMs || 0));
      const icon = String(options?.icon || "🐛");
      const itemClass = String(options?.itemClass || "insect-fall-item").trim() || "insect-fall-item";
      const itemSize = Math.max(20, Number(options?.itemSize || 28));
      const iconFontSize = Math.max(18, Number(options?.fontSize || 26));

      const start = sourceNode.getBoundingClientRect();
      const sx = start.left + start.width / 2;
      const sy = start.top + start.height / 2;
      const popX = 24;
      const popY = -96;
      const dropX = 34;
      const dropY = 22;
      const durationMs = 2580;
      const disappearOffset = 0.945;
      const smokeLeadMs = 1000;
      const spinDir = Math.random() < 0.5 ? -1 : 1;
      const rot = (deg) => `${Math.round(Number(deg || 0) * spinDir)}deg`;
      const landedRot = rot(520);

      const bug = document.createElement("span");
      bug.className = itemClass;
      bug.textContent = icon;
      bug.style.width = `${itemSize}px`;
      bug.style.height = `${itemSize}px`;
      bug.style.fontSize = `${iconFontSize}px`;
      bug.style.left = `${sx - itemSize / 2}px`;
      bug.style.top = `${sy - itemSize / 2}px`;
      bug.style.opacity = "0";
      document.body.appendChild(bug);

      const bugAnim = bug.animate(
        [
          { transform: "translate(0, 0) scale(0.9) rotate(0deg)", opacity: 0, offset: 0 },
          { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 0.96, offset: 0.048 },
          { transform: `translate(${popX}px, ${popY}px) scale(1.95) rotate(${rot(120)})`, opacity: 1, offset: 0.155 },
          { transform: `translate(${popX + 1}px, ${popY + 12}px) scale(1.9) rotate(${rot(210)})`, opacity: 1, offset: 0.214 },
          { transform: `translate(${dropX - 8}px, -28px) scale(1.56) rotate(${rot(320)})`, opacity: 1, offset: 0.309 },
          { transform: `translate(${dropX - 2}px, 6px) scale(1.28) rotate(${rot(430)})`, opacity: 1, offset: 0.381 },
          { transform: `translate(${dropX}px, ${dropY}px) scale(1.12) rotate(${landedRot})`, opacity: 1, offset: 0.44 },
          { transform: `translate(${dropX}px, ${dropY}px) scale(1.08) rotate(${landedRot})`, opacity: 1, offset: 0.86 },
          { transform: `translate(${dropX}px, ${dropY}px) scale(1.02) rotate(${landedRot})`, opacity: 1, offset: disappearOffset - 0.005 },
          { transform: `translate(${dropX}px, ${dropY}px) scale(1.02) rotate(${landedRot})`, opacity: 0, offset: disappearOffset },
          { transform: `translate(${dropX}px, ${dropY}px) scale(0.88) rotate(${landedRot})`, opacity: 0, offset: 1 }
        ],
        {
          duration: durationMs,
          delay: delayMs,
          easing: "cubic-bezier(0.16, 0.74, 0.2, 1)",
          fill: "forwards"
        }
      );

      const smokeTimer = window.setTimeout(() => {
        const smoke = document.createElement("span");
        smoke.className = "insect-fall-smoke";
        smoke.style.left = `${sx + dropX - 20}px`;
        smoke.style.top = `${sy + dropY - 13}px`;
        smoke.style.opacity = "0.98";
        document.body.appendChild(smoke);

        const smokeAnim = smoke.animate(
          [
            { transform: "translate(0, 0) scale(1)", opacity: 0.96, offset: 0 },
            { transform: "translate(-2px, -6px) scale(1.18)", opacity: 0.84, offset: 0.34 },
            { transform: "translate(3px, -14px) scale(1.36)", opacity: 0.48, offset: 0.72 },
            { transform: "translate(6px, -20px) scale(1.52)", opacity: 0, offset: 1 }
          ],
          { duration: 520, easing: "cubic-bezier(0.18, 0.76, 0.28, 1)", fill: "forwards" }
        );
        smokeAnim.onfinish = () => {
          smoke.remove();
        };
        smokeAnim.oncancel = () => {
          smoke.remove();
        };
      }, delayMs + Math.max(0, Math.round(durationMs * disappearOffset) - smokeLeadMs));

      bugAnim.onfinish = () => {
        clearTimeout(smokeTimer);
        bug.remove();
      };
      bugAnim.oncancel = () => {
        clearTimeout(smokeTimer);
        bug.remove();
      };
    }

    function playInsectEliminateEffects(tileNodes, { maxTiles = 12, staggerMs = 72 } = {}) {
      const sourceNodes = Array.isArray(tileNodes)
        ? tileNodes.filter((node) => node && node.isConnected)
        : [];
      if (sourceNodes.length <= 0) return;
      const limit = Math.max(1, Math.min(sourceNodes.length, Number(maxTiles || 0) || 1));
      for (let i = 0; i < limit; i += 1) {
        const tileNode = sourceNodes[i];
        const delayMs = i * Math.max(0, Number(staggerMs || 0));
        playInsectDropAndSmoke(tileNode, { delayMs });
      }
    }

    function playWeedEliminateEffects(tileNodes, { maxTiles = 12, staggerMs = 72 } = {}) {
      const sourceNodes = Array.isArray(tileNodes)
        ? tileNodes.filter((node) => node && node.isConnected)
        : [];
      if (sourceNodes.length <= 0) return;
      const limit = Math.max(1, Math.min(sourceNodes.length, Number(maxTiles || 0) || 1));
      for (let i = 0; i < limit; i += 1) {
        const tileNode = sourceNodes[i];
        const delayMs = i * Math.max(0, Number(staggerMs || 0));
        playInsectDropAndSmoke(tileNode, {
          delayMs,
          sourceSelector: ".effect-weed",
          icon: "🌿",
          itemClass: "weed-fall-item",
          itemSize: 32,
          fontSize: 30
        });
      }
    }

    function resolveSelectedSeedAsset(seedItemId = 0) {
      const targetSeedItemId = resolvePlantVisualSeedItemId(seedItemId);
      const seedRow = resolveSeedRowByItemId(targetSeedItemId, { onlyAvailable: true });
      const slotUids = Array.isArray(state.hotbar?.slotUids) ? state.hotbar.slotUids : [];
      const seedUid = Number(seedRow?.uid || 0);
      const seedSlotIndex = seedUid > 0 ? slotUids.findIndex((uid) => Number(uid || 0) === seedUid) : -1;
      const seedSlotBtn = seedSlotIndex >= 0
        ? refs.hotbarSlots?.querySelector(`.hotbar-slot[data-hotbar-slot="${seedSlotIndex}"]`) || null
        : null;
      const seedSlotImg = seedSlotBtn?.querySelector(".hotbar-item-img") || null;

      let src = String(seedSlotImg?.getAttribute("src") || "").trim();
      if (!src) {
        src = String(seedRow?.seed_image || seedRow?.image || "").trim();
      }

      if (!src) {
        return null;
      }

      const sourceNode = seedSlotImg || seedSlotBtn || resolveHotbarMoreButton() || refs.hotbar;
      const sourceRectRaw = sourceNode?.getBoundingClientRect?.() || null;
      const sourceRect =
        sourceRectRaw && sourceRectRaw.width > 0 && sourceRectRaw.height > 0
          ? sourceRectRaw
          : {
            left: Math.round(window.innerWidth * 0.5 - 18),
            top: Math.round(window.innerHeight - 74),
            width: 36,
            height: 36
          };
      return { src, sourceRect, itemId: targetSeedItemId };
    }

    function setPlantPreviewSeeding(tileNode, enabled, seedSrc = "") {
      if (!tileNode || !tileNode.isConnected) return;
      const imgEl = tileNode.querySelector(".tile-crop img");
      if (!imgEl) return;
      if (enabled) {
        if (!plantPreviewSnapshots.has(tileNode)) {
          plantPreviewSnapshots.set(tileNode, {
            src: String(imgEl.getAttribute("src") || ""),
            alt: String(imgEl.getAttribute("alt") || ""),
            hidden: imgEl.classList.contains("is-hidden"),
            withered: imgEl.classList.contains("withered")
          });
        }
        if (seedSrc) {
          imgEl.setAttribute("src", seedSrc);
        }
        imgEl.classList.add("is-hidden");
        imgEl.classList.remove("withered");
        imgEl.setAttribute("alt", "seed-crop");
        tileNode.classList.add("plant-preview-pending");
        tileNode.classList.remove("plant-preview-seeding");
        tileNode.classList.remove("plant-preview-bounce");
        return;
      }

      tileNode.classList.remove("plant-preview-pending");
      tileNode.classList.remove("plant-preview-seeding");
      tileNode.classList.remove("plant-preview-bounce");
      const snapshot = plantPreviewSnapshots.get(tileNode);
      if (!snapshot) return;
      if (snapshot.src) {
        imgEl.setAttribute("src", snapshot.src);
      } else {
        imgEl.removeAttribute("src");
      }
      if (snapshot.alt) {
        imgEl.setAttribute("alt", snapshot.alt);
      } else {
        imgEl.removeAttribute("alt");
      }
      imgEl.classList.toggle("is-hidden", Boolean(snapshot.hidden));
      imgEl.classList.toggle("withered", Boolean(snapshot.withered));
      plantPreviewSnapshots.delete(tileNode);
    }

    function revealPlantPreviewSeed(tileNode) {
      if (!tileNode || !tileNode.isConnected) return;
      if (!plantPreviewSnapshots.has(tileNode)) return;
      const imgEl = tileNode.querySelector(".tile-crop img");
      if (!imgEl) return;
      imgEl.classList.remove("is-hidden");
      imgEl.classList.remove("withered");
      imgEl.setAttribute("alt", "seed-crop");
      tileNode.classList.remove("plant-preview-pending");
      tileNode.classList.add("plant-preview-seeding");
    }

    function setPlantPreviewSeedingForTiles(tileNodes, enabled, seedSrc = "") {
      const nodes = Array.isArray(tileNodes) ? tileNodes : [];
      for (const node of nodes) {
        setPlantPreviewSeeding(node, enabled, seedSrc);
      }
    }

    function clearPlantPreviewSnapshot(tileNode) {
      if (!tileNode) return;
      tileNode.classList.remove("plant-preview-pending");
      tileNode.classList.remove("plant-preview-seeding");
      tileNode.classList.remove("plant-preview-bounce");
      plantPreviewSnapshots.delete(tileNode);
    }

    function clearPlantPreviewSnapshotsForTiles(tileNodes) {
      const nodes = Array.isArray(tileNodes) ? tileNodes : [];
      for (const node of nodes) {
        clearPlantPreviewSnapshot(node);
      }
    }

    function playPlantSeedFlyToTile(tileNode, options = {}) {
      const seedSrc = String(options?.seedSrc || "").trim();
      if (!seedSrc || !tileNode?.isConnected) return;
      const sourceRect = options?.sourceRect;
      if (!sourceRect) return;
      const delayMs = Math.max(0, Number(options?.delayMs || 0));
      const sourceOffsetX = Number(options?.sourceOffsetX || 0);

      const targetRect =
        tileNode.querySelector(".tile-crop")?.getBoundingClientRect() ||
        tileNode.getBoundingClientRect();
      const sx = sourceRect.left + sourceRect.width * (0.5 + sourceOffsetX);
      const sy = sourceRect.top + sourceRect.height * 0.5;
      const tx = targetRect.left + targetRect.width * 0.5;
      const ty = targetRect.top + targetRect.height * 0.58;
      const dx = tx - sx;
      const dy = ty - sy;
      const arcY = -Math.max(118, Math.min(226, Math.abs(dy) * 0.28 + 128));
      const spinDir = Math.random() < 0.5 ? -1 : 1;
      const travelRot = `${Math.round((24 + Math.random() * 12) * spinDir)}deg`;
      const settleRot = `${Math.round((10 + Math.random() * 8) * spinDir)}deg`;

      const ghost = document.createElement("img");
      ghost.className = "plant-seed-fly-item";
      ghost.src = seedSrc;
      ghost.alt = "";
      ghost.style.left = `${sx - 20}px`;
      ghost.style.top = `${sy - 20}px`;
      ghost.style.opacity = "0";
      document.body.appendChild(ghost);

      const anim = ghost.animate(
        [
          { transform: "translate(0, 0) scale(0.78) rotate(0deg)", opacity: 0, offset: 0 },
          { transform: "translate(0, 0) scale(0.92) rotate(0deg)", opacity: 0.98, offset: 0.07 },
          { transform: `translate(${dx * 0.44}px, ${dy * 0.28 + arcY}px) scale(1.02) rotate(${travelRot})`, opacity: 1, offset: 0.5 },
          { transform: `translate(${dx}px, ${dy}px) scale(1.04) rotate(${settleRot})`, opacity: 1, offset: 0.7 },
          { transform: `translate(${dx}px, ${dy}px) scale(1.04) rotate(0deg)`, opacity: 1, offset: 0.9 },
          { transform: `translate(${dx}px, ${dy + 3}px) scale(0.78) rotate(0deg)`, opacity: 0, offset: 1 }
        ],
        {
          duration: PLANT_SEED_FLY_DURATION_MS,
          delay: delayMs,
          easing: "cubic-bezier(0.16, 0.72, 0.2, 1)",
          fill: "forwards"
        }
      );
      anim.onfinish = () => {
        ghost.remove();
      };
      anim.oncancel = () => {
        ghost.remove();
      };
    }

    function playPlantSeedingEffects(tileNodes, { maxTiles = 64, staggerMs = 138, seedItemId = 0 } = {}) {
      const sourceNodes = Array.isArray(tileNodes)
        ? tileNodes.filter((node) => node && node.isConnected)
        : [];
      if (sourceNodes.length <= 0) return null;
      const seedAsset = resolveSelectedSeedAsset(seedItemId);
      if (!seedAsset?.src) return null;

      const limit = Math.max(1, Math.min(sourceNodes.length, Number(maxTiles || 0) || 1));
      const playNodes = sourceNodes.slice(0, limit);
      const revealAtMs = Math.round(PLANT_SEED_FLY_DURATION_MS * 0.7);
      for (let i = 0; i < playNodes.length; i += 1) {
        const tileNode = playNodes[i];
        const delayMs = i * Math.max(0, Number(staggerMs || 0));
        const sourceOffsetX = Math.max(-0.08, Math.min(0.08, ((i % 5) - 2) * 0.018));
        setPlantPreviewSeeding(tileNode, true, seedAsset.src);
        playPlantSeedFlyToTile(tileNode, {
          delayMs,
          seedSrc: seedAsset.src,
          sourceRect: seedAsset.sourceRect,
          sourceOffsetX
        });
        window.setTimeout(() => {
          revealPlantPreviewSeed(tileNode);
        }, delayMs + revealAtMs);
        window.setTimeout(() => {
          clearPlantPreviewSnapshot(tileNode);
        }, delayMs + PLANT_SEED_FLY_DURATION_MS + 140);
      }
      return {
        seedSrc: seedAsset.src,
        nodes: playNodes
      };
    }

    function setHarvestPreviewHidden(tileNode, hidden) {
      if (!tileNode || !tileNode.isConnected) return;
      tileNode.classList.toggle("harvest-preview-hidden", Boolean(hidden));
    }

    function setHarvestPreviewHiddenForTiles(tileNodes, hidden) {
      const nodes = Array.isArray(tileNodes) ? tileNodes : [];
      for (const node of nodes) {
        setHarvestPreviewHidden(node, hidden);
      }
    }

    function setInsectPreviewHidden(tileNode, hidden) {
      if (!tileNode || !tileNode.isConnected) return;
      tileNode.classList.toggle("insect-preview-hidden", Boolean(hidden));
    }

    function setInsectPreviewHiddenForTiles(tileNodes, hidden) {
      const nodes = Array.isArray(tileNodes) ? tileNodes : [];
      for (const node of nodes) {
        setInsectPreviewHidden(node, hidden);
      }
    }

    function setWeedPreviewHidden(tileNode, hidden) {
      if (!tileNode || !tileNode.isConnected) return;
      tileNode.classList.toggle("weed-preview-hidden", Boolean(hidden));
    }

    function setWeedPreviewHiddenForTiles(tileNodes, hidden) {
      const nodes = Array.isArray(tileNodes) ? tileNodes : [];
      for (const node of nodes) {
        setWeedPreviewHidden(node, hidden);
      }
    }

    function startActionVisualPlayback(actionName, options = {}) {
      const normalizedAction = normalizeActionName(actionName);
      const batchAnimation = startBatchActionAnimation(normalizedAction);
      const plantSeedItemId = normalizedAction === "plant"
        ? Math.max(0, Number(options?.seedItemId || 0))
        : 0;
      const plantTargets = normalizedAction === "plant"
        ? collectBatchActionTileNodes(normalizedAction)
        : [];
      const playPlantNow = normalizedAction === "plant" && plantTargets.length > 0;
      const plantBatchCount = Math.max(1, Number(plantTargets.length || 0));
      const playHarvestNow = normalizedAction === "harvest" && batchAnimation.hasTargets;
      const playInsectNow = isInsectAction(normalizedAction) && batchAnimation.hasTargets;
      const playWeedNow = isWeedAction(normalizedAction) && batchAnimation.hasTargets;
      const playRemoveNow = normalizedAction === "remove" && batchAnimation.hasTargets;
      const harvestBatchCount = Math.max(1, Number(batchAnimation.nodes?.length || 0));
      const hasVisuals = playPlantNow || batchAnimation.hasTargets;

      if (hasVisuals && options.playSfx) {
        unlockSfxAudio();
        playActionSfx(normalizedAction, { batch: true });
      }

      if (playPlantNow) {
        playPlantSeedingEffects(plantTargets, {
          maxTiles: plantBatchCount,
          staggerMs: 60,
          seedItemId: plantSeedItemId
        });
      }
      if (playHarvestNow) {
        setHarvestPreviewHiddenForTiles(batchAnimation.nodes, true);
        playHarvestRewards(batchAnimation.nodes, {
          maxTiles: harvestBatchCount,
          staggerMs: 0
        });
      }
      if (playInsectNow) {
        setInsectPreviewHiddenForTiles(batchAnimation.nodes, true);
        playInsectEliminateEffects(batchAnimation.nodes, {
          maxTiles: 12,
          staggerMs: 58
        });
      }
      if (playWeedNow) {
        setWeedPreviewHiddenForTiles(batchAnimation.nodes, true);
        playWeedEliminateEffects(batchAnimation.nodes, {
          maxTiles: 12,
          staggerMs: 58
        });
      }

      let minDelayMs = 0;
      if (playPlantNow) {
        minDelayMs = 420;
      }
      if (batchAnimation.hasTargets) {
        minDelayMs = Math.max(
          minDelayMs,
          playRemoveNow ? REMOVE_ACTION_MIN_MS : 320
        );
      }

      return {
        normalizedAction,
        hasVisuals,
        plantTargets,
        minDelayMs,
        cleanup: () => {
          if (playHarvestNow) {
            setHarvestPreviewHiddenForTiles(batchAnimation.nodes, false);
          }
          if (playInsectNow) {
            setInsectPreviewHiddenForTiles(batchAnimation.nodes, false);
          }
          if (playWeedNow) {
            setWeedPreviewHiddenForTiles(batchAnimation.nodes, false);
          }
          batchAnimation.cleanup();
        }
      };
    }

    async function drainExternalActionPlaybackQueue() {
      if (externalActionPlaybackRunning) return;
      externalActionPlaybackRunning = true;
      try {
        while (pendingExternalActionOps.length > 0) {
          if (state.actionBusy) {
            await waitMs(EXTERNAL_ACTION_WAIT_MS);
            continue;
          }
          const queueEntry = pendingExternalActionOps.shift();
          const actionName = String(
            (queueEntry && typeof queueEntry === "object")
              ? queueEntry.action
              : queueEntry
          ).trim();
          if (!actionName) continue;
          const plantSeedItemId = actionName === "plant"
            ? Math.max(
              0,
              Number(
                (queueEntry && typeof queueEntry === "object")
                  ? (queueEntry.seedItemId || queueEntry.itemId || 0)
                  : 0
              )
            )
            : 0;
          const playback = startActionVisualPlayback(actionName, {
            playSfx: true,
            seedItemId: plantSeedItemId
          });
          if (!playback.hasVisuals) {
            playback.cleanup();
            continue;
          }
          state.actionBusy = true;
          try {
            await waitMs(playback.minDelayMs);
          } finally {
            playback.cleanup();
            state.actionBusy = false;
          }
        }
      } finally {
        externalActionPlaybackRunning = false;
        if (pendingExternalActionOps.length > 0) {
          void drainExternalActionPlaybackQueue();
        }
      }
    }

    function onExternalActionEvent(actionEvent) {
      const row = actionEvent && typeof actionEvent === "object" ? actionEvent : null;
      if (!row) return;
      const source = String(row.source || "").trim().toLowerCase();
      if (source && source !== "automation") return;
      const seq = Math.max(0, Math.round(Number(row.seq || 0)));
      if (seq > 0 && seq <= pendingExternalActionSeq) return;
      if (seq > 0) {
        pendingExternalActionSeq = seq;
      }
      const count = Math.max(0, Math.round(Number(row.count || 0)));
      const effective = row.effective !== undefined ? Boolean(row.effective) : count > 0;
      if (!effective || count <= 0) return;
      const actionName = normalizeActionName(row.op);
      if (!actionName) return;
      pendingExternalActionOps.push({
        action: actionName,
        seedItemId: actionName === "plant" ? Math.max(0, Math.round(Number(row.item_id || 0))) : 0
      });
      if (pendingExternalActionOps.length > EXTERNAL_ACTION_QUEUE_LIMIT) {
        pendingExternalActionOps = pendingExternalActionOps.slice(
          pendingExternalActionOps.length - EXTERNAL_ACTION_QUEUE_LIMIT
        );
      }
      void drainExternalActionPlaybackQueue();
    }

    async function runLandAction(tileNode, options = {}) {
      if (!tileNode) return;
      const forcedAction = String(options?.forcedAction || "").trim();
      const seedItemId = Math.max(0, Number(options?.seedItemId || 0));
      if (state.actionBusy) {
        if (!forcedAction) {
          queuePendingLandAction(tileNode);
        }
        return;
      }
      if (!forcedAction && tileNode.dataset.actionable !== "1") return;

      const action = forcedAction || String(tileNode.dataset.action || "");
      const landId = Number(tileNode.dataset.landId || 0);
      if (!action || landId <= 0) return;

      const gid = Number(state.currentGid || state.account?.gid || 0);
      if (gid <= 0) return;

      unlockSfxAudio();
      playActionSfx(action, { batch: false });
      const animClass = actionAnimClass(action);
      const playPlantNow = action === "plant";
      const playHarvestNow = action === "harvest";
      const playInsectNow = isInsectAction(action);
      const playWeedNow = isWeedAction(action);
      const effectiveSeedItemId = playPlantNow
        ? Math.max(0, Number(seedItemId || 0))
        : 0;
      state.actionBusy = true;
      if (animClass) {
        tileNode.classList.remove(animClass);
        void tileNode.offsetWidth;
        tileNode.classList.add("action-running", animClass);
      }
      if (!playPlantNow) {
        tileNode.classList.add("busy");
      }
      if (playPlantNow) {
        playPlantSeedingEffects([tileNode], {
          maxTiles: 1,
          staggerMs: 0,
          seedItemId: effectiveSeedItemId
        });
      }
      if (playHarvestNow) {
        setHarvestPreviewHidden(tileNode, true);
        playHarvestRewards([tileNode], { maxTiles: 1, staggerMs: 0 });
      }
      if (playInsectNow) {
        setInsectPreviewHidden(tileNode, true);
        playInsectEliminateEffects([tileNode], { maxTiles: 1, staggerMs: 0 });
      }
      if (playWeedNow) {
        setWeedPreviewHidden(tileNode, true);
        playWeedEliminateEffects([tileNode], { maxTiles: 1, staggerMs: 0 });
      }
      try {
        const actionPayload = {
          action,
          gid,
          land_id: landId
        };
        if (action === "plant" && effectiveSeedItemId > 0) {
          actionPayload.seed_item_id = effectiveSeedItemId;
        }
        const requestTask = reqFn("/api/farm/action", {
          method: "POST",
          body: JSON.stringify(actionPayload)
        });
        let result;
        if (action === "remove") {
          [result] = await Promise.all([requestTask, waitMs(REMOVE_ACTION_MIN_MS)]);
        } else {
          result = await requestTask;
        }
        const actionEvent = normalizeActionEvent(result?.action_event);
        if (actionEvent && typeof pushAutomationPanelActionEvent === "function") {
          pushAutomationPanelActionEvent(actionEvent);
        }
        if (result?.farm) {
          state.farm = result.farm;
          renderFarmFn();
        } else {
          await loadFarmFn(false);
        }

        if (gid === Number(state.account?.gid || 0)) {
          const accountRes = await reqFn("/api/account");
          state.runtime = accountRes.runtime || state.runtime;
          state.account = accountRes.account || state.account;
          renderRuntimeAndAccountFn();
        }
        if (state.hotbar.visible) {
          await refreshHotbarItemsFn({ silent: true, force: true });
        }
      } catch (error) {
        if (playPlantNow) {
          setPlantPreviewSeeding(tileNode, false);
        }
        if (playHarvestNow) {
          setHarvestPreviewHidden(tileNode, false);
        }
        if (playInsectNow) {
          setInsectPreviewHidden(tileNode, false);
        }
        if (playWeedNow) {
          setWeedPreviewHidden(tileNode, false);
        }
        const message = String(error?.message || "操作失败，请稍后重试").trim();
        showToastFn(message || "操作失败，请稍后重试", "error");
      } finally {
        state.actionBusy = false;
        tileNode.classList.remove("busy");
        tileNode.classList.remove("action-running");
        if (animClass) {
          tileNode.classList.remove(animClass);
        }
        const pendingNode = takePendingLandActionNode();
        if (pendingNode) {
          void runLandAction(pendingNode);
        }
      }
    }

    async function runBatchFarmAction(action) {
      const actionName = String(action || "").trim();
      if (!actionName || state.actionBusy) return;
      pendingLandActions = [];
      const gid = Number(state.currentGid || state.account?.gid || 0);
      if (gid <= 0) return;

      unlockSfxAudio();
      playActionSfx(actionName, { batch: true });
      let playback = {
        normalizedAction: normalizeActionName(actionName),
        hasVisuals: false,
        plantTargets: [],
        minDelayMs: 0,
        cleanup: () => {}
      };
      let playRemoveNow = false;
      state.actionBusy = true;
      try {
        let plantSeedItemId = 0;
        if (actionName === "plant") {
          const buyResult = await reqFn("/api/farm/action", {
            method: "POST",
            body: JSON.stringify({
              action: "buy_seed",
              gid
            })
          });
          const buyActionEvent = normalizeActionEvent(buyResult?.action_event);
          if (buyActionEvent && typeof pushAutomationPanelActionEvent === "function") {
            pushAutomationPanelActionEvent(buyActionEvent);
          }
          plantSeedItemId = Math.max(0, Number(buyActionEvent?.item_id || 0));
          if (state.hotbar.visible) {
            await refreshHotbarItemsFn({ silent: true, force: true });
          }
        }
        playback = startActionVisualPlayback(actionName, {
          playSfx: false,
          seedItemId: plantSeedItemId
        });
        playRemoveNow = playback.normalizedAction === "remove" && playback.hasVisuals;
        const actionPayload = {
          action: actionName,
          gid
        };
        const requestTask = reqFn("/api/farm/action", {
          method: "POST",
          body: JSON.stringify(actionPayload)
        });
        let result;
        if (playback.hasVisuals) {
          const minDelayMs = playRemoveNow ? REMOVE_ACTION_MIN_MS : 320;
          [result] = await Promise.all([requestTask, waitMs(minDelayMs)]);
        } else {
          result = await requestTask;
        }
        const actionEvent = normalizeActionEvent(result?.action_event);
        if (actionEvent && typeof pushAutomationPanelActionEvent === "function") {
          pushAutomationPanelActionEvent(actionEvent);
        }
        if (result?.farm) {
          state.farm = result.farm;
          renderFarmFn();
        } else {
          await loadFarmFn(false);
        }
        if (gid === Number(state.account?.gid || 0)) {
          const accountRes = await reqFn("/api/account");
          state.runtime = accountRes.runtime || state.runtime;
          state.account = accountRes.account || state.account;
          renderRuntimeAndAccountFn();
        }
        if (state.hotbar.visible) {
          await refreshHotbarItemsFn({ silent: true, force: true });
        }
      } catch (error) {
        if (playback.normalizedAction === "plant" && playback.hasVisuals) {
          setPlantPreviewSeedingForTiles(playback.plantTargets, false);
        }
        const message = String(error?.message || "操作失败，请稍后重试").trim();
        showToastFn(message || "操作失败，请稍后重试", "error");
      } finally {
        playback.cleanup();
        state.actionBusy = false;
      }
    }

    return {
      runLandAction,
      runBatchFarmAction,
      onExternalActionEvent
    };
  };
})();
