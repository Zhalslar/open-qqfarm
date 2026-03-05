(function () {
  window.t = window.t || ((key) => key);
  const shared = window.openQQFarmShared || {};
  const {
    createPageContext,
    createPageFriends,
    createPageOwnerCard,
    createPageAuth,
    createPageShop,
    createPageLogs,
    createPageFormatters,
    createPageToast,
    createPageInventory,
    createPageMusic,
    createPageFarmCamera,
    createPageFarmRender,
    createPageFarmActions,
    createPageRuntimeSync,
    createPageConfigPanel,
    createPageAutomationPanel
  } = shared;

  if (
    typeof createPageContext !== "function" ||
    typeof createPageFriends !== "function" ||
    typeof createPageOwnerCard !== "function" ||
    typeof createPageAuth !== "function" ||
    typeof createPageShop !== "function" ||
    typeof createPageLogs !== "function" ||
    typeof createPageFormatters !== "function" ||
    typeof createPageToast !== "function" ||
    typeof createPageInventory !== "function" ||
    typeof createPageMusic !== "function" ||
    typeof createPageFarmCamera !== "function" ||
    typeof createPageFarmRender !== "function" ||
    typeof createPageFarmActions !== "function" ||
    typeof createPageRuntimeSync !== "function" ||
    typeof createPageConfigPanel !== "function" ||
    typeof createPageAutomationPanel !== "function"
  ) {
    throw new Error("dashboard shared modules failed to load");
  }

  const {
    HOTBAR_SLOT_COUNT,
    AUTH_ICON_LOGIN,
    AUTH_ICON_LOGOUT,
    SHOP_COIN_ICON,
    BGM_AUDIO_URL,
    BGM_ENABLED_STORAGE_KEY,
    WITHERED_CROP_IMAGE,
    EMPTY_CROP_IMAGE,
    SEED_CROP_IMAGE,
    state,
    refs,
    applyFarmBackground
  } = createPageContext();

  const {
    escapeHtml,
    avatarFallback,
    formatCountdown,
    formatLogTime
  } = createPageFormatters();

  const { showToast } = createPageToast({ state });

  const {
    setFriendsStageCollapsed,
    setButtonsByOwner,
    renderFriends,
    bindFriendEvents
  } = createPageFriends({
    refs,
    state,
    escapeHtml,
    avatarFallback
  });

  const {
    renderOwnerCard,
    showOwnerDetails
  } = createPageOwnerCard({
    refs,
    state,
    clampValue,
    avatarFallback,
    setButtonsByOwner,
    escapeHtml,
    openPanel
  });

  const {
    clearShopBuyDialogDom,
    closeShopBuyDialog,
    showShop,
    handleInputEvent: handleShopInputEvent,
    handleClickEvent: handleShopClickEvent,
    handlePanelBodyClick: handleShopPanelBodyClick,
    onExternalFarmActionEvent: onExternalShopFarmActionEvent
  } = createPageShop({
    refs,
    state,
    request: req,
    escapeHtml,
    clampValue,
    showToast,
    openPanel,
    SHOP_COIN_ICON,
    withButtonLoading,
    onRuntimeAccountUpdated: () => {
      renderRuntimeAndAccount();
    },
    onBoughtRefreshHotbar: () => refreshHotbarItems({ silent: true, force: true })
  });

  const {
    findInventorySlotButtonInPanel,
    readInventorySlotFromButton,
    clearInventoryDragVisuals,
    clearInventoryDragState,
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
  } = createPageInventory({
    refs,
    state,
    HOTBAR_SLOT_COUNT,
    clampValue,
    escapeHtml,
    showToast,
    request: req,
    openPanel
  });

  const {
    setAuthButtons,
    cancelQrLogin,
    handleAuthButtonClick
  } = createPageAuth({
    refs,
    state,
    request: req,
    escapeHtml,
    showToast,
    openPanel,
    closePanel,
    AUTH_ICON_LOGIN,
    AUTH_ICON_LOGOUT,
    HOTBAR_SLOT_COUNT,
    clearCarryState,
    clearFocusedInventorySlot,
    clearInventoryDragState,
    renderRuntimeAndAccount,
    renderFarm: (...args) => renderFarm(...args),
    renderFriends,
    renderHotbar
  });

  const {
    readBgmEnabled,
    ensureBackgroundMusicAudio,
    renderBgmButton,
    playBackgroundMusic,
    setBgmEnabled
  } = createPageMusic({
    state,
    refs,
    BGM_AUDIO_URL,
    BGM_ENABLED_STORAGE_KEY,
    showToast
  });

  const {
    setConfigData,
    renderConfigPanel: renderConfigPanelView,
    handleInputEvent: handleConfigPanelInput,
    handleClickEvent: handleConfigPanelClick,
    buildPayload: buildConfigPanelPayload
  } = createPageConfigPanel({
    refs,
    state,
    escapeHtml,
    clampValue
  });

  const {
    init: initAutomationPanel,
    onRuntimeUpdated: renderAutomationPanelRuntime,
    onConfigUpdated: renderAutomationPanelConfig,
    onActionEvent: pushAutomationPanelActionEvent,
    destroy: destroyAutomationPanel
  } = createPageAutomationPanel({
    refs,
    state,
    request: req,
    setConfigData,
    showToast,
    clampValue,
    onRuntimeAccountChanged: () => {
      renderRuntimeAndAccount();
    }
  });
  let playFarmActionEventAnimation = () => {};
  let playShopBuyFromFarmActionAnimation = () => {};
  if (typeof onExternalShopFarmActionEvent === "function") {
    playShopBuyFromFarmActionAnimation = onExternalShopFarmActionEvent;
  }

  const {
    showLogsPanel,
    loadLogBackfill,
    stopLogStream,
    connectLogStream
  } = createPageLogs({
    refs,
    state,
    request: req,
    escapeHtml,
    formatLogTime,
    openPanel,
    normalizeActionEvent,
    onActionEvent: (actionEvent) => {
      if (actionEvent && typeof pushAutomationPanelActionEvent === "function") {
        pushAutomationPanelActionEvent(actionEvent);
      }
      if (actionEvent && typeof playFarmActionEventAnimation === "function") {
        playFarmActionEventAnimation(actionEvent);
      }
      if (actionEvent && typeof playShopBuyFromFarmActionAnimation === "function") {
        playShopBuyFromFarmActionAnimation(actionEvent);
      }
    }
  });

  function clampValue(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  const {
    updateLandGridTracks,
    applyFarmCamera,
    syncFarmCameraTargets,
    bindFarmViewportControls
  } = createPageFarmCamera({
    refs,
    state,
    clampValue
  });

  function renderRuntimeAndAccount() {
    renderOwnerCard();
    setAuthButtons();
    renderAutomationPanelRuntime();
    if (state.panelOpen && state.panelMode === "login" && Boolean(state.runtime?.is_ready)) {
      closePanel({ skipLoginCancel: true });
      window.location.reload();
    }
  }

  const { renderFarm } = createPageFarmRender({
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
  });

  const {
    loadFarm,
    loadBootstrap,
    startPolling,
    stopPolling
  } = createPageRuntimeSync({
    state,
    request: req,
    showToast,
    renderRuntimeAndAccount,
    renderFarm,
    renderFriends,
    refreshHotbarItems
  });

  const {
    runLandAction,
    runBatchFarmAction,
    onExternalActionEvent: onExternalFarmActionEvent
  } = createPageFarmActions({
    refs,
    state,
    request: req,
    showToast,
    renderFarm,
    loadFarm,
    renderRuntimeAndAccount,
    refreshHotbarItems,
    pushAutomationPanelActionEvent,
    normalizeActionEvent
  });
  if (typeof onExternalFarmActionEvent === "function") {
    playFarmActionEventAnimation = onExternalFarmActionEvent;
  }

  function updatePanelChrome() {
    const mode = String(state.panelMode || "");
    const isWarehousePage = mode === "warehouse-page";
    const isConfigMode = mode === "config";
    refs.dataPanel.classList.toggle("logs-mode", mode === "logs");
    refs.dataPanel.classList.toggle("warehouse-mode", isWarehousePage);
    refs.dataPanel.classList.toggle("shop-mode", mode === "shop");
    refs.dataPanel.classList.toggle("config-mode", isConfigMode);
    refs.panelSellItem?.classList.toggle("hidden", !isWarehousePage);
    refs.panelSellFruits?.classList.toggle("hidden", !isWarehousePage);
    refs.panelSort?.classList.toggle("hidden", !isWarehousePage);
    refs.panelConfigSave?.classList.toggle("hidden", !isConfigMode);
    refs.btnShop?.classList.toggle("active", mode === "shop");
    refs.btnConfig?.classList.toggle("active", isConfigMode);
  }

  function openPanel(title, mode = "") {
    state.panelOpen = true;
    state.panelMode = mode;
    playBackgroundMusic();
    refs.panelTitle.textContent = title;
    refs.dataPanel.classList.remove("hidden");
    updatePanelChrome();
    refs.panelBody.classList.remove("warehouse-grid", "warehouse-page", "owner-detail", "logs-view", "login-view", "shop-grid-view", "config-view");
    refs.panelBody.innerHTML = "<div class='data-row'><div class='data-main'>加载中...</div></div>";
  }

  function closePanel({ skipLoginCancel = false } = {}) {
    const wasLoginPanel = state.panelOpen && state.panelMode === "login";
    const wasWarehousePage = state.panelOpen && state.panelMode === "warehouse-page";
    const shouldCancelLogin = wasLoginPanel && Boolean(state.runtime?.logging_in) && !skipLoginCancel;
    state.panelOpen = false;
    state.panelMode = "";
    updatePanelChrome();
    refs.dataPanel.classList.add("hidden");
    if (wasWarehousePage) {
      clearCarryState();
      clearFocusedInventorySlot();
      clearInventoryDragState();
    }
    if (state.shop.buy.open) {
      closeShopBuyDialog();
    } else {
      clearShopBuyDialogDom();
    }
    if (shouldCancelLogin) {
      void cancelQrLogin({ silent: true });
    }
  }

  function normalizeActionEvent(value) {
    const source = value && typeof value === "object" ? value : {};
    const op = String(source.op || "").trim();
    if (!op) return null;
    const loopText = String(source.loop || "").trim().toLowerCase();
    const loop = loopText === "friend" ? "friend" : (loopText === "farm" ? "farm" : "");
    const count = Math.max(0, Math.round(Number(source.count || 0)));
    const seq = Math.max(0, Math.round(Number(source.seq || 0)));
    return {
      seq,
      ts: Math.max(0, Math.round(Number(source.ts || 0))),
      source: String(source.source || ""),
      loop,
      op,
      count,
      effective: source.effective !== undefined ? Boolean(source.effective) : count > 0,
      gid: Math.max(0, Math.round(Number(source.gid || 0))),
      land_id: Math.max(0, Math.round(Number(source.land_id || 0))),
      goods_id: Math.max(
        0,
        Math.round(Number(source.goods_id || 0))
      ),
      item_id: Math.max(
        0,
        Math.round(Number(source.item_id || 0))
      )
    };
  }

  function renderConfigPanel() {
    renderConfigPanelView();
  }

  async function reloadConfigInPanel() {
    const data = await req("/api/config");
    setConfigData(data || {});
    renderAutomationPanelConfig();
    state.config.error = "";
    renderConfigPanel();
  }

  async function showConfigPanel() {
    openPanel("系统配置", "config");
    try {
      await reloadConfigInPanel();
    } catch (error) {
      state.config.error = `加载配置失败: ${error.message || "unknown"}`;
      if (!state.config.data) {
        setConfigData({});
      }
      renderConfigPanel();
    }
  }

  function clearConfigPanelError() {
    if (!state.config.error) return;
    state.config.error = "";
    const errorNode = refs.panelBody?.querySelector(".config-error");
    if (errorNode?.parentElement) {
      errorNode.remove();
    }
  }

  async function saveConfigFromPanel() {
    const parsed = buildConfigPanelPayload();
    const data = await req("/api/config", {
      method: "POST",
      body: JSON.stringify({ config: parsed })
    });
    setConfigData(data?.config || parsed);
    renderAutomationPanelConfig();
    state.config.error = "";
    state.runtime = data.runtime || state.runtime;
    state.account = data.account || state.account;
    renderRuntimeAndAccount();
    renderConfigPanel();
    showToast(data.message || "配置已保存", "success");
  }

  function bindEvents() {
    bindFarmViewportControls();

    bindFriendEvents({
      onGoMyFarm: async () => {
        state.currentGid = Number(state.account?.gid || 0);
        setButtonsByOwner();
        renderAutomationPanelRuntime();
        await loadFarm(false);
      },
      onFriendSelected: async (gid) => {
        state.currentGid = Number(gid || 0);
        renderFriends();
        renderAutomationPanelRuntime();
        await loadFarm(false);
      }
    });

    refs.btnShop?.addEventListener("click", () => {
      showShop();
    });

    refs.btnConfig?.addEventListener("click", async () => {
      await showConfigPanel();
    });

    refs.btnLogs?.addEventListener("click", () => {
      showLogsPanel();
    });

    refs.btnAuth?.addEventListener("click", async () => {
      await handleAuthButtonClick();
    });

    refs.btnBgm?.addEventListener("click", () => {
      setBgmEnabled(!Boolean(state.music?.enabled));
    });

    refs.accountCard?.addEventListener("click", () => {
      showOwnerDetails();
    });
    refs.accountCard?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        showOwnerDetails();
      }
    });

    refs.farmSummary?.addEventListener("click", async (event) => {
      const btn = event.target.closest(".summary-action-btn");
      if (!btn) return;
      await runBatchFarmAction(btn.dataset.summaryAction || "");
    });

    refs.panelClose.addEventListener("click", () => closePanel());
    refs.panelConfigSave?.addEventListener("click", async () => {
      if (state.panelMode !== "config") return;
      await withButtonLoading(refs.panelConfigSave, async () => {
        try {
          await saveConfigFromPanel();
        } catch (error) {
          state.config.error = `保存失败: ${error.message || "unknown"}`;
          renderConfigPanel();
          showToast(state.config.error, "error");
        }
      });
    });
    refs.panelSellItem?.addEventListener("click", async () => {
      if (state.panelMode !== "warehouse-page") return;
      await withButtonLoading(refs.panelSellItem, async () => {
        const data = await sellHighlightedWarehouseItem();
        if (!data) return;
        renderRuntimeAndAccount();
      });
    });
    refs.panelSellFruits?.addEventListener("click", async () => {
      if (state.panelMode !== "warehouse-page") return;
      await withButtonLoading(refs.panelSellFruits, async () => {
        const data = await sellAllFruitsInWarehouse();
        if (!data) return;
        renderRuntimeAndAccount();
      });
    });
    refs.panelSort?.addEventListener("click", () => {
      if (state.panelMode !== "warehouse-page") return;
      sortInventorySlots();
    });
    refs.panelMask.addEventListener("click", () => closePanel());

    const syncInventoryViewsAfterHotbarChange = () => {
      if (!syncHotbarSlots()) {
        renderHotbar();
      }
      if (state.panelOpen && state.panelMode === "warehouse-page") {
        if (!syncWarehousePanelSlots()) {
          renderWarehousePage();
        }
      }
    };

    const syncInventoryViewsAfterHotbarSelection = () => {
      if (!syncHotbarSelectionVisual()) {
        renderHotbar();
      }
      if (state.panelOpen && state.panelMode === "warehouse-page") {
        if (!syncWarehousePanelSlots()) {
          renderWarehousePage();
        }
      }
    };

    const pulseHotbarSlot = (index) => {
      const slotIndex = clampValue(Number(index || 0), 0, HOTBAR_SLOT_COUNT - 1);
      const targetBtn = refs.hotbarSlots?.querySelector(`[data-hotbar-slot="${slotIndex}"]`);
      if (!targetBtn) return;
      targetBtn.classList.add("slot-drop-anim");
      window.setTimeout(() => {
        targetBtn.classList.remove("slot-drop-anim");
      }, 280);
    };

    const clearLandInventoryDropVisuals = () => {
      refs.landGrid?.querySelectorAll(".land-tile.inventory-drop-over").forEach((node) => {
        node.classList.remove("inventory-drop-over");
      });
    };

    const resolveDraggedInventoryTileAction = () => {
      if (!state.hotbar.drag.active) return null;
      const dragSource = normalizeInventorySlotRef(state.hotbar.drag.source);
      if (!dragSource) return null;
      const uid = getInventorySlotUid(dragSource.scope, dragSource.index);
      if (uid <= 0) return null;

      const rows = Array.isArray(state.hotbar.items) ? state.hotbar.items : [];
      const row = rows.find((item) => Number(item?.uid || 0) === uid);
      if (!row) return null;

      const itemId = Number(row?.item_id || 0);
      const interactionType = String(row?.interaction_type || "").trim().toLowerCase();
      const interactionTypeNorm = interactionType.replace(/[\s_-]+/g, "");
      const itemName = String(row?.name || "");
      const itemDesc = String(row?.desc || "");
      const itemEffectDesc = String(row?.effect_desc || row?.effectDesc || "");
      const fertilizerHintText = `${itemName} ${itemDesc} ${itemEffectDesc}`;
      const isSeed = Boolean(row?.is_seed) || itemId >= 20000 || interactionType.includes("seed");
      if (isSeed) {
        return {
          action: "plant",
          seedItemId: itemId > 0 ? itemId : 0
        };
      }

      const looksLikeFertilizer = (
        interactionTypeNorm.includes("fertilizer") ||
        /化肥|肥料/.test(fertilizerHintText)
      );
      const isOrganic = (
        itemId === 1012 ||
        interactionTypeNorm.includes("fertilizerpro") ||
        ((fertilizerHintText.includes("有机") || interactionTypeNorm.includes("organic")) && looksLikeFertilizer)
      );
      if (isOrganic) {
        return { action: "fertilize_organic", seedItemId: 0 };
      }
      const isNormal = (
        itemId === 1011 ||
        looksLikeFertilizer
      );
      if (isNormal) {
        return { action: "fertilize_normal", seedItemId: 0 };
      }
      return null;
    };

    const resolveInventoryLandDropValidation = (tileNode, dropAction) => {
      if (!dropAction) {
        return {
          ok: false,
          message: "该物品不能用于地块操作"
        };
      }
      if (!tileNode) {
        return {
          ok: false,
          message: "请将物品拖拽到地块上"
        };
      }
      const isOwnFarm = Number(state.currentGid || 0) === Number(state.account?.gid || 0);
      if (!isOwnFarm) {
        return {
          ok: false,
          message: "好友农场不支持背包拖拽操作"
        };
      }
      const landId = Number(tileNode.dataset.landId || 0);
      if (landId <= 0) {
        return {
          ok: false,
          message: "该地块未开放，无法使用"
        };
      }
      if (dropAction.action === "plant") {
        return tileNode.classList.contains("empty")
          ? { ok: true, message: "" }
          : { ok: false, message: "只有空地才能播种" };
      }
      if (dropAction.action === "fertilize_normal" || dropAction.action === "fertilize_organic") {
        return tileNode.classList.contains("growing")
          ? { ok: true, message: "" }
          : { ok: false, message: "只有生长中的作物才能施肥" };
      }
      return {
        ok: false,
        message: "当前地块不能使用该物品"
      };
    };

    const canDropInventoryOnLandTile = (tileNode, dropAction) => {
      return resolveInventoryLandDropValidation(tileNode, dropAction).ok;
    };

    let lastInvalidLandDropToastAt = 0;
    const notifyInvalidLandDrop = (message) => {
      const now = Date.now();
      if (now - lastInvalidLandDropToastAt < 420) return;
      lastInvalidLandDropToastAt = now;
      showToast(String(message || "当前地块不能使用该物品"), "error");
    };

    refs.hotbarSlots?.addEventListener("click", async (event) => {
      if (state.hotbar.drag.active) return;
      if (Date.now() < Number(state.hotbar.drag.suppressClickUntil || 0)) return;
      const moreBtn = event.target.closest("[data-hotbar-more]");
      if (moreBtn) {
        await showWarehousePage();
        return;
      }
      const slotBtn = event.target.closest("[data-hotbar-slot]");
      if (!slotBtn) return;
      const slotIndex = clampValue(Number(slotBtn.dataset.hotbarSlot || 0), 0, HOTBAR_SLOT_COUNT - 1);
      const currentSelected = Number(state.hotbar.selectedIndex);
      if (Number.isFinite(currentSelected) && Math.floor(currentSelected) === slotIndex) {
        state.hotbar.selectedIndex = -1;
      } else {
        state.hotbar.selectedIndex = slotIndex;
      }
      clearCarryState();
      clearFocusedInventorySlot();
      syncInventoryViewsAfterHotbarSelection();
    });

    refs.hotbarSlots?.addEventListener("dragstart", (event) => {
      const slotBtn = event.target.closest("[data-hotbar-slot]");
      if (!slotBtn) return;
      const slotIndex = clampValue(Number(slotBtn.dataset.hotbarSlot || 0), 0, HOTBAR_SLOT_COUNT - 1);
      const uid = getInventorySlotUid("hotbar", slotIndex);
      if (uid <= 0) {
        event.preventDefault();
        return;
      }

      clearInventoryDragVisuals();
      state.hotbar.drag.active = true;
      state.hotbar.drag.source = { scope: "hotbar", index: slotIndex };
      state.hotbar.drag.hover = { scope: "hotbar", index: slotIndex };
      state.hotbar.drag.justDropped = false;
      state.hotbar.carryUid = uid;
      state.hotbar.carryFrom = { scope: "hotbar", index: slotIndex };
      setFocusedInventorySlot("hotbar", slotIndex);
      slotBtn.classList.add("drag-source");

      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(uid));
        const img = slotBtn.querySelector("img");
        if (img) {
          const oldPreviewEl = state.hotbar.drag.previewEl;
          if (oldPreviewEl && oldPreviewEl.parentElement) {
            oldPreviewEl.remove();
          }
          const slotSize = Math.max(32, Math.min(Number(slotBtn.clientWidth || 58), Number(slotBtn.clientHeight || 58)));
          const dragSize = Math.round(slotSize * 1.08);
          const previewEl = document.createElement("div");
          previewEl.className = "drag-preview-image";
          previewEl.style.position = "fixed";
          previewEl.style.left = "-9999px";
          previewEl.style.top = "-9999px";
          previewEl.style.width = `${dragSize}px`;
          previewEl.style.height = `${dragSize}px`;
          previewEl.style.pointerEvents = "none";
          previewEl.style.zIndex = "130";
          previewEl.style.filter = "drop-shadow(0 4px 8px rgba(0,0,0,0.35))";
          previewEl.innerHTML = `<img src="${escapeHtml(img.getAttribute("src") || "")}" alt="" style="width:100%;height:100%;object-fit:contain;" />`;
          document.body.appendChild(previewEl);
          state.hotbar.drag.previewEl = previewEl;
          event.dataTransfer.setDragImage(previewEl, dragSize / 2, dragSize / 2);
        }
      }
    });

    refs.hotbarSlots?.addEventListener("dragover", (event) => {
      if (!state.hotbar.drag.active) return;
      const slotBtn = event.target.closest("[data-hotbar-slot]");
      if (!slotBtn) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
      const oldHover = refs.hotbarSlots.querySelector(".hotbar-slot.drag-over");
      if (oldHover && oldHover !== slotBtn) {
        oldHover.classList.remove("drag-over");
      }
      slotBtn.classList.add("drag-over");
      const slotIndex = clampValue(Number(slotBtn.dataset.hotbarSlot || 0), 0, HOTBAR_SLOT_COUNT - 1);
      state.hotbar.drag.hover = { scope: "hotbar", index: slotIndex };
    });

    refs.hotbarSlots?.addEventListener("dragleave", (event) => {
      if (!state.hotbar.drag.active) return;
      const slotBtn = event.target.closest("[data-hotbar-slot]");
      if (!slotBtn) return;
      const related = event.relatedTarget;
      if (related && slotBtn.contains(related)) return;
      slotBtn.classList.remove("drag-over");
    });

    refs.hotbarSlots?.addEventListener("drop", (event) => {
      if (!state.hotbar.drag.active) return;
      event.preventDefault();
      const slotBtn = event.target.closest("[data-hotbar-slot]");

      state.hotbar.drag.active = false;
      state.hotbar.drag.source = null;
      state.hotbar.drag.hover = null;
      clearInventoryDragVisuals();
      clearLandInventoryDropVisuals();
      const previewEl = state.hotbar.drag.previewEl;
      if (previewEl && previewEl.parentElement) {
        previewEl.remove();
      }
      state.hotbar.drag.previewEl = null;

      if (!slotBtn) {
        syncInventoryViewsAfterHotbarSelection();
        return;
      }

      const slotIndex = clampValue(Number(slotBtn.dataset.hotbarSlot || 0), 0, HOTBAR_SLOT_COUNT - 1);
      const interaction = handleInventorySlotInteraction("hotbar", slotIndex);
      if (!interaction?.changed) {
        syncInventoryViewsAfterHotbarSelection();
        return;
      }
      syncInventoryViewsAfterHotbarChange();
      if (interaction.type === "move" && interaction.to?.scope === "hotbar") {
        pulseHotbarSlot(interaction.to.index);
      }
      state.hotbar.drag.justDropped = true;
      state.hotbar.drag.suppressClickUntil = Date.now() + 220;
    });

    refs.hotbarSlots?.addEventListener("dragend", () => {
      const justDropped = Boolean(state.hotbar.drag.justDropped);
      state.hotbar.drag.active = false;
      state.hotbar.drag.source = null;
      state.hotbar.drag.hover = null;
      state.hotbar.drag.justDropped = false;
      clearInventoryDragVisuals();
      clearLandInventoryDropVisuals();
      const previewEl = state.hotbar.drag.previewEl;
      if (previewEl && previewEl.parentElement) {
        previewEl.remove();
      }
      state.hotbar.drag.previewEl = null;
      if (!justDropped) {
        syncInventoryViewsAfterHotbarSelection();
      }
    });

    refs.hotbarSlots?.addEventListener("wheel", (event) => {
      if (!state.hotbar.visible) return;
      const deltaY = Number(event.deltaY || 0);
      if (Math.abs(deltaY) < 0.01) return;
      event.preventDefault();
      cycleHotbarSelection(deltaY);
    }, { passive: false });

    refs.dataPanel?.addEventListener("input", (event) => {
      if (state.panelMode === "config") {
        if (!handleConfigPanelInput(event)) return;
        clearConfigPanelError();
        return;
      }
      handleShopInputEvent(event);
    });

    refs.dataPanel?.addEventListener("change", (event) => {
      if (state.panelMode !== "config") return;
      if (!handleConfigPanelInput(event)) return;
      clearConfigPanelError();
    });

    refs.dataPanel?.addEventListener("click", async (event) => {
      if (state.panelMode === "config") {
        if (handleConfigPanelClick(event)) {
          clearConfigPanelError();
          return;
        }
        return;
      }

      if (await handleShopClickEvent(event)) {
        return;
      }
    });

    refs.panelBody?.addEventListener("click", async (event) => {
      if (await handleShopPanelBodyClick(event)) return;
    });

    refs.panelBody?.addEventListener("dragstart", (event) => {
      if (state.panelMode !== "warehouse-page") return;
      const slotBtn = event.target.closest("[data-inv-scope][data-inv-slot]");
      const slotRef = readInventorySlotFromButton(slotBtn);
      if (!slotBtn || !slotRef) return;
      const uid = getInventorySlotUid(slotRef.scope, slotRef.index);
      if (uid <= 0) {
        event.preventDefault();
        return;
      }

      clearInventoryDragVisuals();
      state.hotbar.drag.active = true;
      state.hotbar.drag.source = slotRef;
      state.hotbar.drag.hover = slotRef;
      state.hotbar.drag.justDropped = false;
      state.hotbar.carryUid = uid;
      state.hotbar.carryFrom = { scope: slotRef.scope, index: slotRef.index };
      setFocusedInventorySlot(slotRef.scope, slotRef.index);
      slotBtn.classList.add("drag-source");
      updateWarehouseSelectedNameInPanel();

      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(uid));
        const img = slotBtn.querySelector("img");
        if (img) {
          const oldPreviewEl = state.hotbar.drag.previewEl;
          if (oldPreviewEl && oldPreviewEl.parentElement) {
            oldPreviewEl.remove();
          }
          const slotSize = Math.max(32, Math.min(Number(slotBtn.clientWidth || 58), Number(slotBtn.clientHeight || 58)));
          const dragSize = Math.round(slotSize * 1.08);
          const previewEl = document.createElement("div");
          previewEl.className = "drag-preview-image";
          previewEl.style.position = "fixed";
          previewEl.style.left = "-9999px";
          previewEl.style.top = "-9999px";
          previewEl.style.width = `${dragSize}px`;
          previewEl.style.height = `${dragSize}px`;
          previewEl.style.pointerEvents = "none";
          previewEl.style.zIndex = "130";
          previewEl.style.filter = "drop-shadow(0 4px 8px rgba(0,0,0,0.35))";
          previewEl.innerHTML = `<img src="${escapeHtml(img.getAttribute("src") || "")}" alt="" style="width:100%;height:100%;object-fit:contain;" />`;
          document.body.appendChild(previewEl);
          state.hotbar.drag.previewEl = previewEl;
          event.dataTransfer.setDragImage(previewEl, dragSize / 2, dragSize / 2);
        }
      }
    });

    refs.panelBody?.addEventListener("dragover", (event) => {
      if (state.panelMode !== "warehouse-page" || !state.hotbar.drag.active) return;
      const slotBtn = event.target.closest("[data-inv-scope][data-inv-slot]");
      if (!slotBtn) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
      const oldHover = refs.panelBody.querySelector(".bag-slot.drag-over");
      if (oldHover && oldHover !== slotBtn) {
        oldHover.classList.remove("drag-over");
      }
      slotBtn.classList.add("drag-over");
      state.hotbar.drag.hover = readInventorySlotFromButton(slotBtn);
    });

    refs.panelBody?.addEventListener("dragleave", (event) => {
      if (state.panelMode !== "warehouse-page" || !state.hotbar.drag.active) return;
      const slotBtn = event.target.closest("[data-inv-scope][data-inv-slot]");
      if (!slotBtn) return;
      const related = event.relatedTarget;
      if (related && slotBtn.contains(related)) return;
      slotBtn.classList.remove("drag-over");
    });

    refs.panelBody?.addEventListener("drop", (event) => {
      if (state.panelMode !== "warehouse-page" || !state.hotbar.drag.active) return;
      event.preventDefault();
      const slotBtn = event.target.closest("[data-inv-scope][data-inv-slot]");

      state.hotbar.drag.active = false;
      state.hotbar.drag.source = null;
      state.hotbar.drag.hover = null;
      clearInventoryDragVisuals();
      clearLandInventoryDropVisuals();
      const previewEl = state.hotbar.drag.previewEl;
      if (previewEl && previewEl.parentElement) {
        previewEl.remove();
      }
      state.hotbar.drag.previewEl = null;

      if (!slotBtn) {
        if (!syncWarehousePanelSlots()) {
          renderWarehousePage();
        }
        return;
      }

      const targetRef = readInventorySlotFromButton(slotBtn);
      if (!targetRef) {
        if (!syncWarehousePanelSlots()) {
          renderWarehousePage();
        }
        return;
      }

      const interaction = handleInventorySlotInteraction(targetRef.scope, targetRef.index);
      if (!interaction?.changed) {
        if (!syncWarehousePanelSlots()) {
          renderWarehousePage();
        }
        return;
      }
      if (!syncHotbarSlots()) {
        renderHotbar();
      }
      if (!syncWarehousePanelSlots()) {
        renderWarehousePage();
      }
      if (interaction.type === "move" && interaction.to) {
        const targetBtn = findInventorySlotButtonInPanel(interaction.to.scope, interaction.to.index);
        if (targetBtn) {
          targetBtn.classList.add("slot-drop-anim");
          window.setTimeout(() => {
            targetBtn.classList.remove("slot-drop-anim");
          }, 280);
        }
      }
      state.hotbar.drag.justDropped = true;
      state.hotbar.drag.suppressClickUntil = Date.now() + 220;
    });

    refs.panelBody?.addEventListener("dragend", () => {
      if (state.panelMode !== "warehouse-page") return;
      const justDropped = Boolean(state.hotbar.drag.justDropped);
      state.hotbar.drag.active = false;
      state.hotbar.drag.source = null;
      state.hotbar.drag.hover = null;
      state.hotbar.drag.justDropped = false;
      clearInventoryDragVisuals();
      clearLandInventoryDropVisuals();
      const previewEl = state.hotbar.drag.previewEl;
      if (previewEl && previewEl.parentElement) {
        previewEl.remove();
      }
      state.hotbar.drag.previewEl = null;
      if (!justDropped) {
        if (!syncWarehousePanelSlots()) {
          renderWarehousePage();
        }
      }
    });

    refs.panelBody?.addEventListener("click", (event) => {
      if (state.panelMode !== "warehouse-page") return;
      if (state.hotbar.drag.active) return;
      if (Date.now() < Number(state.hotbar.drag.suppressClickUntil || 0)) return;

      const slotBtn = event.target.closest("[data-inv-scope][data-inv-slot]");
      if (!slotBtn) return;
      const scope = slotBtn.dataset.invScope === "hotbar" ? "hotbar" : "bag";
      const slotIndex = Number(slotBtn.dataset.invSlot || 0);
      const currentFocus = normalizeInventorySlotRef(state.hotbar.focusSlot);
      const sameFocus = Boolean(
        currentFocus &&
        currentFocus.scope === scope &&
        Number(currentFocus.index || -1) === slotIndex
      );
      clearCarryState();
      if (sameFocus) {
        clearFocusedInventorySlot();
        if (scope === "hotbar") {
          state.hotbar.selectedIndex = -1;
        }
      } else {
        setFocusedInventorySlot(scope, slotIndex);
        if (scope === "hotbar") {
          state.hotbar.selectedIndex = slotIndex;
        }
      }
      if (!syncHotbarSlots()) {
        renderHotbar();
      }
      if (!syncWarehousePanelSlots()) {
        renderWarehousePage();
      }
    });

    refs.landGrid?.addEventListener("dragover", (event) => {
      if (!state.hotbar.drag.active) return;
      const tileNode = event.target.closest(".land-tile");
      if (!tileNode) return;
      const dropAction = resolveDraggedInventoryTileAction();
      if (!canDropInventoryOnLandTile(tileNode, dropAction)) {
        clearLandInventoryDropVisuals();
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
      const oldHover = refs.landGrid.querySelector(".land-tile.inventory-drop-over");
      if (oldHover && oldHover !== tileNode) {
        oldHover.classList.remove("inventory-drop-over");
      }
      tileNode.classList.add("inventory-drop-over");
    });

    refs.landGrid?.addEventListener("dragleave", (event) => {
      if (!state.hotbar.drag.active) return;
      const tileNode = event.target.closest(".land-tile");
      if (!tileNode) return;
      const related = event.relatedTarget;
      if (related && tileNode.contains(related)) return;
      tileNode.classList.remove("inventory-drop-over");
    });

    refs.landGrid?.addEventListener("drop", (event) => {
      if (!state.hotbar.drag.active) return;
      const tileNode = event.target.closest(".land-tile");
      const dropAction = resolveDraggedInventoryTileAction();
      clearLandInventoryDropVisuals();
      const dropValidation = resolveInventoryLandDropValidation(tileNode, dropAction);
      if (!dropValidation.ok) {
        event.preventDefault();
        event.stopPropagation();
        if (tileNode) {
          notifyInvalidLandDrop(dropValidation.message);
        }
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      state.hotbar.drag.justDropped = true;
      state.hotbar.drag.suppressClickUntil = Date.now() + 220;
      clearCarryState();
      clearFocusedInventorySlot();
      if (!syncHotbarSlots()) {
        renderHotbar();
      }
      if (state.panelOpen && state.panelMode === "warehouse-page") {
        if (!syncWarehousePanelSlots()) {
          renderWarehousePage();
        }
      }
      void runLandAction(tileNode, {
        forcedAction: dropAction.action,
        seedItemId: Number(dropAction.seedItemId || 0)
      });
    });

    refs.landGrid.addEventListener("click", async (event) => {
      const tileNode = event.target.closest(".land-tile");
      if (!tileNode) return;
      await runLandAction(tileNode);
    });
  }

  async function init() {
    state.music.enabled = readBgmEnabled();
    const bgm = ensureBackgroundMusicAudio();
    if (bgm) {
      bgm.addEventListener("error", () => {
        showToast("背景音乐资源加载失败", "error");
      });
    }
    renderBgmButton();
    await initAutomationPanel();
    bindEvents();
    if (state.music.enabled) {
      playBackgroundMusic({ bind_unlock_on_block: true });
    }
    applyFarmBackground();
    setFriendsStageCollapsed(false);
    renderHotbar();
    await loadBootstrap();
    if (state.runtime?.is_ready) {
      await refreshHotbarItems({ silent: true });
    }
    await loadLogBackfill();
    connectLogStream();
    startPolling(3000);
  }

  window.addEventListener("beforeunload", () => {
    stopPolling();
    stopLogStream();
    destroyAutomationPanel();
  });

  init();
})();
