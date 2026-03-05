(function () {
  const shared = (window.openQQFarmShared = window.openQQFarmShared || {});

  shared.createPageAuth = function createPageAuth({
    refs,
    state,
    request,
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
    renderFarm,
    renderFriends,
    renderHotbar
  }) {
    const reqFn = typeof request === "function" ? request : window.req;
    const escape = typeof escapeHtml === "function"
      ? escapeHtml
      : (value) => String(value || "");
    const toast = typeof showToast === "function" ? showToast : () => {};
    const openPanelFn = typeof openPanel === "function" ? openPanel : () => {};
    const closePanelFn = typeof closePanel === "function" ? closePanel : () => {};
    const renderRuntimeAndAccountFn = typeof renderRuntimeAndAccount === "function"
      ? renderRuntimeAndAccount
      : () => {};
    const renderFarmFn = typeof renderFarm === "function" ? renderFarm : () => {};
    const renderFriendsFn = typeof renderFriends === "function" ? renderFriends : () => {};
    const renderHotbarFn = typeof renderHotbar === "function" ? renderHotbar : () => {};

    function setAuthButtons() {
      const runtime = state.runtime || {};
      const isReady = Boolean(runtime.is_ready);
      if (refs.btnAuth) {
        const label = refs.btnAuth.querySelector(".tool-label");
        const icon = refs.btnAuth.querySelector(".tool-icon");
        if (label) {
          label.textContent = isReady ? "登出" : "登录";
        }
        if (icon) {
          icon.innerHTML = isReady ? AUTH_ICON_LOGOUT : AUTH_ICON_LOGIN;
        }
        refs.btnAuth.title = isReady ? "登出" : "二维码登录";
        refs.btnAuth.setAttribute("aria-label", isReady ? "登出" : "二维码登录");
      }
    }

    function loginQrImageUrl() {
      return `/runtime/qr/login_qr.svg?t=${Date.now()}`;
    }

    function renderLoginPanel() {
      refs.panelBody.classList.remove("warehouse-grid", "warehouse-page", "owner-detail", "logs-view", "shop-grid-view", "config-view");
      refs.panelBody.classList.add("login-view");
      const runtime = state.runtime || {};
      const isReady = Boolean(runtime.is_ready);
      const isLoggingIn = Boolean(runtime.logging_in);

      let statusText = "点击下方按钮发起二维码登录";
      if (isReady) {
        statusText = "当前已登录";
      } else if (isLoggingIn) {
        statusText = "请使用 QQ 扫码完成登录";
      }

      refs.panelBody.innerHTML = `
        <div class="login-card">
          <div class="login-status">${escape(statusText)}</div>
          <img id="loginQrImage" class="login-qr-image ${isReady ? "is-hidden" : ""}" src="${escape(loginQrImageUrl())}" alt="登录二维码" />
          <div class="login-tip">${isReady ? "登录成功后可直接关闭窗口" : "二维码会自动刷新，若过期请重新扫码"}</div>
        </div>
      `;
    }

    function showLoginPanel() {
      openPanelFn("二维码登录", "login");
      renderLoginPanel();
    }

    async function triggerQrLogin() {
      try {
        const data = await reqFn("/api/auth/login", { method: "POST" });
        state.runtime = data.runtime || state.runtime;
        state.account = data.account || state.account;
        renderRuntimeAndAccountFn();
        showLoginPanel();
        toast(data.message || "二维码登录已发起", "success");
      } catch (error) {
        toast(`发起登录失败: ${error.message || "unknown"}`, "error");
      }
    }

    async function cancelQrLogin(options = {}) {
      const silent = Boolean(options?.silent);
      try {
        const data = await reqFn("/api/auth/cancel-login", { method: "POST" });
        state.runtime = data.runtime || state.runtime;
        state.account = data.account || state.account;
        renderRuntimeAndAccountFn();
        if (state.panelOpen && state.panelMode === "login") {
          renderLoginPanel();
        }
        if (!silent) {
          toast(data.message || "已取消二维码登录", "success");
        }
      } catch (error) {
        if (!silent) {
          toast(`取消登录失败: ${error.message || "unknown"}`, "error");
        }
      }
    }

    async function triggerLogout() {
      try {
        const data = await reqFn("/api/auth/logout", { method: "POST" });
        state.runtime = data.runtime || state.runtime;
        state.account = data.account || state.account;
        state.friends = Array.isArray(data.friends) ? data.friends : [];
        if (data.farm) {
          state.farm = data.farm;
        }
        state.hotbar.visible = true;
        state.hotbar.items = [];
        state.hotbar.slotUids = Array(HOTBAR_SLOT_COUNT).fill(0);
        state.hotbar.bagSlotUids = Array(32).fill(0);
        state.hotbar.selectedIndex = 0;
        clearCarryState();
        clearFocusedInventorySlot();
        clearInventoryDragState();
        state.hotbar.lastFetchAt = 0;
        state.currentGid = Number(state.account?.gid || 0);
        renderRuntimeAndAccountFn();
        renderFarmFn();
        renderFriendsFn();
        renderHotbarFn();
        closePanelFn();
        toast(data.message || "已登出账号", "success");
      } catch (error) {
        toast(`登出失败: ${error.message || "unknown"}`, "error");
      }
    }

    async function handleAuthButtonClick() {
      if (Boolean(state.runtime?.is_ready)) {
        await triggerLogout();
        return;
      }
      await triggerQrLogin();
    }

    return {
      setAuthButtons,
      renderLoginPanel,
      showLoginPanel,
      triggerQrLogin,
      cancelQrLogin,
      triggerLogout,
      handleAuthButtonClick
    };
  };
})();
