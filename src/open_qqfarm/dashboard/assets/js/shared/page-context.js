(function () {
  const shared = (window.openQQFarmShared = window.openQQFarmShared || {});

  shared.createPageContext = function createPageContext() {
    const DEFAULT_FARM_SCALE = 0.72;
    const DEFAULT_FARM_INITIAL_OFFSET_Y = -22;
    const HOTBAR_SLOT_COUNT = 8;
    const AUTH_ICON_LOGIN = "<svg viewBox='0 0 24 24' aria-hidden='true'><circle cx='12' cy='12' r='9.5' fill='#ffe7a7' stroke='#d9ac46' stroke-width='1.2'/><rect x='11.2' y='6.2' width='6.2' height='11.6' rx='1.2' fill='#88c86a' stroke='#4f8e39' stroke-width='1.1'/><rect x='12.7' y='10.4' width='2.2' height='3.2' rx='0.6' fill='#f7f2de'/><path d='M4.2 12h8.2' stroke='#3b6d2d' stroke-width='1.6' stroke-linecap='round'/><path d='M9.3 8.9 12.5 12 9.3 15.1' stroke='#3b6d2d' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/></svg>";
    const AUTH_ICON_LOGOUT = "<svg viewBox='0 0 24 24' aria-hidden='true'><circle cx='12' cy='12' r='9.5' fill='#ffd8c6' stroke='#d7906e' stroke-width='1.2'/><rect x='6.6' y='6.2' width='6.2' height='11.6' rx='1.2' fill='#cda36f' stroke='#916f47' stroke-width='1.1'/><rect x='8.1' y='10.4' width='2.2' height='3.2' rx='0.6' fill='#f7f2de'/><path d='M19.8 12h-8.2' stroke='#9a4c33' stroke-width='1.6' stroke-linecap='round'/><path d='m14.7 8.9-3.2 3.1 3.2 3.1' stroke='#9a4c33' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/></svg>";
    const SHOP_COIN_ICON = "<svg viewBox='0 0 24 24' aria-hidden='true'><circle cx='12' cy='12' r='9.5' fill='#ffd96f' stroke='#b88718' stroke-width='1.2'/><ellipse cx='12' cy='9' rx='4.5' ry='2.6' fill='rgba(255,255,255,0.45)'/><path d='M8 13.4h8' stroke='#b88718' stroke-width='1.2' stroke-linecap='round'/></svg>";
    const BGM_AUDIO_URL = "/assets/audios/background_music.mp3";
    const BGM_ENABLED_STORAGE_KEY = "open_qqfarm_bgm_enabled";

    const state = {
      runtime: null,
      account: null,
      farm: null,
      friends: [],
      currentGid: 0,
      busyTick: false,
      panelOpen: false,
      pollTimer: null,
      lastFriendsFetchAt: 0,
      panelMode: "",
      logSource: null,
      logPollTimer: null,
      logReconnectTimer: null,
      logStatusText: "",
      lastLogSeq: 0,
      logs: [],
      landNodeBySlot: new Map(),
      farmRendered: false,
      actionBusy: false,
      hotbar: {
        visible: true,
        loading: false,
        items: [],
        slotUids: Array(HOTBAR_SLOT_COUNT).fill(0),
        bagSlotUids: Array(32).fill(0),
        selectedIndex: 0,
        carryUid: 0,
        carryFrom: null,
        focusSlot: null,
        drag: {
          active: false,
          source: null,
          hover: null,
          justDropped: false,
          suppressClickUntil: 0,
          previewEl: null
        },
        lastFetchAt: 0,
        fetchPromise: null
      },
      farmCamera: {
        scale: DEFAULT_FARM_SCALE,
        minScale: 0.5,
        maxScale: 1.1,
        x: 0,
        y: 0,
        initialOffsetY: DEFAULT_FARM_INITIAL_OFFSET_Y,
        targetScale: DEFAULT_FARM_SCALE,
        targetX: 0,
        targetY: 0,
        zoomRaf: 0,
        initialized: false,
        dragging: false,
        lastX: 0,
        lastY: 0
      },
      ownerCardStaticKey: "",
      toastLayer: null,
      music: {
        enabled: true,
        audio: null,
        unlockHandler: null
      },
      shop: {
        rows: [],
        buy: {
          open: false,
          goodsId: 0,
          num: 1,
          max: 1
        }
      },
      config: {
        data: null,
        error: ""
      }
    };

    const refs = {
      accountCard: document.getElementById("accountCard"),
      accountAvatar: document.getElementById("accountAvatar"),
      accountName: document.getElementById("accountName"),
      accountLevel: document.getElementById("accountLevel"),
      accountGid: document.getElementById("accountGid"),
      accountExpBar: document.getElementById("accountExpBar"),
      accountExpText: document.getElementById("accountExpText"),
      accountExpLevel: document.getElementById("accountExpLevel"),
      accountGoldText: document.getElementById("accountGoldText"),
      accountCouponText: document.getElementById("accountCouponText"),
      farmSummary: document.getElementById("farmSummary"),
      automationPanel: document.getElementById("automationPanel"),
      farmViewport: document.getElementById("farmViewport"),
      farmBgLayer: document.getElementById("farmBgLayer"),
      landGrid: document.getElementById("landGrid"),
      hotbar: document.getElementById("hotbar"),
      hotbarSelectedName: document.getElementById("hotbarSelectedName"),
      hotbarSlots: document.getElementById("hotbarSlots"),
      friendsStage: document.getElementById("friendsStage"),
      friendsRow: document.getElementById("friendsRow"),
      btnMyFarm: document.getElementById("btnMyFarm"),
      btnAuth: document.getElementById("btnAuth"),
      btnBgm: document.getElementById("btnBgm"),
      btnFriendsToggle: document.getElementById("btnFriendsToggle"),
      btnShop: document.getElementById("btnShop"),
      btnConfig: document.getElementById("btnConfig"),
      btnLogs: document.getElementById("btnLogs"),
      dataPanel: document.getElementById("dataPanel"),
      panelMask: document.getElementById("panelMask"),
      panelClose: document.getElementById("panelClose"),
      panelConfigSave: document.getElementById("panelConfigSave"),
      panelSellItem: document.getElementById("panelSellItem"),
      panelSellFruits: document.getElementById("panelSellFruits"),
      panelSort: document.getElementById("panelSort"),
      panelTitle: document.getElementById("panelTitle"),
      panelBody: document.getElementById("panelBody")
    };

    const WITHERED_CROP_IMAGE = (() => {
      const svg =
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'>" +
        "<rect width='80' height='80' fill='none'/>" +
        "<g stroke='#62553f' stroke-width='3' fill='none' stroke-linecap='round'>" +
        "<path d='M40 68 L40 33'/>" +
        "<path d='M40 46 C31 41 24 44 18 52'/>" +
        "<path d='M40 43 C49 36 57 39 63 47'/>" +
        "<path d='M40 57 C48 54 56 56 62 64'/>" +
        "<path d='M40 58 C32 56 24 58 19 65'/>" +
        "</g>" +
        "<g fill='#756649'>" +
        "<ellipse cx='18' cy='53' rx='7' ry='4' transform='rotate(-24 18 53)'/>" +
        "<ellipse cx='62' cy='47' rx='7' ry='4' transform='rotate(22 62 47)'/>" +
        "<ellipse cx='21' cy='64' rx='8' ry='4' transform='rotate(20 21 64)'/>" +
        "<ellipse cx='61' cy='63' rx='8' ry='4' transform='rotate(-18 61 63)'/>" +
        "</g>" +
        "</svg>";
      return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    })();

    const EMPTY_CROP_IMAGE =
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

    const SEED_CROP_IMAGE = (() => {
      const svg =
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'>" +
        "<rect width='80' height='80' fill='none'/>" +
        "<g transform='translate(40 42)'>" +
        "<ellipse cx='0' cy='0' rx='16' ry='22' fill='%23935f2f' transform='rotate(-22)'/>" +
        "<ellipse cx='-4' cy='-5' rx='7' ry='10' fill='%23b97a3e' transform='rotate(-18)'/>" +
        "<ellipse cx='-8' cy='-10' rx='3.4' ry='5.2' fill='%23d6a160' opacity='0.9' transform='rotate(-20)'/>" +
        "<path d='M-11 11 C-5 8 3 2 10 -6' stroke='%23784d24' stroke-width='2' fill='none' opacity='0.55'/>" +
        "</g>" +
        "</svg>";
      return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    })();

    const FARM_BACKGROUND_IMAGE = "/assets/images/background.jpg";

    function applyFarmBackground() {
      if (!refs.farmBgLayer) return;
      if (!FARM_BACKGROUND_IMAGE) return;
      refs.farmBgLayer.style.backgroundImage = `url("${FARM_BACKGROUND_IMAGE}")`;
    }

    return {
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
    };
  };
})();
