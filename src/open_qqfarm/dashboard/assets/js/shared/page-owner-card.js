(function () {
  const shared = (window.openQQFarmShared = window.openQQFarmShared || {});

  shared.createPageOwnerCard = function createPageOwnerCard({
    refs,
    state,
    clampValue,
    escapeHtml,
    avatarFallback,
    setButtonsByOwner,
    openPanel
  }) {
    const clamp = typeof clampValue === "function"
      ? clampValue
      : (value, min, max) => Math.min(max, Math.max(min, value));
    const avatarFallbackFn = typeof avatarFallback === "function"
      ? avatarFallback
      : () => "";
    const escape = typeof escapeHtml === "function"
      ? escapeHtml
      : (value) => String(value || "");
    const setButtonsByOwnerFn = typeof setButtonsByOwner === "function"
      ? setButtonsByOwner
      : () => {};
    const openPanelFn = typeof openPanel === "function"
      ? openPanel
      : () => {};

    function normalizeExpProgress(raw) {
      if (!raw || typeof raw !== "object") {
        return {
          next: 0,
          current: 0,
          total: 0,
          percent: 0,
          isMaxLevel: false
        };
      }
      const next = Math.max(0, Number(raw.next || 0));
      const total = Math.max(0, Number(raw.total || 0));
      const currentRaw = Math.max(0, Number(raw.current || 0));
      const current = total > 0 ? Math.min(currentRaw, total) : currentRaw;
      const isMaxLevel = Boolean(raw.is_max_level);
      const percentFromRaw = Number(raw.percent);
      const computedPercent = total > 0 ? (current / total) * 100 : (isMaxLevel ? 100 : 0);
      const percent = clamp(
        Number.isFinite(percentFromRaw) ? percentFromRaw : computedPercent,
        0,
        100
      );
      return {
        next,
        current,
        total,
        percent,
        isMaxLevel
      };
    }

    function normalizeExpForDisplay(exp, progress) {
      const safeExp = Math.max(0, Number(exp || 0));
      const base = Math.max(0, Number(progress?.base || 0));
      const next = Math.max(0, Number(progress?.next || 0));
      const normalized = (base > 0 && safeExp < base) ? (base + safeExp) : safeExp;
      if (next > 0) {
        return Math.min(normalized, next);
      }
      return normalized;
    }

    function formatExpProgressText(exp, progress) {
      if (progress?.isMaxLevel) {
        return "MAX";
      }
      const formatExpValue = (value) => {
        const n = Math.max(0, Number(value || 0));
        if (n >= 10000) {
          return `${(n / 10000).toFixed(1)}万`;
        }
        return `${Math.round(n)}`;
      };
      const currentExp = normalizeExpForDisplay(exp, progress);
      const next = Math.max(0, Number(progress?.next || 0));
      if (next > 0) {
        return `${formatExpValue(currentExp)}/${formatExpValue(next)}`;
      }
      return currentExp > 0 ? formatExpValue(currentExp) : "0/0";
    }

    function formatEconomyValue(raw) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return "--";
      if (n >= 10000) {
        const wan = n / 10000;
        const fixed = wan >= 100 ? Math.round(wan).toString() : wan.toFixed(1).replace(/\.0$/, "");
        return `${fixed}万`;
      }
      return `${Math.floor(n)}`;
    }

    function currentFarmOwner() {
      const farmOwner = state.farm?.owner || {};
      const ownerGid = Number(farmOwner.gid || 0);
      if (ownerGid > 0) {
        return {
          name: String(farmOwner.name || "农场主人"),
          gid: ownerGid,
          level: Number(farmOwner.level || 0),
          avatarUrl: String(farmOwner.avatar_url || ""),
          fromFarm: true
        };
      }
      const account = state.account || {};
      return {
        name: String(account.name || "未登录"),
        gid: Number(account.gid || 0),
        level: Number(account.level || 0),
        avatarUrl: String(account.avatar_url || ""),
        fromFarm: false
      };
    }

    function currentFarmBasic() {
      const owner = currentFarmOwner();
      const basic = state.farm?.basic || {};
      const account = state.account || {};
      const ownerGid = Number(basic.gid || owner.gid || 0);
      const accountGid = Number(account.gid || 0);
      const hasBasicExp = basic.exp !== undefined && basic.exp !== null;
      const exp = hasBasicExp
        ? Number(basic.exp || 0)
        : (ownerGid === accountGid ? Number(account.exp || 0) : 0);
      const rawExpProgress = basic.exp_progress && typeof basic.exp_progress === "object"
        ? basic.exp_progress
        : (ownerGid === accountGid ? account.exp_progress : null);
      const expProgress = normalizeExpProgress(rawExpProgress);
      return {
        gid: ownerGid,
        name: String(basic.name || owner.name || "农场主人"),
        level: Number(basic.level || owner.level || 0),
        avatarUrl: String(basic.avatar_url || owner.avatarUrl || ""),
        exp,
        expProgress,
        signature: String(basic.signature || ""),
        openId: String(basic.open_id || "")
      };
    }

    function resolveOwnerEconomyValue(key) {
      const ownerGid = Number(currentFarmBasic().gid || 0);
      const myGid = Number(state.account?.gid || 0);
      if (ownerGid > 0 && ownerGid === myGid) {
        const ownValue = Number(state.account?.[key] || 0);
        if (Number.isFinite(ownValue) && ownValue >= 0) {
          return ownValue;
        }
      }
      const raw = Number(state.farm?.basic?.[key]);
      if (Number.isFinite(raw) && raw >= 0) {
        return raw;
      }
      return null;
    }

    function renderOwnerCard() {
      const owner = currentFarmBasic();
      const myGid = Number(state.account?.gid || 0);
      const isMine = owner.gid > 0 && owner.gid === myGid;
      const staticKey = [
        Number(owner.gid || 0),
        String(owner.name || ""),
        Number(owner.level || 0),
        String(owner.avatarUrl || ""),
        isMine ? 1 : 0
      ].join("|");

      if (state.ownerCardStaticKey !== staticKey) {
        refs.accountName.textContent = owner.name || "农场主人";
        refs.accountLevel.textContent = `Lv.${Number(owner.level || 0)}`;
        refs.accountGid.textContent = `GID ${Number(owner.gid || 0)}`;
        refs.accountAvatar.src = owner.avatarUrl || avatarFallbackFn(owner.name || "F");
        refs.accountAvatar.onerror = () => {
          refs.accountAvatar.src = avatarFallbackFn(owner.name || "F");
        };
        refs.accountCard?.classList.toggle("is-self-owner", isMine);
        if (refs.accountCard) {
          refs.accountCard.title = isMine
            ? "当前正在查看我的农田，点击查看基础信息"
            : "当前正在查看好友农田，点击查看基础信息";
        }
        state.ownerCardStaticKey = staticKey;
      }

      const expProgress = owner.expProgress || normalizeExpProgress(null);
      if (refs.accountExpBar) {
        refs.accountExpBar.style.width = `${clamp(Number(expProgress.percent || 0), 0, 100)}%`;
      }
      if (refs.accountExpLevel) {
        refs.accountExpLevel.textContent = String(Math.max(0, Number(owner.level || 0)));
      }
      if (refs.accountExpText) {
        refs.accountExpText.textContent = formatExpProgressText(owner.exp, expProgress);
      }
      const goldValue = resolveOwnerEconomyValue("gold");
      if (refs.accountGoldText) {
        refs.accountGoldText.textContent = formatEconomyValue(goldValue);
        refs.accountGoldText.classList.toggle("is-empty", goldValue === null);
        refs.accountGoldText.title = goldValue === null ? "暂无数据" : String(Math.max(0, Math.floor(Number(goldValue || 0))));
      }
      const couponValue = resolveOwnerEconomyValue("coupon");
      if (refs.accountCouponText) {
        refs.accountCouponText.textContent = formatEconomyValue(couponValue);
        refs.accountCouponText.classList.toggle("is-empty", couponValue === null);
        refs.accountCouponText.title = couponValue === null ? "暂无数据" : String(Math.max(0, Math.floor(Number(couponValue || 0))));
      }
      setButtonsByOwnerFn();
    }

    function showOwnerDetails() {
      const owner = currentFarmBasic();
      const myGid = Number(state.account?.gid || 0);
      const isMine = owner.gid > 0 && owner.gid === myGid;
      const signatureText = owner.signature ? owner.signature : "暂无签名";
      const openIdText = owner.openId ? owner.openId : "未提供";
      const expProgressText = formatExpProgressText(owner.exp, owner.expProgress);

      openPanelFn("农场主人基础信息");
      refs.panelBody.classList.remove("warehouse-grid", "shop-grid-view", "config-view");
      refs.panelBody.classList.add("owner-detail");
      refs.panelBody.innerHTML = `
        <article class="owner-detail-card">
          <div class="owner-detail-head">
            <img src="${escape(owner.avatarUrl || avatarFallbackFn(owner.name || "F"))}" alt="${escape(owner.name || "owner")}" />
            <div class="owner-detail-title">
              <h4>${escape(owner.name || "农场主人")}</h4>
              <p>Lv.${Number(owner.level || 0)} · GID ${Number(owner.gid || 0)}</p>
            </div>
            <span class="owner-detail-tag ${isMine ? "self" : "friend"}">${isMine ? "我的农田" : "好友农田"}</span>
          </div>
          <div class="owner-detail-grid">
            <div class="owner-detail-item"><span>昵称</span><strong>${escape(owner.name || "农场主人")}</strong></div>
            <div class="owner-detail-item"><span>等级</span><strong>Lv.${Number(owner.level || 0)}</strong></div>
            <div class="owner-detail-item"><span>GID</span><strong>${Number(owner.gid || 0)}</strong></div>
            <div class="owner-detail-item"><span>经验</span><strong>${Number(owner.exp || 0)}</strong></div>
            <div class="owner-detail-item"><span>升级进度</span><strong>${escape(expProgressText)}</strong></div>
            <div class="owner-detail-item"><span>Open ID</span><strong>${escape(openIdText)}</strong></div>
          </div>
          <div class="owner-detail-foot">
            <span>签名：${escape(signatureText)}</span>
          </div>
        </article>
      `;
    }

    return {
      currentFarmBasic,
      formatExpProgressText,
      renderOwnerCard,
      showOwnerDetails
    };
  };
})();
