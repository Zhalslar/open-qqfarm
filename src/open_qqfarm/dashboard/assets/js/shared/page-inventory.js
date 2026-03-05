(function () {
  const shared = (window.openQQFarmShared = window.openQQFarmShared || {});

  shared.createPageInventory = function createPageInventory({
    refs,
    state,
    HOTBAR_SLOT_COUNT,
    clampValue,
    escapeHtml,
    showToast,
    request,
    openPanel
  }) {
    const reqFn = typeof request === "function" ? request : window.req;
    const toast = typeof showToast === "function" ? showToast : () => {};
    const openPanelFn = typeof openPanel === "function" ? openPanel : () => {};

    function findInventorySlotButtonInPanel(scope, index) {
      if (!refs.panelBody) return null;
      const slotScope = scope === "hotbar" ? "hotbar" : "bag";
      const slotIndex = Math.max(0, Math.floor(Number(index || 0)));
      return refs.panelBody.querySelector(
        `[data-inv-scope="${slotScope}"][data-inv-slot="${slotIndex}"]`
      );
    }

    function readInventorySlotFromButton(slotBtn) {
      if (!slotBtn) return null;
      const scope = slotBtn.dataset.invScope === "hotbar" ? "hotbar" : "bag";
      const indexRaw = Number(slotBtn.dataset.invSlot || 0);
      if (!Number.isFinite(indexRaw)) return null;
      const maxIndex = scope === "hotbar"
        ? HOTBAR_SLOT_COUNT - 1
        : Math.max(0, (Array.isArray(state.hotbar.bagSlotUids) ? state.hotbar.bagSlotUids.length : 32) - 1);
      return { scope, index: clampValue(Math.floor(indexRaw), 0, maxIndex) };
    }

    function clearInventoryDragVisuals() {
      if (refs.panelBody) {
        refs.panelBody.querySelectorAll(".bag-slot.drag-source, .bag-slot.drag-over").forEach((node) => {
          node.classList.remove("drag-source", "drag-over");
        });
      }
      if (refs.hotbarSlots) {
        refs.hotbarSlots.querySelectorAll(".hotbar-slot.drag-source, .hotbar-slot.drag-over").forEach((node) => {
          node.classList.remove("drag-source", "drag-over");
        });
      }
    }

    function clearInventoryDragState() {
      const previewEl = state.hotbar.drag.previewEl;
      if (previewEl && previewEl.parentElement) {
        previewEl.remove();
      }
      state.hotbar.drag.active = false;
      state.hotbar.drag.source = null;
      state.hotbar.drag.hover = null;
      state.hotbar.drag.justDropped = false;
      state.hotbar.drag.previewEl = null;
      clearInventoryDragVisuals();
    }

    function playInventoryMoveAnimation(fromEl, toEl) {
      if (!fromEl || !toEl || fromEl === toEl) return;
      const sourceImg = fromEl.querySelector("img");
      if (!sourceImg || !sourceImg.getAttribute("src")) return;
      const fromRect = sourceImg.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();
      if (fromRect.width <= 0 || fromRect.height <= 0 || toRect.width <= 0 || toRect.height <= 0) return;

      const ghost = document.createElement("div");
      ghost.className = "slot-move-ghost";
      ghost.innerHTML = `<img src="${escapeHtml(sourceImg.getAttribute("src") || "")}" alt="" />`;
      ghost.style.left = `${fromRect.left}px`;
      ghost.style.top = `${fromRect.top}px`;
      ghost.style.width = `${fromRect.width}px`;
      ghost.style.height = `${fromRect.height}px`;
      document.body.appendChild(ghost);

      const fromCx = fromRect.left + fromRect.width / 2;
      const fromCy = fromRect.top + fromRect.height / 2;
      const toCx = toRect.left + toRect.width / 2;
      const toCy = toRect.top + toRect.height / 2;
      const dx = toCx - fromCx;
      const dy = toCy - fromCy;

      const anim = ghost.animate(
        [
          { transform: "translate(0, 0) scale(1)", opacity: 0.96 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.88)`, opacity: 0.22 }
        ],
        { duration: 260, easing: "cubic-bezier(0.22, 0.72, 0.2, 1)", fill: "forwards" }
      );
      anim.onfinish = () => ghost.remove();
      anim.oncancel = () => ghost.remove();
    }

    function hotbarItemMap() {
      const map = new Map();
      for (const row of state.hotbar.items || []) {
        const uid = Number(row?.uid || 0);
        if (uid > 0) {
          map.set(uid, row);
        }
      }
      return map;
    }

    function mergeWarehouseRows(rows) {
      const source = Array.isArray(rows) ? rows : [];
      const grouped = new Map();
      for (const row of source) {
        const uid = Number(row?.uid || 0);
        if (uid <= 0) continue;
        const itemId = Number(row?.item_id || 0);
        const key = itemId > 0 ? `item:${itemId}` : `uid:${uid}`;
        const countRaw = Number(row?.count || 0);
        const count = Number.isFinite(countRaw) ? Math.max(0, countRaw) : 0;
        const existing = grouped.get(key);
        if (!existing) {
          grouped.set(key, {
            ...row,
            uid,
            item_id: itemId,
            count
          });
          continue;
        }
        existing.count = Math.max(0, Number(existing.count || 0)) + count;
        if (!existing.seed_image && row?.seed_image) {
          existing.seed_image = row.seed_image;
        }
        if (!existing.image && row?.image) {
          existing.image = row.image;
        }
        if (!existing.name && row?.name) {
          existing.name = row.name;
        }
        if (!existing.desc && row?.desc) {
          existing.desc = row.desc;
        }
        if (!existing.effect_desc && row?.effect_desc) {
          existing.effect_desc = row.effect_desc;
        }
        const existingUid = Number(existing.uid || 0);
        if (existingUid <= 0 || uid < existingUid) {
          existing.uid = uid;
        }
      }
      return Array.from(grouped.values());
    }

    function ensureHotbarSlots() {
      const slots = Array.isArray(state.hotbar.slotUids)
        ? state.hotbar.slotUids.slice(0, HOTBAR_SLOT_COUNT)
        : [];
      while (slots.length < HOTBAR_SLOT_COUNT) {
        slots.push(0);
      }
      state.hotbar.slotUids = slots;
      return slots;
    }

    function ensureBagSlots(slotCount = 32) {
      const normalizedCount = Math.max(
        32,
        Math.ceil(Math.max(0, Number(slotCount || 0)) / 8) * 8
      );
      const slots = Array.isArray(state.hotbar.bagSlotUids)
        ? state.hotbar.bagSlotUids.slice(0, normalizedCount)
        : [];
      while (slots.length < normalizedCount) {
        slots.push(0);
      }
      state.hotbar.bagSlotUids = slots;
      return slots;
    }

    function clearCarryState() {
      state.hotbar.carryUid = 0;
      state.hotbar.carryFrom = null;
    }

    function normalizeHotbarSelectedIndex(raw, { allowNone = false } = {}) {
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        return allowNone ? -1 : 0;
      }
      const index = Math.floor(value);
      if (index < 0 || index >= HOTBAR_SLOT_COUNT) {
        if (allowNone) return -1;
        return clampValue(index, 0, HOTBAR_SLOT_COUNT - 1);
      }
      return index;
    }

    function resolveHotbarHighlightIndex() {
      const carryFrom = normalizeInventorySlotRef(state.hotbar.carryFrom);
      if (carryFrom && carryFrom.scope === "hotbar") {
        return carryFrom.index;
      }
      const focusSlot = normalizeInventorySlotRef(state.hotbar.focusSlot);
      if (focusSlot && focusSlot.scope === "hotbar") {
        return focusSlot.index;
      }
      return normalizeHotbarSelectedIndex(state.hotbar.selectedIndex, { allowNone: true });
    }

    function clearFocusedInventorySlot() {
      state.hotbar.focusSlot = null;
    }

    function setFocusedInventorySlot(scope, index) {
      const slotScope = scope === "hotbar" ? "hotbar" : "bag";
      const maxIndex = slotScope === "hotbar"
        ? HOTBAR_SLOT_COUNT - 1
        : Math.max(0, (Array.isArray(state.hotbar.bagSlotUids) ? state.hotbar.bagSlotUids.length : 32) - 1);
      state.hotbar.focusSlot = {
        scope: slotScope,
        index: clampValue(Number(index || 0), 0, maxIndex)
      };
    }

    function isFocusedInventorySlot(scope, index) {
      const focused = state.hotbar.focusSlot;
      if (!focused || typeof focused !== "object") {
        return false;
      }
      return focused.scope === scope && Number(focused.index || -1) === Number(index);
    }

    function normalizeInventorySlotRef(slotRef) {
      if (!slotRef || typeof slotRef !== "object") {
        return null;
      }
      const scope = slotRef.scope === "hotbar" ? "hotbar" : "bag";
      const maxIndex = scope === "hotbar"
        ? HOTBAR_SLOT_COUNT - 1
        : Math.max(0, (Array.isArray(state.hotbar.bagSlotUids) ? state.hotbar.bagSlotUids.length : 32) - 1);
      const index = Number(slotRef.index);
      if (!Number.isFinite(index) || index < 0 || index > maxIndex) {
        return null;
      }
      return { scope, index: Math.floor(index) };
    }

    function getInventorySlots(scope) {
      return scope === "hotbar"
        ? ensureHotbarSlots()
        : ensureBagSlots(Math.max(32, Array.isArray(state.hotbar.bagSlotUids) ? state.hotbar.bagSlotUids.length : 32));
    }

    function getInventorySlotUid(scope, index) {
      const slots = getInventorySlots(scope);
      const maxIndex = Math.max(0, slots.length - 1);
      const slotIndex = clampValue(Number(index || 0), 0, maxIndex);
      return Number(slots[slotIndex] || 0);
    }

    function isCarrySourceSlot(scope, index) {
      const carryFrom = state.hotbar.carryFrom;
      if (!carryFrom || typeof carryFrom !== "object") {
        return false;
      }
      return carryFrom.scope === scope && Number(carryFrom.index || -1) === Number(index);
    }

    function fillEmptySlots(slots, candidates, scope) {
      for (let i = 0; i < slots.length; i += 1) {
        if (Number(slots[i] || 0) > 0) continue;
        if (isCarrySourceSlot(scope, i)) continue;
        const nextUid = Number(candidates.shift() || 0);
        if (nextUid <= 0) break;
        slots[i] = nextUid;
      }
    }

    function syncHotbarSlotsWithItems() {
      const rows = Array.isArray(state.hotbar.items) ? state.hotbar.items : [];
      const uidList = rows
        .map((row) => Number(row?.uid || 0))
        .filter((uid) => uid > 0);
      const validUids = new Set(uidList);
      let hotbarSlots = ensureHotbarSlots();
      const expectedBagSlots = Math.max(32, Math.ceil(Math.max(uidList.length - HOTBAR_SLOT_COUNT, 0) / 8) * 8);
      let bagSlots = ensureBagSlots(expectedBagSlots || 32);

      const normalizedCarryFrom = normalizeInventorySlotRef(state.hotbar.carryFrom);
      if (!normalizedCarryFrom) {
        clearCarryState();
      } else {
        const uidAtSource = getInventorySlotUid(normalizedCarryFrom.scope, normalizedCarryFrom.index);
        if (uidAtSource <= 0 || !validUids.has(uidAtSource)) {
          clearCarryState();
        } else {
          state.hotbar.carryFrom = normalizedCarryFrom;
          state.hotbar.carryUid = uidAtSource;
        }
      }

      const normalizedFocus = normalizeInventorySlotRef(state.hotbar.focusSlot);
      if (!normalizedFocus) {
        clearFocusedInventorySlot();
      } else {
        state.hotbar.focusSlot = normalizedFocus;
      }

      const used = new Set();
      const sanitizeSlots = (slots) => slots.map((raw) => {
        const uid = Number(raw || 0);
        if (uid <= 0 || !validUids.has(uid) || used.has(uid)) {
          return 0;
        }
        used.add(uid);
        return uid;
      });

      hotbarSlots = sanitizeSlots(hotbarSlots);
      bagSlots = sanitizeSlots(bagSlots);

      const candidates = uidList.filter((uid) => uid > 0 && !used.has(uid));
      const hotbarHasAny = hotbarSlots.some((uid) => Number(uid || 0) > 0);
      if (!hotbarHasAny) {
        fillEmptySlots(hotbarSlots, candidates, "hotbar");
      }
      fillEmptySlots(bagSlots, candidates, "bag");

      while (candidates.length > 0) {
        bagSlots = bagSlots.concat(Array(8).fill(0));
        fillEmptySlots(bagSlots, candidates, "bag");
      }

      state.hotbar.slotUids = hotbarSlots;
      state.hotbar.bagSlotUids = bagSlots;
      state.hotbar.selectedIndex = normalizeHotbarSelectedIndex(state.hotbar.selectedIndex, { allowNone: true });
    }

    function handleInventorySlotInteraction(scope, index) {
      const slotScope = scope === "hotbar" ? "hotbar" : "bag";
      const hotbarSlots = getInventorySlots("hotbar");
      const bagSlots = getInventorySlots("bag");
      const slotList = slotScope === "hotbar" ? hotbarSlots : bagSlots;
      const maxIndex = slotScope === "hotbar" ? HOTBAR_SLOT_COUNT - 1 : slotList.length - 1;
      const slotIndex = clampValue(Number(index || 0), 0, Math.max(0, maxIndex));
      const clickedUid = Number(slotList[slotIndex] || 0);

      const carryUid = Number(state.hotbar.carryUid || 0);
      const carryFrom = normalizeInventorySlotRef(state.hotbar.carryFrom);
      const focusSlot = normalizeInventorySlotRef(state.hotbar.focusSlot);
      const selectedIndex = normalizeHotbarSelectedIndex(state.hotbar.selectedIndex, { allowNone: true });

      if (carryUid <= 0 || !carryFrom) {
        if (slotScope === "hotbar" && !focusSlot && selectedIndex === slotIndex) {
          state.hotbar.selectedIndex = -1;
          return {
            changed: true,
            type: "deselect",
            from: { scope: "hotbar", index: slotIndex }
          };
        }
        if (focusSlot && focusSlot.scope === slotScope && focusSlot.index === slotIndex) {
          clearFocusedInventorySlot();
          if (slotScope === "hotbar") {
            state.hotbar.selectedIndex = -1;
          }
          return {
            changed: true,
            type: "unfocus",
            from: { scope: slotScope, index: slotIndex }
          };
        }
        if (clickedUid <= 0) {
          return { changed: false };
        }
        if (slotScope === "hotbar") {
          state.hotbar.selectedIndex = slotIndex;
        }
        state.hotbar.carryUid = clickedUid;
        state.hotbar.carryFrom = { scope: slotScope, index: slotIndex };
        setFocusedInventorySlot(slotScope, slotIndex);
        return {
          changed: true,
          type: "pickup",
          from: { scope: slotScope, index: slotIndex },
          uid: clickedUid
        };
      }

      const sourceScope = carryFrom.scope === "hotbar" ? "hotbar" : "bag";
      const sourceList = sourceScope === "hotbar" ? hotbarSlots : bagSlots;
      const sourceMaxIndex = sourceScope === "hotbar" ? HOTBAR_SLOT_COUNT - 1 : sourceList.length - 1;
      const sourceIndex = clampValue(Number(carryFrom.index || 0), 0, Math.max(0, sourceMaxIndex));
      const sourceUid = Number(sourceList[sourceIndex] || 0);

      if (sourceUid <= 0) {
        clearCarryState();
        return { changed: false };
      }

      if (sourceScope === slotScope && sourceIndex === slotIndex) {
        clearCarryState();
        clearFocusedInventorySlot();
        if (slotScope === "hotbar") {
          state.hotbar.selectedIndex = -1;
        }
        return {
          changed: true,
          type: "cancel",
          to: { scope: slotScope, index: slotIndex }
        };
      }

      const targetUid = clickedUid;
      slotList[slotIndex] = sourceUid;
      sourceList[sourceIndex] = targetUid;
      clearCarryState();
      setFocusedInventorySlot(slotScope, slotIndex);
      if (slotScope === "hotbar") {
        state.hotbar.selectedIndex = slotIndex;
      }
      return {
        changed: true,
        type: "move",
        from: { scope: sourceScope, index: sourceIndex },
        to: { scope: slotScope, index: slotIndex },
        uid: sourceUid,
        swappedUid: targetUid
      };
    }

    function sortInventorySlots() {
      const rows = Array.isArray(state.hotbar.items) ? state.hotbar.items.slice() : [];
      if (rows.length <= 0) {
        toast("背包暂无可整理物品", "info");
        return;
      }
      const orderedUids = rows
        .sort((a, b) => {
          const countDiff = Number(b?.count || 0) - Number(a?.count || 0);
          if (countDiff !== 0) return countDiff;
          const itemDiff = Number(a?.item_id || 0) - Number(b?.item_id || 0);
          if (itemDiff !== 0) return itemDiff;
          return Number(a?.uid || 0) - Number(b?.uid || 0);
        })
        .map((row) => Number(row?.uid || 0))
        .filter((uid) => uid > 0);

      const nextHotbar = Array(HOTBAR_SLOT_COUNT).fill(0);
      for (let i = 0; i < HOTBAR_SLOT_COUNT && i < orderedUids.length; i += 1) {
        nextHotbar[i] = orderedUids[i];
      }
      const rest = orderedUids.slice(HOTBAR_SLOT_COUNT);
      const bagCount = Math.max(32, Math.ceil(Math.max(rest.length, 0) / 8) * 8);
      const nextBag = Array(bagCount).fill(0);
      for (let i = 0; i < rest.length; i += 1) {
        nextBag[i] = rest[i];
      }

      state.hotbar.slotUids = nextHotbar;
      state.hotbar.bagSlotUids = nextBag;
      state.hotbar.selectedIndex = normalizeHotbarSelectedIndex(state.hotbar.selectedIndex, { allowNone: true });
      clearCarryState();
      if (orderedUids.length > 0) {
        setFocusedInventorySlot("hotbar", 0);
      } else {
        clearFocusedInventorySlot();
      }
      renderHotbar();
      if (state.panelOpen && state.panelMode === "warehouse-page") {
        renderWarehousePage();
      }
      toast("背包已整理", "success");
    }

    function formatHotbarCount(count) {
      const n = Math.max(0, Number(count || 0));
      if (n <= 0) return "";
      if (n > 999) {
        return `${Math.floor(n / 1000)}k`;
      }
      return `${n}`;
    }

    function resolveWarehouseHighlightedSlot() {
      const carryFrom = normalizeInventorySlotRef(state.hotbar.carryFrom);
      if (carryFrom) {
        return carryFrom;
      }
      const focusSlot = normalizeInventorySlotRef(state.hotbar.focusSlot);
      if (focusSlot) {
        return focusSlot;
      }
      const selectedIndex = normalizeHotbarSelectedIndex(state.hotbar.selectedIndex, { allowNone: true });
      if (selectedIndex >= 0) {
        return {
          scope: "hotbar",
          index: selectedIndex
        };
      }
      return null;
    }

    function resolveWarehouseHighlightedRow() {
      const slot = resolveWarehouseHighlightedSlot();
      if (!slot) return null;
      const uid = getInventorySlotUid(slot.scope, slot.index);
      if (uid <= 0) return null;
      const rows = Array.isArray(state.hotbar.items) ? state.hotbar.items : [];
      const row = rows.find((item) => Number(item?.uid || 0) === uid);
      if (!row) return null;
      return { slot, uid, row };
    }

    function itemNameByUid(uid, itemMap) {
      const safeUid = Number(uid || 0);
      if (safeUid <= 0) return "";
      const row = itemMap.get(safeUid);
      if (row?.name) {
        return String(row.name);
      }
      return `物品#${safeUid}`;
    }

    function itemDescriptionByRow(row) {
      if (!row || typeof row !== "object") return "";
      const candidates = [
        row.desc,
        row.description,
        row.effect_desc,
        row.effectDesc,
        row.raw?.desc,
        row.raw?.effect_desc
      ];
      for (const value of candidates) {
        const text = String(value || "").trim();
        if (text) return text;
      }
      return "";
    }

    function itemSummaryByUid(uid, itemMap) {
      const safeUid = Number(uid || 0);
      if (safeUid <= 0) {
        return { name: "", description: "" };
      }
      const row = itemMap.get(safeUid);
      return {
        name: itemNameByUid(safeUid, itemMap),
        description: itemDescriptionByRow(row)
      };
    }

    function setHotbarSelectedName(text) {
      if (!refs.hotbarSelectedName) return;
      const label = String(text || "");
      refs.hotbarSelectedName.textContent = label;
      refs.hotbarSelectedName.classList.toggle("is-empty", !label);
    }

    function updateWarehouseSelectedNameInPanel() {
      const label = refs.panelBody?.querySelector("#bagSelectedName");
      if (!label) return;
      const itemMap = hotbarItemMap();
      const slot = resolveWarehouseHighlightedSlot();
      const uid = slot ? getInventorySlotUid(slot.scope, slot.index) : 0;
      const summary = itemSummaryByUid(uid, itemMap);
      label.innerHTML = `
        <span class="bag-selected-title">${escapeHtml(summary.name || "未选择物品")}</span>
        <span class="bag-selected-desc">${escapeHtml(summary.description || "")}</span>
      `;
      label.classList.toggle("is-empty", !summary.name);
    }

    async function sellHighlightedWarehouseItem() {
      const highlighted = resolveWarehouseHighlightedRow();
      if (!highlighted?.row) {
        toast("请先高亮一个背包物品", "info");
        return null;
      }
      const itemId = Math.max(0, Number(highlighted.row.item_id || 0));
      if (itemId <= 0) {
        toast("当前高亮物品不可出售", "info");
        return null;
      }
      try {
        const data = await reqFn("/api/warehouse/sell_item", {
          method: "POST",
          body: JSON.stringify({ item_id: itemId })
        });
        state.runtime = data.runtime || state.runtime;
        state.account = data.account || state.account;
        await refreshHotbarItems({ silent: true, force: true });
        const soldTotal = Math.max(0, Number(data?.sold_total_count || 0));
        toast(String(data?.message || "出售完成"), soldTotal > 0 ? "success" : "info");
        return data;
      } catch (error) {
        toast(`出售失败: ${error.message || "unknown"}`, "error");
        return null;
      }
    }

    async function sellAllFruitsInWarehouse() {
      try {
        const data = await reqFn("/api/warehouse/sell_fruits", {
          method: "POST",
          body: "{}"
        });
        state.runtime = data.runtime || state.runtime;
        state.account = data.account || state.account;
        await refreshHotbarItems({ silent: true, force: true });
        const soldTotal = Math.max(0, Number(data?.sold_total_count || 0));
        toast(String(data?.message || "出售完成"), soldTotal > 0 ? "success" : "info");
        return data;
      } catch (error) {
        toast(`一键出售果实失败: ${error.message || "unknown"}`, "error");
        return null;
      }
    }

    function cycleHotbarSelection(step) {
      const delta = Number(step || 0);
      if (!Number.isFinite(delta) || delta === 0) return;
      const current = normalizeHotbarSelectedIndex(state.hotbar.selectedIndex, { allowNone: true });
      const direction = delta > 0 ? 1 : -1;
      const next = current >= 0
        ? (current + direction + HOTBAR_SLOT_COUNT) % HOTBAR_SLOT_COUNT
        : (direction > 0 ? 0 : HOTBAR_SLOT_COUNT - 1);
      state.hotbar.selectedIndex = next;
      if (!syncHotbarSelectionVisual()) {
        renderHotbar();
      }
      if (state.panelOpen && state.panelMode === "warehouse-page") {
        if (!syncWarehousePanelSlots()) {
          renderWarehousePage();
        }
      }
    }

    function syncHotbarSelectionVisual() {
      if (!refs.hotbarSlots) return false;
      const slotButtons = Array.from(refs.hotbarSlots.querySelectorAll("[data-hotbar-slot]"));
      if (slotButtons.length !== HOTBAR_SLOT_COUNT) return false;
      const selectedIndex = resolveHotbarHighlightIndex();
      for (const btn of slotButtons) {
        const idx = Number(btn.dataset.hotbarSlot || -1);
        btn.classList.toggle("selected", selectedIndex >= 0 && idx === selectedIndex);
      }
      const itemMap = hotbarItemMap();
      const slots = ensureHotbarSlots();
      const selectedUid = selectedIndex >= 0 ? Number(slots[selectedIndex] || 0) : 0;
      setHotbarSelectedName(itemNameByUid(selectedUid, itemMap));
      return true;
    }

    function syncHotbarSlots() {
      if (!refs.hotbar || !refs.hotbarSlots) return false;
      const visible = Boolean(state.hotbar.visible);
      refs.hotbar.classList.toggle("hidden", !visible);
      if (!visible) {
        if (refs.hotbarSlots.childElementCount > 0) {
          refs.hotbarSlots.innerHTML = "";
        }
        setHotbarSelectedName("");
        return true;
      }

      const slotButtons = Array.from(refs.hotbarSlots.querySelectorAll("[data-hotbar-slot]"));
      if (slotButtons.length !== HOTBAR_SLOT_COUNT) return false;
      const itemMap = hotbarItemMap();
      const slots = ensureHotbarSlots();
      const selectedIndex = resolveHotbarHighlightIndex();

      for (let i = 0; i < HOTBAR_SLOT_COUNT; i += 1) {
        const slotBtn = slotButtons[i];
        if (!slotBtn) continue;
        const uid = Number(slots[i] || 0);
        const row = itemMap.get(uid);
        const isSelected = selectedIndex >= 0 && i === selectedIndex;

        slotBtn.classList.add("hotbar-slot");
        slotBtn.classList.toggle("selected", isSelected);
        slotBtn.classList.toggle("empty", !row);
        slotBtn.dataset.hotbarSlot = String(i);

        if (!row) {
          slotBtn.setAttribute("draggable", "false");
          slotBtn.removeAttribute("data-hotbar-has-item");
          slotBtn.setAttribute("title", "空槽位");
          const imgEl = slotBtn.querySelector(".hotbar-item-img");
          const countEl = slotBtn.querySelector(".hotbar-item-count");
          if (imgEl) imgEl.remove();
          if (countEl) countEl.remove();
          if ((imgEl || countEl) && slotBtn.innerHTML.trim()) {
            slotBtn.innerHTML = "";
          }
          continue;
        }

        const image = row.seed_image || row.image || "/assets/images/logo.png";
        const nextAlt = String(row.name || "");
        const nextCountText = formatHotbarCount(row.count);
        slotBtn.setAttribute("draggable", "true");
        slotBtn.setAttribute("data-hotbar-has-item", "1");
        slotBtn.setAttribute("title", nextAlt);
        const imgEl = slotBtn.querySelector(".hotbar-item-img");
        const countEl = slotBtn.querySelector(".hotbar-item-count");
        if (imgEl && countEl) {
          if (imgEl.getAttribute("src") !== image) {
            imgEl.setAttribute("src", image);
          }
          if (imgEl.getAttribute("alt") !== nextAlt) {
            imgEl.setAttribute("alt", nextAlt);
          }
          if (countEl.textContent !== nextCountText) {
            countEl.textContent = nextCountText;
          }
          continue;
        }

        slotBtn.innerHTML = `
          <img class="hotbar-item-img" src="${escapeHtml(image)}" alt="${escapeHtml(nextAlt)}" loading="lazy" />
          <span class="hotbar-item-count">${escapeHtml(nextCountText)}</span>
        `;
      }

      const selectedUid = selectedIndex >= 0 ? Number(slots[selectedIndex] || 0) : 0;
      setHotbarSelectedName(itemNameByUid(selectedUid, itemMap));
      return true;
    }

    function renderHotbar() {
      if (!refs.hotbar || !refs.hotbarSlots) return;
      const visible = Boolean(state.hotbar.visible);
      refs.hotbar.classList.toggle("hidden", !visible);
      if (!visible) {
        refs.hotbarSlots.innerHTML = "";
        return;
      }

      const itemMap = hotbarItemMap();
      const slots = state.hotbar.slotUids.slice(0, HOTBAR_SLOT_COUNT);
      while (slots.length < HOTBAR_SLOT_COUNT) {
        slots.push(0);
      }

      const html = [];
      const selectedIndex = resolveHotbarHighlightIndex();
      for (let i = 0; i < HOTBAR_SLOT_COUNT; i += 1) {
        const uid = Number(slots[i] || 0);
        const row = itemMap.get(uid);
        const selected = selectedIndex >= 0 && i === selectedIndex;
        const classes = ["hotbar-slot", selected ? "selected" : "", row ? "" : "empty"]
          .filter(Boolean)
          .join(" ");

        if (!row) {
          html.push(
            `<button class="${classes}" draggable="false" data-hotbar-slot="${i}" title="空槽位"></button>`
          );
          continue;
        }
        const image = row.seed_image || row.image || "/assets/images/logo.png";
        html.push(`
          <button class="${classes}" draggable="true" data-hotbar-has-item="1" data-hotbar-slot="${i}" title="${escapeHtml(row.name || "")}">
            <img class="hotbar-item-img" src="${escapeHtml(image)}" alt="${escapeHtml(row.name || "")}" loading="lazy" />
            <span class="hotbar-item-count">${escapeHtml(formatHotbarCount(row.count))}</span>
          </button>
        `);
      }

      html.push(`
        <button class="hotbar-slot hotbar-slot-more" data-hotbar-more="1" title="更多物品">
          <span class="more-icon">☰</span>
          <span class="more-text">更多</span>
        </button>
      `);
      refs.hotbarSlots.innerHTML = html.join("");

      const selectedUid = selectedIndex >= 0 ? Number(slots[selectedIndex] || 0) : 0;
      setHotbarSelectedName(itemNameByUid(selectedUid, itemMap));
    }

    async function refreshHotbarItems(options = {}) {
      const silent = Boolean(options?.silent);
      const force = Boolean(options?.force);
      const ttlMsRaw = Number(options?.ttlMs);
      const ttlMs = Number.isFinite(ttlMsRaw) && ttlMsRaw >= 0 ? ttlMsRaw : 1500;
      const now = Date.now();
      const cacheAgeMs = now - Number(state.hotbar.lastFetchAt || 0);
      const hasCache = Array.isArray(state.hotbar.items) && state.hotbar.items.length > 0;
      if (!force && hasCache && cacheAgeMs >= 0 && cacheAgeMs < ttlMs) {
        state.hotbar.items = mergeWarehouseRows(state.hotbar.items);
        syncHotbarSlotsWithItems();
        renderHotbar();
        if (state.panelOpen && state.panelMode === "warehouse-page") {
          renderWarehousePage();
        }
        return state.hotbar.items;
      }

      if (state.hotbar.fetchPromise) {
        return state.hotbar.fetchPromise;
      }

      const fetchTask = (async () => {
        state.hotbar.loading = true;
        try {
          const rows = await reqFn("/api/warehouse");
          state.hotbar.items = mergeWarehouseRows(rows);
          state.hotbar.lastFetchAt = Date.now();
          const carryUid = Number(state.hotbar.carryUid || 0);
          if (carryUid > 0) {
            const stillExists = state.hotbar.items.some((row) => Number(row?.uid || 0) === carryUid);
            if (!stillExists) {
              clearCarryState();
            }
          }
          syncHotbarSlotsWithItems();
          renderHotbar();
          if (state.panelOpen && state.panelMode === "warehouse-page") {
            renderWarehousePage();
          }
          return state.hotbar.items;
        } catch (error) {
          if (!silent) {
            toast(`加载背包失败: ${error.message || "unknown"}`, "error");
          }
          return state.hotbar.items;
        } finally {
          state.hotbar.loading = false;
        }
      })();

      state.hotbar.fetchPromise = fetchTask;
      try {
        return await fetchTask;
      } finally {
        if (state.hotbar.fetchPromise === fetchTask) {
          state.hotbar.fetchPromise = null;
        }
      }
    }

    function renderWarehousePage() {
      refs.panelBody.classList.remove("owner-detail", "logs-view", "login-view", "warehouse-grid", "shop-grid-view", "config-view");
      refs.panelBody.classList.add("warehouse-page");
      const rows = Array.isArray(state.hotbar.items) ? state.hotbar.items : [];
      const itemMap = hotbarItemMap();
      const carryFrom = normalizeInventorySlotRef(state.hotbar.carryFrom);

      const hotbarSlotUids = ensureHotbarSlots();
      const expectedBagSlots = Math.max(32, Math.ceil(Math.max(rows.length - HOTBAR_SLOT_COUNT, 0) / 8) * 8);
      const bagSlotUids = ensureBagSlots(expectedBagSlots || 32);

      const bagSlots = [];
      for (let i = 0; i < bagSlotUids.length; i += 1) {
        const uid = Number(bagSlotUids[i] || 0);
        const row = itemMap.get(uid);
        const isCarrySource = carryFrom && carryFrom.scope === "bag" && carryFrom.index === i;
        const isFocused = !carryFrom && isFocusedInventorySlot("bag", i);
        const classes = [
          "bag-slot",
          isCarrySource || isFocused ? "selected" : "",
          row ? "" : "empty"
        ].filter(Boolean).join(" ");
        if (!row) {
          bagSlots.push(
            `<button class="${classes}" draggable="false" data-inv-scope="bag" data-inv-slot="${i}" title="背包槽位 ${i + 1}"></button>`
          );
          continue;
        }
        const image = row.seed_image || row.image || "/assets/images/logo.png";
        bagSlots.push(`
          <button class="${classes}" draggable="true" data-inv-has-item="1" data-inv-scope="bag" data-inv-slot="${i}" title="${escapeHtml(row.name || "")}">
            <img class="bag-slot-img" src="${escapeHtml(image)}" alt="${escapeHtml(row.name || "")}" loading="lazy" />
            <span class="bag-slot-count">${escapeHtml(formatHotbarCount(row.count))}</span>
          </button>
        `);
      }

      const hotbarSlots = [];
      for (let i = 0; i < HOTBAR_SLOT_COUNT; i += 1) {
        const uid = Number(hotbarSlotUids[i] || 0);
        const row = itemMap.get(uid);
        const isCarrySource = carryFrom && carryFrom.scope === "hotbar" && carryFrom.index === i;
        const isFocused = !carryFrom && isFocusedInventorySlot("hotbar", i);
        const classes = [
          "bag-slot",
          "bag-hotbar-slot",
          isCarrySource || isFocused ? "selected" : "",
          row ? "" : "empty"
        ].filter(Boolean).join(" ");
        if (!row) {
          hotbarSlots.push(
            `<button class="${classes}" draggable="false" data-inv-scope="hotbar" data-inv-slot="${i}" title="快捷栏槽位 ${i + 1}"></button>`
          );
          continue;
        }
        const image = row.seed_image || row.image || "/assets/images/logo.png";
        hotbarSlots.push(`
          <button class="${classes}" draggable="true" data-inv-has-item="1" data-inv-scope="hotbar" data-inv-slot="${i}" title="快捷栏槽位 ${i + 1}">
            <img class="bag-slot-img" src="${escapeHtml(image)}" alt="${escapeHtml(row.name || "")}" loading="lazy" />
            <span class="bag-slot-count">${escapeHtml(formatHotbarCount(row.count))}</span>
          </button>
        `);
      }

      const highlightedSlot = resolveWarehouseHighlightedSlot();
      const highlightedUid = highlightedSlot ? getInventorySlotUid(highlightedSlot.scope, highlightedSlot.index) : 0;
      const selectedSummary = itemSummaryByUid(highlightedUid, itemMap);

      refs.panelBody.innerHTML = `
        <section class="bag-page">
          <div id="bagSelectedName" class="bag-selected-name${selectedSummary.name ? "" : " is-empty"}">
            <span class="bag-selected-title">${escapeHtml(selectedSummary.name || "未选择物品")}</span>
            <span class="bag-selected-desc">${escapeHtml(selectedSummary.description || "")}</span>
          </div>
          <div class="bag-title">背包槽位</div>
          <div class="bag-grid">${bagSlots.join("")}</div>
          <div class="bag-title">快捷栏槽位</div>
          <div class="bag-hotbar-grid">${hotbarSlots.join("")}</div>
        </section>
      `;
    }

    function syncWarehousePanelSlots() {
      if (!refs.panelBody || state.panelMode !== "warehouse-page") return false;
      const bagButtons = Array.from(refs.panelBody.querySelectorAll("[data-inv-scope='bag'][data-inv-slot]"));
      const hotbarButtons = Array.from(refs.panelBody.querySelectorAll("[data-inv-scope='hotbar'][data-inv-slot]"));
      if (bagButtons.length <= 0 && hotbarButtons.length <= 0) return false;

      const rows = Array.isArray(state.hotbar.items) ? state.hotbar.items : [];
      const itemMap = hotbarItemMap();
      const carryFrom = normalizeInventorySlotRef(state.hotbar.carryFrom);
      const hotbarSlotUids = ensureHotbarSlots();
      const expectedBagSlots = Math.max(32, Math.ceil(Math.max(rows.length - HOTBAR_SLOT_COUNT, 0) / 8) * 8);
      const bagSlotUids = ensureBagSlots(expectedBagSlots || 32);

      if (bagButtons.length !== bagSlotUids.length || hotbarButtons.length !== HOTBAR_SLOT_COUNT) {
        return false;
      }

      const updateSlotButton = (slotBtn, scope, index, row, selected) => {
        const nextUid = Number(row?.uid || 0);
        slotBtn.dataset.invScope = scope;
        slotBtn.dataset.invSlot = String(index);
        slotBtn.dataset.invUid = String(nextUid > 0 ? nextUid : 0);
        slotBtn.classList.add("bag-slot");
        slotBtn.classList.toggle("bag-hotbar-slot", scope === "hotbar");
        slotBtn.classList.toggle("selected", Boolean(selected));
        slotBtn.classList.toggle("empty", !row);
        if (!row) {
          slotBtn.setAttribute("draggable", "false");
          slotBtn.removeAttribute("data-inv-has-item");
          slotBtn.setAttribute("title", scope === "hotbar" ? `快捷栏槽位 ${index + 1}` : `背包槽位 ${index + 1}`);
          const imgEl = slotBtn.querySelector(".bag-slot-img");
          const countEl = slotBtn.querySelector(".bag-slot-count");
          if (imgEl) imgEl.remove();
          if (countEl) countEl.remove();
          if ((imgEl || countEl) && slotBtn.innerHTML.trim()) {
            slotBtn.innerHTML = "";
          }
          return;
        }
        const image = row.seed_image || row.image || "/assets/images/logo.png";
        slotBtn.setAttribute("draggable", "true");
        slotBtn.setAttribute("data-inv-has-item", "1");
        slotBtn.setAttribute("title", scope === "hotbar" ? `快捷栏槽位 ${index + 1}` : String(row.name || ""));
        const nextCountText = formatHotbarCount(row.count);
        const imgEl = slotBtn.querySelector(".bag-slot-img");
        const countEl = slotBtn.querySelector(".bag-slot-count");
        if (imgEl && countEl) {
          if (imgEl.getAttribute("src") !== image) {
            imgEl.setAttribute("src", image);
          }
          const nextAlt = String(row.name || "");
          if (imgEl.getAttribute("alt") !== nextAlt) {
            imgEl.setAttribute("alt", nextAlt);
          }
          if (countEl.textContent !== nextCountText) {
            countEl.textContent = nextCountText;
          }
          return;
        }
        slotBtn.innerHTML = `
            <img class="bag-slot-img" src="${escapeHtml(image)}" alt="${escapeHtml(row.name || "")}" loading="lazy" />
            <span class="bag-slot-count">${escapeHtml(nextCountText)}</span>
          `;
      };

      for (let i = 0; i < bagSlotUids.length; i += 1) {
        const uid = Number(bagSlotUids[i] || 0);
        const row = itemMap.get(uid);
        const isCarrySource = carryFrom && carryFrom.scope === "bag" && carryFrom.index === i;
        const isFocused = !carryFrom && isFocusedInventorySlot("bag", i);
        const selected = Boolean(isCarrySource || isFocused);
        updateSlotButton(bagButtons[i], "bag", i, row, selected);
      }

      for (let i = 0; i < HOTBAR_SLOT_COUNT; i += 1) {
        const uid = Number(hotbarSlotUids[i] || 0);
        const row = itemMap.get(uid);
        const isCarrySource = carryFrom && carryFrom.scope === "hotbar" && carryFrom.index === i;
        const isFocused = !carryFrom && isFocusedInventorySlot("hotbar", i);
        const selected = Boolean(isCarrySource || isFocused);
        updateSlotButton(hotbarButtons[i], "hotbar", i, row, selected);
      }

      updateWarehouseSelectedNameInPanel();
      return true;
    }

    async function showWarehousePage() {
      openPanelFn("背包", "warehouse-page");
      if (!Array.isArray(state.hotbar.items) || state.hotbar.items.length <= 0) {
        await refreshHotbarItems({ silent: true });
      }
      syncHotbarSlotsWithItems();
      renderWarehousePage();
    }

    return {
      findInventorySlotButtonInPanel,
      readInventorySlotFromButton,
      clearInventoryDragVisuals,
      clearInventoryDragState,
      playInventoryMoveAnimation,
      clearCarryState,
      clearFocusedInventorySlot,
      setFocusedInventorySlot,
      normalizeInventorySlotRef,
      getInventorySlotUid,
      handleInventorySlotInteraction,
      updateWarehouseSelectedNameInPanel,
      sortInventorySlots,
      sellHighlightedWarehouseItem,
      sellAllFruitsInWarehouse,
      cycleHotbarSelection,
      syncHotbarSelectionVisual,
      syncHotbarSlots,
      renderHotbar,
      refreshHotbarItems,
      renderWarehousePage,
      syncWarehousePanelSlots,
      showWarehousePage
    };
  };
})();
