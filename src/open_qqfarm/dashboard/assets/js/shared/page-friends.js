(function () {
  const shared = (window.openQQFarmShared = window.openQQFarmShared || {});

  shared.createPageFriends = function createPageFriends({
    refs,
    state,
    escapeHtml,
    avatarFallback
  }) {
    const escape = typeof escapeHtml === "function"
      ? escapeHtml
      : (value) => String(value || "");
    const avatarFallbackFn = typeof avatarFallback === "function"
      ? avatarFallback
      : () => "";

    let bound = false;

    function setFriendsStageCollapsed(collapsed) {
      const isCollapsed = Boolean(collapsed);
      refs.friendsStage?.classList.toggle("is-collapsed", isCollapsed);
      if (refs.btnFriendsToggle) {
        refs.btnFriendsToggle.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
        refs.btnFriendsToggle.title = isCollapsed ? "展开好友列表" : "收起好友列表";
      }
    }

    function setButtonsByOwner() {
      if (!refs.btnMyFarm) return;
      const myGid = Number(state.account?.gid || 0);
      const isMine = Number(state.currentGid || 0) === myGid;
      refs.btnMyFarm.classList.toggle("is-hidden", isMine);
      refs.btnMyFarm.setAttribute("aria-hidden", isMine ? "true" : "false");
      refs.btnMyFarm.setAttribute("tabindex", isMine ? "-1" : "0");
    }

    function renderFriends() {
      if (!refs.friendsRow) return;
      const rows = Array.isArray(state.friends) ? state.friends : [];
      const myGid = Number(state.account?.gid || 0);
      const current = Number(state.currentGid || 0);
      const chips = [];
      const myLevel = Number(state.account?.level || 0);

      chips.push(`
        <button class="friend-chip ${current === myGid ? "active" : ""}" data-gid="${myGid}">
          <span class="friend-avatar-wrap">
            <img class="friend-avatar" src="${escape(state.account?.avatar_url || avatarFallbackFn("我"))}" alt="我" />
            <span class="friend-level-star" title="等级 Lv.${myLevel}"><span>${myLevel}</span></span>
          </span>
          <span class="friend-name">我的农场</span>
        </button>
      `);

      for (const friend of rows) {
        const gid = Number(friend.gid || 0);
        const level = Number(friend.level || 0);
        chips.push(`
          <button class="friend-chip ${current === gid ? "active" : ""}" data-gid="${gid}">
            <span class="friend-avatar-wrap">
              <img class="friend-avatar" src="${escape(friend.avatar_url || avatarFallbackFn(friend.name || "F"))}" alt="${escape(friend.name || "")}" />
              <span class="friend-level-star" title="等级 Lv.${level}"><span>${level}</span></span>
            </span>
            <span class="friend-name">${escape(friend.name || String(gid))}</span>
          </button>
        `);
      }
      refs.friendsRow.innerHTML = chips.join("");
      setButtonsByOwner();
    }

    function bindFriendEvents({ onGoMyFarm, onFriendSelected } = {}) {
      if (bound) return;
      bound = true;
      const goMyFarm = typeof onGoMyFarm === "function" ? onGoMyFarm : async () => {};
      const friendSelected = typeof onFriendSelected === "function" ? onFriendSelected : async () => {};

      refs.btnMyFarm?.addEventListener("click", async () => {
        await goMyFarm();
      });

      refs.btnFriendsToggle?.addEventListener("click", () => {
        const collapsed = refs.friendsStage?.classList.contains("is-collapsed");
        setFriendsStageCollapsed(!collapsed);
      });

      refs.friendsRow?.addEventListener("click", async (event) => {
        const btn = event.target.closest(".friend-chip");
        if (!btn) return;
        const gid = Number(btn.dataset.gid || 0);
        if (gid <= 0 || gid === Number(state.currentGid || 0)) return;
        await friendSelected(gid);
      });

      refs.friendsRow?.addEventListener("wheel", (event) => {
        if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
        event.preventDefault();
        refs.friendsRow.scrollTop += event.deltaY;
      }, { passive: false });
    }

    return {
      setFriendsStageCollapsed,
      setButtonsByOwner,
      renderFriends,
      bindFriendEvents
    };
  };
})();
