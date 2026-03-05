(function () {
  const shared = (window.openQQFarmShared = window.openQQFarmShared || {});

  shared.createPageRuntimeSync = function createPageRuntimeSync({
    state,
    request,
    showToast,
    renderRuntimeAndAccount,
    renderFarm,
    renderFriends,
    refreshHotbarItems
  }) {
    const reqFn = typeof request === "function" ? request : () => Promise.resolve(null);

    async function loadFarm(cache = true) {
      const myGid = Number(state.account?.gid || 0);
      const target = Number(state.currentGid || 0);
      let url = `/api/farm?cache=${cache ? 1 : 0}`;
      if (target > 0 && target !== myGid) {
        url += `&gid=${target}`;
      }
      const data = await reqFn(url);
      state.farm = data;
      renderFarm();
      renderFriends();
    }

    async function loadBootstrap() {
      const data = await reqFn("/api/bootstrap");
      state.runtime = data.runtime || null;
      state.account = data.account || null;
      state.friends = data.friends || [];
      if (state.currentGid <= 0) {
        state.currentGid = Number(state.account?.gid || 0);
      }
      state.farm = data.farm || null;
      renderRuntimeAndAccount();
      renderFarm();
      renderFriends();
    }

    async function tick() {
      if (state.busyTick) return;
      state.busyTick = true;
      try {
        const accountRes = await reqFn("/api/account");
        state.runtime = accountRes.runtime || null;
        state.account = accountRes.account || null;
        renderRuntimeAndAccount();

        if (!state.runtime?.is_ready) {
          await loadBootstrap();
        } else {
          await loadFarm(true);
          const now = Date.now();
          if (state.hotbar.visible && (now - Number(state.hotbar.lastFetchAt || 0) > 6000)) {
            await refreshHotbarItems({ silent: true });
          }
          if (now - state.lastFriendsFetchAt > 15000) {
            state.friends = await reqFn("/api/friends");
            state.lastFriendsFetchAt = now;
            renderFriends();
          }
        }
      } catch (error) {
        if (typeof showToast === "function") {
          showToast(`请求失败: ${error.message || "unknown"}`, "error");
        }
      } finally {
        state.busyTick = false;
      }
    }

    function startPolling(interval = 3000) {
      if (state.pollTimer) {
        clearInterval(state.pollTimer);
      }
      state.pollTimer = setInterval(tick, Math.max(1000, Number(interval || 3000)));
    }

    function stopPolling() {
      if (!state.pollTimer) return;
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }

    return {
      loadFarm,
      loadBootstrap,
      tick,
      startPolling,
      stopPolling
    };
  };
})();
