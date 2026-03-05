(function () {
  const shared = (window.openQQFarmShared = window.openQQFarmShared || {});

  shared.createPageMusic = function createPageMusic({
    state,
    refs,
    BGM_AUDIO_URL,
    BGM_ENABLED_STORAGE_KEY,
    showToast
  }) {
    function readBgmEnabled() {
      try {
        const raw = window.localStorage.getItem(BGM_ENABLED_STORAGE_KEY);
        if (raw === null) return true;
        return raw !== "0";
      } catch (_error) {
        return true;
      }
    }

    function writeBgmEnabled(enabled) {
      try {
        window.localStorage.setItem(BGM_ENABLED_STORAGE_KEY, enabled ? "1" : "0");
      } catch (_error) {
      }
    }

    function ensureBackgroundMusicAudio() {
      if (state.music?.audio) {
        return state.music.audio;
      }
      const audio = new Audio(BGM_AUDIO_URL);
      audio.loop = true;
      audio.preload = "auto";
      audio.volume = 0.42;
      state.music.audio = audio;
      return audio;
    }

    function renderBgmButton() {
      if (!refs.btnBgm) return;
      const enabled = Boolean(state.music?.enabled);
      const icon = refs.btnBgm.querySelector(".tool-icon");
      const label = refs.btnBgm.querySelector(".tool-label");
      if (icon) {
        icon.textContent = enabled ? "🎵" : "🔇";
      }
      if (label) {
        label.textContent = "音乐";
      }
      refs.btnBgm.classList.toggle("active", enabled);
      const title = enabled ? "关闭背景音乐" : "开启背景音乐";
      refs.btnBgm.title = title;
      refs.btnBgm.setAttribute("aria-label", title);
    }

    function clearBgmUnlockFallback() {
      const handler = state.music?.unlockHandler;
      if (!handler) return;
      window.removeEventListener("pointerdown", handler, true);
      window.removeEventListener("keydown", handler, true);
      state.music.unlockHandler = null;
    }

    function bindBgmUnlockFallback() {
      if (!Boolean(state.music?.enabled)) return;
      if (state.music?.unlockHandler) return;
      const handler = () => {
        clearBgmUnlockFallback();
        if (!Boolean(state.music?.enabled)) return;
        void playBackgroundMusic({ bind_unlock_on_block: false });
      };
      state.music.unlockHandler = handler;
      window.addEventListener("pointerdown", handler, { once: true, capture: true });
      window.addEventListener("keydown", handler, { once: true, capture: true });
    }

    function playBackgroundMusic(options = {}) {
      if (!Boolean(state.music?.enabled)) return;
      const audio = ensureBackgroundMusicAudio();
      if (!audio) return;
      audio.muted = false;
      const task = audio.play();
      if (task && typeof task.catch === "function") {
        task.then(() => {
          clearBgmUnlockFallback();
        }).catch(() => {
          if (options?.bind_unlock_on_block !== false) {
            bindBgmUnlockFallback();
          }
          if (Boolean(options?.from_user)) {
            showToast("背景音乐播放失败，请检查浏览器自动播放或系统音量", "error");
          }
        });
        return;
      }
      clearBgmUnlockFallback();
    }

    function pauseBackgroundMusic() {
      const audio = state.music?.audio;
      if (!audio) return;
      audio.pause();
    }

    function setBgmEnabled(enabled) {
      state.music.enabled = Boolean(enabled);
      writeBgmEnabled(state.music.enabled);
      if (state.music.enabled) {
        playBackgroundMusic({ from_user: true, bind_unlock_on_block: true });
      } else {
        clearBgmUnlockFallback();
        pauseBackgroundMusic();
      }
      renderBgmButton();
    }

    return {
      readBgmEnabled,
      ensureBackgroundMusicAudio,
      renderBgmButton,
      playBackgroundMusic,
      setBgmEnabled
    };
  };
})();
