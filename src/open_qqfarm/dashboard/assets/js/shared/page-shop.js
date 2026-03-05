(function () {
  const shared = (window.openQQFarmShared = window.openQQFarmShared || {});

  shared.createPageShop = function createPageShop({
    refs,
    state,
    request,
    escapeHtml,
    clampValue,
    showToast,
    openPanel,
    SHOP_COIN_ICON,
    withButtonLoading,
    onRuntimeAccountUpdated,
    onBoughtRefreshHotbar
  }) {
    const reqFn = typeof request === "function" ? request : window.req;
    const escape = typeof escapeHtml === "function"
      ? escapeHtml
      : (value) => String(value || "");
    const clamp = typeof clampValue === "function"
      ? clampValue
      : (value, min, max) => Math.min(max, Math.max(min, value));
    const toast = typeof showToast === "function" ? showToast : () => {};
    const openPanelFn = typeof openPanel === "function" ? openPanel : () => {};
    const onRuntimeChanged = typeof onRuntimeAccountUpdated === "function"
      ? onRuntimeAccountUpdated
      : () => {};
    const onBoughtRefreshHotbarFn = typeof onBoughtRefreshHotbar === "function"
      ? onBoughtRefreshHotbar
      : async () => {};
    const withButtonLoadingFn = typeof withButtonLoading === "function"
      ? withButtonLoading
      : async (_btn, runner) => runner();
    let seenExternalBuySeedActionSeq = 0;

    function formatItemCountText(count) {
      const n = Math.max(0, Number(count || 0));
      if (n <= 0) return "";
      if (n > 999) {
        return `${Math.floor(n / 1000)}k`;
      }
      return `${n}`;
    }

    function formatGrowTimeText(growTimeSec) {
      const totalSec = Math.max(0, Math.round(Number(growTimeSec || 0)));
      if (totalSec <= 0) return "";
      if (totalSec < 3600) {
        const minutes = Math.max(1, Math.round(totalSec / 60));
        return `${minutes}分钟`;
      }
      const hours = Math.floor(totalSec / 3600);
      const remainMin = Math.round((totalSec % 3600) / 60);
      if (remainMin <= 0) {
        return `${hours}小时`;
      }
      return `${hours}小时${remainMin}分钟`;
    }

    function resolveShopBuySourceNode(goodsId) {
      const host = ensureShopBuyModalHost();
      const dialogImage = host?.querySelector("[data-shop-buy-item-image]");
      if (dialogImage) {
        return dialogImage;
      }
      const id = Number(goodsId || 0);
      if (id > 0 && refs.panelBody) {
        const cardImage = refs.panelBody.querySelector(
          `[data-shop-goods-id="${id}"] .shop-card-image`
        );
        if (cardImage) {
          return cardImage;
        }
      }
      if (refs.btnShop) {
        return refs.btnShop;
      }
      return null;
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

    function triggerShopBuyFlyEffect({ goodsId, image, count }) {
      const sourceNode = resolveShopBuySourceNode(goodsId);
      const targetNode = resolveHotbarReceiveTarget();
      const iconSrc = String(image || "").trim();
      if (!sourceNode || !targetNode || !iconSrc) return;

      const start = sourceNode.getBoundingClientRect();
      const end = targetNode.getBoundingClientRect();
      if (start.width <= 0 || start.height <= 0 || end.width <= 0 || end.height <= 0) return;

      const sx = start.left + start.width / 2;
      const sy = start.top + start.height / 2;
      const ex = end.left + end.width / 2;
      const ey = end.top + end.height / 2;
      const dx = ex - sx;
      const dy = ey - sy;
      const arcY = Math.min(-56, dy * 0.26 - 48);
      const durationMs = 1020;

      const ghost = document.createElement("div");
      ghost.className = "shop-buy-fly-item";
      ghost.style.left = `${sx - 22}px`;
      ghost.style.top = `${sy - 22}px`;
      ghost.style.opacity = "0";

      const img = document.createElement("img");
      img.src = iconSrc;
      img.alt = "";
      img.loading = "eager";
      ghost.appendChild(img);

      const countText = formatItemCountText(count);
      if (countText) {
        const badge = document.createElement("span");
        badge.className = "shop-buy-fly-count";
        badge.textContent = countText;
        ghost.appendChild(badge);
      }

      document.body.appendChild(ghost);
      const anim = ghost.animate(
        [
          { transform: "translate(0, 0) scale(0.9) rotate(0deg)", opacity: 0, offset: 0 },
          { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 1, offset: 0.08 },
          { transform: `translate(${dx * 0.46}px, ${dy * 0.3 + arcY}px) scale(1.08) rotate(-8deg)`, opacity: 1, offset: 0.56 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.36) rotate(6deg)`, opacity: 0.22, offset: 1 }
        ],
        {
          duration: durationMs,
          easing: "cubic-bezier(0.16, 0.74, 0.2, 1)",
          fill: "forwards"
        }
      );

      window.setTimeout(() => {
        targetNode.classList.add("receive-item");
      }, durationMs - 260);
      window.setTimeout(() => {
        targetNode.classList.remove("receive-item");
      }, durationMs + 40);

      anim.onfinish = () => {
        ghost.remove();
      };
      anim.oncancel = () => {
        ghost.remove();
      };
    }

    function isShopGoodsSoldOut(row) {
      const limit = Number(row?.limit_count || 0);
      if (limit <= 0) return false;
      const bought = Number(row?.bought_num || 0);
      return bought >= limit;
    }

    function shopGoodsMaxPurchasable(row) {
      const limit = Number(row?.limit_count || 0);
      const bought = Number(row?.bought_num || 0);
      const remainByLimit = limit > 0 ? Math.max(0, limit - bought) : Number.MAX_SAFE_INTEGER;
      const price = Math.max(0, Number(row?.price || 0));
      if (price <= 0) {
        if (!Number.isFinite(remainByLimit) || remainByLimit >= Number.MAX_SAFE_INTEGER) {
          return 1;
        }
        return remainByLimit;
      }
      const gold = Math.max(0, Number(state.account?.gold || 0));
      const remainByGold = Math.floor(gold / price);
      return Math.max(0, Math.min(remainByLimit, remainByGold));
    }

    function findShopGoodsRow(goodsId) {
      const targetId = Number(goodsId || 0);
      if (targetId <= 0) return null;
      const rows = Array.isArray(state.shop.rows) ? state.shop.rows : [];
      return rows.find((row) => Number(row?.goods_id || 0) === targetId) || null;
    }

    function findShopGoodsRowByItemId(itemId) {
      const targetItemId = Number(itemId || 0);
      if (targetItemId <= 0) return null;
      const rows = Array.isArray(state.shop.rows) ? state.shop.rows : [];
      return rows.find((row) => Number(row?.item_id || 0) === targetItemId) || null;
    }

    function resolveItemImageByItemId(itemId) {
      const targetItemId = Number(itemId || 0);
      if (targetItemId <= 0) return "";
      const rows = Array.isArray(state.hotbar?.items) ? state.hotbar.items : [];
      const row = rows.find((item) => Number(item?.item_id || 0) === targetItemId) || null;
      return row ? String(row.seed_image || row.image || "") : "";
    }

    function onExternalFarmActionEvent(actionEvent) {
      const row = actionEvent && typeof actionEvent === "object" ? actionEvent : null;
      if (!row) return;
      const source = String(row.source || "").trim().toLowerCase();
      if (source && source !== "automation") return;
      const op = String(row.op || "").trim().toLowerCase();
      if (op !== "buy_seed") return;
      const seq = Math.max(0, Math.round(Number(row.seq || 0)));
      if (seq > 0 && seq <= seenExternalBuySeedActionSeq) return;
      if (seq > 0) {
        seenExternalBuySeedActionSeq = seq;
      }
      const count = Math.max(0, Math.round(Number(row.count || 0)));
      if (count <= 0) return;
      const itemId = Math.max(0, Math.round(Number(row.item_id || 0)));
      let goodsId = Math.max(0, Math.round(Number(row.goods_id || 0)));

      let goodsRow = goodsId > 0 ? findShopGoodsRow(goodsId) : null;
      if (!goodsRow && itemId > 0) {
        goodsRow = findShopGoodsRowByItemId(itemId);
      }
      if (!goodsId && goodsRow) {
        goodsId = Math.max(0, Number(goodsRow.goods_id || 0));
      }

      const image = String(
        (goodsRow && (goodsRow.seed_image || goodsRow.image)) ||
        resolveItemImageByItemId(itemId) ||
        "/assets/images/logo.png"
      );
      triggerShopBuyFlyEffect({
        goodsId,
        image,
        count
      });

      if (state.hotbar.visible) {
        void onBoughtRefreshHotbarFn();
      }
    }

    function ensureShopBuyModalHost() {
      if (!refs.dataPanel) return null;
      let host = refs.dataPanel.querySelector("#shopBuyModalHost");
      if (!host) {
        host = document.createElement("div");
        host.id = "shopBuyModalHost";
        host.className = "shop-buy-layer";
        refs.dataPanel.appendChild(host);
      }
      return host;
    }

    function clearShopBuyDialogDom() {
      const host = refs.dataPanel?.querySelector("#shopBuyModalHost");
      if (!host) return;
      host.innerHTML = "";
      host.classList.remove("is-open");
    }

    function updateShopBuyDialogValue() {
      const host = ensureShopBuyModalHost();
      if (!host || !state.shop.buy.open) return;
      const row = findShopGoodsRow(state.shop.buy.goodsId);
      if (!row) return;

      const max = Math.max(1, Number(state.shop.buy.max || 1));
      const num = clamp(Number(state.shop.buy.num || 1), 1, max);
      state.shop.buy.num = num;
      const total = Math.max(0, Number(row.price || 0)) * num;

      const range = host.querySelector("[data-shop-buy-range]");
      if (range) {
        range.max = String(max);
        range.value = String(num);
      }
      const numText = host.querySelector("[data-shop-buy-num]");
      if (numText) {
        numText.textContent = `${num} / ${max}`;
      }
      const totalText = host.querySelector("[data-shop-buy-total]");
      if (totalText) {
        totalText.textContent = String(total);
      }
    }

    function closeShopBuyDialog() {
      state.shop.buy.open = false;
      state.shop.buy.goodsId = 0;
      state.shop.buy.num = 1;
      state.shop.buy.max = 1;
      clearShopBuyDialogDom();
    }

    async function resolveMyFarmEmptyCount() {
      const myGid = Number(state.account?.gid || 0);
      if (myGid <= 0) return 0;
      if (Number(state.currentGid || 0) === myGid) {
        return Math.max(0, Number(state.farm?.summary?.empty || 0));
      }
      try {
        const myFarm = await reqFn(`/api/farm?gid=${myGid}&cache=1`);
        return Math.max(0, Number(myFarm?.summary?.empty || 0));
      } catch (_) {
        return Math.max(0, Number(state.farm?.summary?.empty || 0));
      }
    }

    async function openShopBuyDialog(goodsId) {
      const row = findShopGoodsRow(goodsId);
      if (!row) return;
      if (!Boolean(row.unlocked)) {
        toast(`该商品需 Lv.${Number(row.unlock_level || 0)} 解锁`, "error");
        return;
      }
      if (isShopGoodsSoldOut(row)) {
        toast("该商品已达到购买上限", "error");
        return;
      }

      const max = Math.max(0, shopGoodsMaxPurchasable(row));
      if (max <= 0) {
        toast("金币不足，无法购买", "error");
        return;
      }
      const emptyCount = await resolveMyFarmEmptyCount();
      const initial = clamp(Math.max(1, emptyCount || 1), 1, max);
      state.shop.buy.open = true;
      state.shop.buy.goodsId = Number(row.goods_id || 0);
      state.shop.buy.max = max;
      state.shop.buy.num = initial;
      renderShopBuyDialog();
    }

    function renderShopBuyDialog() {
      const host = ensureShopBuyModalHost();
      if (!host) return;
      if (!state.shop.buy.open) {
        host.innerHTML = "";
        host.classList.remove("is-open");
        return;
      }
      const row = findShopGoodsRow(state.shop.buy.goodsId);
      if (!row) {
        host.innerHTML = "";
        host.classList.remove("is-open");
        return;
      }

      const max = Math.max(1, Number(state.shop.buy.max || 1));
      const num = clamp(Number(state.shop.buy.num || 1), 1, max);
      state.shop.buy.num = num;
      const price = Math.max(0, Number(row.price || 0));
      const total = price * num;
      const image = row.seed_image || "/assets/images/logo.png";
      const remainLimit = Number(row.limit_count || 0) > 0
        ? Math.max(0, Number(row.limit_count || 0) - Number(row.bought_num || 0))
        : 0;
      const remainText = remainLimit > 0 ? `剩余可买 ${remainLimit}` : "无限购";

      host.classList.add("is-open");
      host.innerHTML = `
        <div class="shop-buy-mask" data-shop-buy-close="1"></div>
        <div class="shop-buy-dialog" role="dialog" aria-modal="true" aria-label="购买商品">
          <div class="shop-buy-head">
            <img data-shop-buy-item-image="1" src="${escape(image)}" alt="${escape(row.name || "")}" loading="lazy" />
            <div class="shop-buy-head-main">
              <div class="shop-buy-name">${escape(row.name || "")}</div>
              <div class="shop-buy-sub">每份 ${Number(row.item_count || 0)} 个 · ${escape(remainText)}</div>
            </div>
          </div>
          <div class="shop-buy-line">
            <label for="shopBuyRange">购买数量</label>
            <span data-shop-buy-num>${num} / ${max}</span>
          </div>
          <div class="shop-buy-range-wrap">
            <button class="shop-buy-step-btn" type="button" data-shop-buy-step="-1" aria-label="减少购买数量">-</button>
            <input id="shopBuyRange" class="shop-buy-range" data-shop-buy-range="1" type="range" min="1" max="${max}" step="1" value="${num}" />
            <button class="shop-buy-step-btn" type="button" data-shop-buy-step="1" aria-label="增加购买数量">+</button>
          </div>
          <div class="shop-buy-line">
            <span>总价</span>
            <span class="shop-buy-total">
              <span class="coin-icon" aria-hidden="true">${SHOP_COIN_ICON}</span>
              <span data-shop-buy-total>${total}</span>
            </span>
          </div>
          <div class="shop-buy-actions">
            <button class="shop-buy-btn secondary" type="button" data-shop-buy-cancel="1">取消</button>
            <button class="shop-buy-btn primary" type="button" data-shop-buy-confirm="1">确认购买</button>
          </div>
        </div>
      `;
    }

    function renderShopGrid(rows) {
      refs.panelBody.classList.remove("warehouse-grid", "warehouse-page", "owner-detail", "logs-view", "login-view");
      refs.panelBody.classList.add("shop-grid-view");
      if (!Array.isArray(rows) || rows.length === 0) {
        refs.panelBody.innerHTML = "<div class='data-row'><div class='data-main'>暂无可购买商品</div></div>";
        return;
      }
      const cards = rows.map((row) => {
        const goodsId = Number(row.goods_id || 0);
        const image = row.seed_image || "/assets/images/logo.png";
        const locked = !Boolean(row.unlocked);
        const soldOut = isShopGoodsSoldOut(row);
        const classes = [
          "shop-card",
          locked ? "locked" : "",
          soldOut ? "sold-out" : ""
        ].filter(Boolean).join(" ");
        const level = Number(row.unlock_level || 0);
        const price = Math.max(0, Number(row.price || 0));
        const growTimeText = formatGrowTimeText(row.grow_time_sec);
        const lockText = locked ? `Lv.${level} 解锁` : (soldOut ? "已售罄" : "");
        return `
          <button class="${classes}" type="button" data-shop-goods-id="${goodsId}">
            <div class="shop-card-top">
              <span class="shop-level-badge">Lv.${level}</span>
              <span class="shop-card-title">${escape(row.name || "")}</span>
            </div>
            <div class="shop-card-image-wrap">
              <img class="shop-card-image" src="${escape(image)}" alt="${escape(row.name || "")}" loading="lazy" />
            </div>
            <div class="shop-card-foot">
              <span class="shop-grow-time">${escape(growTimeText)}</span>
              <div class="shop-card-price">
                <span class="coin-icon" aria-hidden="true">${SHOP_COIN_ICON}</span>
                <span>${price}</span>
              </div>
            </div>
            ${lockText ? `<div class="shop-card-mask">${escape(lockText)}</div>` : ""}
          </button>
        `;
      }).join("");
      refs.panelBody.innerHTML = `
        <section class="shop-grid">${cards}</section>
      `;
    }

    async function confirmShopBuy() {
      const row = findShopGoodsRow(state.shop.buy.goodsId);
      if (!row) {
        closeShopBuyDialog();
        return;
      }
      const max = Math.max(0, shopGoodsMaxPurchasable(row));
      if (max <= 0) {
        toast("金币不足，无法购买", "error");
        closeShopBuyDialog();
        return;
      }
      const num = clamp(Number(state.shop.buy.num || 1), 1, max);
      const payload = {
        shop_id: Number(row.shop_id || 2),
        goods_id: Number(row.goods_id || 0),
        num,
        price: Number(row.price || 0)
      };
      const data = await reqFn("/api/shop/buy", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      state.runtime = data.runtime || state.runtime;
      state.account = data.account || state.account;
      onRuntimeChanged();
      const receivedCount = Math.max(
        0,
        Number(data?.received_count || 0)
      ) || Math.max(1, Number(row.item_count || 0)) * num;
      triggerShopBuyFlyEffect({
        goodsId: Number(row.goods_id || 0),
        image: row.seed_image || "/assets/images/logo.png",
        count: receivedCount
      });

      const rows = await reqFn("/api/shop?filter_unlocked=0");
      state.shop.rows = Array.isArray(rows) ? rows : [];
      closeShopBuyDialog();
      renderShopGrid(state.shop.rows);
      if (state.hotbar.visible) {
        await onBoughtRefreshHotbarFn();
      }
      toast(data.message || "购买成功", "success");
    }

    async function showShop() {
      openPanelFn("商店", "shop");
      closeShopBuyDialog();
      try {
        const rows = await reqFn("/api/shop?filter_unlocked=0");
        state.shop.rows = Array.isArray(rows) ? rows : [];
        renderShopGrid(state.shop.rows);
      } catch (error) {
        refs.panelBody.innerHTML = `<div class='data-row'><div class='data-main'>${escape(error.message || "加载失败")}</div></div>`;
      }
    }

    function handleInputEvent(event) {
      if (state.panelMode !== "shop" || !state.shop.buy.open) return false;
      const range = event.target.closest("[data-shop-buy-range]");
      if (!range) return false;
      const max = Math.max(1, Number(state.shop.buy.max || 1));
      state.shop.buy.num = clamp(Number(range.value || 1), 1, max);
      updateShopBuyDialogValue();
      return true;
    }

    async function handleClickEvent(event) {
      if (state.panelMode !== "shop") return false;

      const closeBtn = event.target.closest("[data-shop-buy-close],[data-shop-buy-cancel]");
      if (closeBtn) {
        closeShopBuyDialog();
        return true;
      }

      const stepBtn = event.target.closest("[data-shop-buy-step]");
      if (stepBtn) {
        const max = Math.max(1, Number(state.shop.buy.max || 1));
        const step = Number(stepBtn.dataset.shopBuyStep || 0);
        state.shop.buy.num = clamp(Number(state.shop.buy.num || 1) + step, 1, max);
        updateShopBuyDialogValue();
        return true;
      }

      const confirmBtn = event.target.closest("[data-shop-buy-confirm]");
      if (confirmBtn) {
        await withButtonLoadingFn(confirmBtn, async () => {
          try {
            await confirmShopBuy();
          } catch (error) {
            toast(`购买失败: ${error.message || "unknown"}`, "error");
          }
        });
        return true;
      }

      return false;
    }

    async function handlePanelBodyClick(event) {
      if (state.panelMode !== "shop") return false;
      const card = event.target.closest("[data-shop-goods-id]");
      if (!card) return false;
      await openShopBuyDialog(Number(card.dataset.shopGoodsId || 0));
      return true;
    }

    return {
      clearShopBuyDialogDom,
      closeShopBuyDialog,
      showShop,
      handleInputEvent,
      handleClickEvent,
      handlePanelBodyClick,
      onExternalFarmActionEvent
    };
  };
})();
