(function () {
  const shared = (window.openQQFarmShared = window.openQQFarmShared || {});

  shared.createPageAutomationPanel = function createPageAutomationPanel({
    refs,
    state,
    request,
    setConfigData,
    showToast,
    clampValue,
    onRuntimeAccountChanged
  }) {
    const requestFn = typeof request === "function" ? request : window.req;
    const clamp = typeof clampValue === "function"
      ? clampValue
      : (value, min, max) => Math.min(max, Math.max(min, value));
    const toast = typeof showToast === "function"
      ? showToast
      : () => {};

    const RING_RADIUS = 26;
    const RING_CIRCUMFERENCE = Math.PI * 2 * RING_RADIUS;
    const LOOP_KEYS = ["farm", "friend"];
    const LOOP_DEFS = {
      farm: {
        title: "自家农场循环",
        minMinute: 1,
        maxMinute: 240,
        actions: [
          { value: "weed", label: "除草" },
          { value: "insect", label: "除虫" },
          { value: "water", label: "浇水" },
          { value: "harvest", label: "收获" },
          { value: "sell", label: "卖果" },
          { value: "buy_seed", label: "购种" },
          { value: "remove", label: "清枯" },
          { value: "unlock", label: "解锁" },
          { value: "upgrade", label: "升级" },
          { value: "plant", label: "种植" },
          { value: "normal_fertilize", label: "普肥" },
          { value: "organic_fertilize", label: "有肥" }
        ]
      },
      friend: {
        title: "好友农场循环",
        minMinute: 5,
        maxMinute: 360,
        actions: [
          { value: "steal", label: "偷菜" },
          { value: "help_water", label: "帮水" },
          { value: "help_weed", label: "帮草" },
          { value: "help_insect", label: "帮虫" },
          { value: "put_insect", label: "放虫" },
          { value: "put_weed", label: "放草" }
        ]
      }
    };

    const BURST_DURATION_MS = 900;
    const BURST_QUEUE_LIMIT = 28;
    const loopBusy = new Set();
    let seenEventSeq = 0;
    const actionTotals = { farm: {}, friend: {} };
    const burstQueue = { farm: [], friend: [] };
    const actionBurst = {
      farm: { action: "", count: 0, until: 0 },
      friend: { action: "", count: 0, until: 0 }
    };
    const draftMinute = { farm: 0, friend: 0 };

    let runtimeSnapshot = {
      serverTs: 0,
      capturedAtMs: 0,
      loops: {
        farm: null,
        friend: null
      }
    };
    let popoverLoop = "";
    let loadingConfigPromise = null;
    let countdownTimer = 0;
    let bound = false;
    let handleOutsideClickRef = null;

    function isPlainObject(value) {
      return Boolean(value) && typeof value === "object" && !Array.isArray(value);
    }

    function deepClone(value) {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (_err) {
        return {};
      }
    }

    function escapeHtml(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function defaultRuntimeLoop(loopKey) {
      const def = LOOP_DEFS[loopKey];
      return {
        enabled: true,
        base_minute: def.minMinute,
        actions: def.actions.map((item) => item.value),
        next_at: 0,
        remaining_sec: 0,
        running: false,
        total_steps: 0,
        completed_steps: 0,
        progress: 0,
        current_action: "",
        current_index: -1,
        current_action_count: 0,
        last_action: "",
        last_action_seq: 0
      };
    }

    function normalizeRuntimeLoop(loopKey, raw) {
      const fallback = defaultRuntimeLoop(loopKey);
      const source = isPlainObject(raw) ? raw : {};
      const actions = Array.isArray(source.actions)
        ? source.actions.map((item) => String(item || "").trim()).filter(Boolean)
        : fallback.actions.slice();
      return {
        enabled: source.enabled !== undefined ? Boolean(source.enabled) : fallback.enabled,
        base_minute: clamp(
          Number(source.base_minute || fallback.base_minute),
          LOOP_DEFS[loopKey].minMinute,
          LOOP_DEFS[loopKey].maxMinute
        ),
        actions,
        next_at: Math.max(0, Number(source.next_at || 0)),
        remaining_sec: Math.max(0, Number(source.remaining_sec || 0)),
        running: Boolean(source.running),
        total_steps: Math.max(0, Number(source.total_steps || 0)),
        completed_steps: Math.max(0, Number(source.completed_steps || 0)),
        progress: clamp(Number(source.progress || 0), 0, 1),
        current_action: String(source.current_action || ""),
        current_index: Number(source.current_index ?? -1),
        current_action_count: Math.max(0, Math.round(Number(source.current_action_count || 0))),
        last_action: String(source.last_action || ""),
        last_action_seq: Math.max(0, Number(source.last_action_seq || 0))
      };
    }

    function syncRuntimeSnapshot() {
      const automation = state.runtime?.automation;
      const now = Date.now();
      const hasAutomation = isPlainObject(automation);
      const serverTs = hasAutomation
        ? Math.max(0, Number(automation.server_ts || 0))
        : 0;

      runtimeSnapshot = {
        serverTs: serverTs > 0 ? serverTs : now / 1000,
        capturedAtMs: now,
        loops: {
          farm: normalizeRuntimeLoop("farm", hasAutomation ? automation.farm : null),
          friend: normalizeRuntimeLoop("friend", hasAutomation ? automation.friend : null)
        }
      };
    }

    function inferLoopKeyForAction(actionValue, hintedLoop = "") {
      const hint = String(hintedLoop || "").trim().toLowerCase();
      if (LOOP_DEFS[hint]) {
        return hint;
      }
      const op = String(actionValue || "").trim();
      if (!op) return "";
      for (const loopKey of LOOP_KEYS) {
        const def = LOOP_DEFS[loopKey];
        if (def.actions.some((item) => item.value === op)) {
          return loopKey;
        }
      }
      return "";
    }

    function onActionEvent(payload) {
      const row = isPlainObject(payload) ? payload : {};
      const actionValue = String(row.op || "").trim();
      if (!actionValue) return;
      const loopKey = inferLoopKeyForAction(actionValue, row.loop);
      if (!LOOP_DEFS[loopKey]) return;
      const seq = Math.max(0, Math.round(Number(row.seq || 0)));
      if (seq > 0 && seq <= seenEventSeq) {
        return;
      }
      if (seq > 0) {
        seenEventSeq = seq;
      }
      const count = Math.max(0, Math.round(Number(row.count || 0)));
      const effective = row.effective !== undefined ? Boolean(row.effective) : count > 0;
      if (!effective || count <= 0) {
        return;
      }
      const totals = actionTotals[loopKey];
      totals[actionValue] = Math.max(0, Math.round(Number(totals[actionValue] || 0))) + count;
      const queue = burstQueue[loopKey];
      queue.push({
        seq,
        action: actionValue,
        count
      });
      if (queue.length > BURST_QUEUE_LIMIT) {
        queue.splice(0, queue.length - BURST_QUEUE_LIMIT);
      }
      render();
    }

    function stepBurstPlayback(now = Date.now()) {
      let changed = false;
      for (const loopKey of LOOP_KEYS) {
        const burst = actionBurst[loopKey];
        const queue = burstQueue[loopKey];
        if (Number(burst.until || 0) > now) {
          continue;
        }
        if (queue.length > 0) {
          const next = queue.shift();
          actionBurst[loopKey] = {
            action: String(next?.action || ""),
            count: Math.max(0, Math.round(Number(next?.count || 0))),
            until: now + BURST_DURATION_MS
          };
          changed = true;
          continue;
        }
        if (burst.action) {
          actionBurst[loopKey] = {
            action: "",
            count: 0,
            until: 0
          };
          changed = true;
        }
      }
      return changed;
    }

    function getRuntimeLoop(loopKey) {
      const base = normalizeRuntimeLoop(loopKey, runtimeSnapshot.loops[loopKey]);
      const elapsed = Math.max(0, (Date.now() - Number(runtimeSnapshot.capturedAtMs || 0)) / 1000);
      const serverNow = Number(runtimeSnapshot.serverTs || 0) + elapsed;
      let remaining = Number(base.remaining_sec || 0);
      if (Number(base.next_at || 0) > 0) {
        remaining = Math.max(0, Number(base.next_at) - serverNow);
      }
      base.remaining_sec = remaining;
      return base;
    }

    function dedupStringArray(list) {
      const result = [];
      const seen = new Set();
      for (const item of list || []) {
        const text = String(item || "").trim();
        if (!text || seen.has(text)) continue;
        seen.add(text);
        result.push(text);
      }
      return result;
    }

    function normalizeActions(loopKey, actions) {
      const def = LOOP_DEFS[loopKey];
      const order = def.actions.map((item) => item.value);
      const source = dedupStringArray(actions);
      const known = source.filter((item) => order.includes(item));
      known.sort((a, b) => order.indexOf(a) - order.indexOf(b));
      const unknown = source.filter((item) => !order.includes(item));
      return known.concat(unknown);
    }

    function getLoopConfig(loopKey) {
      const def = LOOP_DEFS[loopKey];
      const runtimeLoop = getRuntimeLoop(loopKey);
      const raw = state.config?.data?.[loopKey];
      const source = isPlainObject(raw) ? raw : {};
      const enableAuto = source.enable_auto !== undefined
        ? Boolean(source.enable_auto)
        : Boolean(runtimeLoop.enabled);
      const baseMinute = clamp(
        Number(source.base_minute || runtimeLoop.base_minute || def.minMinute),
        def.minMinute,
        def.maxMinute
      );
      const actionSource = Array.isArray(source.actions) && source.actions.length > 0
        ? source.actions
        : runtimeLoop.actions;
      const actions = normalizeActions(loopKey, actionSource);
      return {
        enable_auto: enableAuto,
        base_minute: baseMinute,
        actions
      };
    }

    function formatRemainingTime(seconds) {
      const total = Math.max(0, Math.ceil(Number(seconds || 0)));
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const secs = total % 60;
      const mm = String(minutes).padStart(2, "0");
      const ss = String(secs).padStart(2, "0");
      if (hours > 0) {
        return `${String(hours).padStart(2, "0")}:${mm}:${ss}`;
      }
      return `${mm}:${ss}`;
    }

    function intervalLabelText(minutes) {
      const minute = Math.max(0, Math.round(Number(minutes || 0)));
      return `${minute} 分钟`;
    }

    function getActiveLoopKey() {
      const myGid = Number(state.account?.gid || 0);
      const currentGid = Number(state.currentGid || 0);
      if (myGid > 0 && currentGid > 0) {
        return currentGid === myGid ? "farm" : "friend";
      }
      const farm = state.farm;
      if (isPlainObject(farm) && "is_friend" in farm) {
        return Boolean(farm.is_friend) ? "friend" : "farm";
      }
      return "farm";
    }

    function getVisibleLoopKeys() {
      const key = getActiveLoopKey();
      if (LOOP_DEFS[key]) {
        return [key];
      }
      return ["farm"];
    }

    function buildLoopRow(loopKey) {
      const def = LOOP_DEFS[loopKey];
      const cfg = getLoopConfig(loopKey);
      const runtime = getRuntimeLoop(loopKey);
      const busy = loopBusy.has(loopKey);
      const activeActions = new Set(cfg.actions || []);
      const isOpen = popoverLoop === loopKey;
      const intervalMinute = isOpen && Number(draftMinute[loopKey] || 0) > 0
        ? Number(draftMinute[loopKey] || cfg.base_minute)
        : Number(cfg.base_minute);
      const intervalSec = Math.max(1, Math.round(intervalMinute * 60));
      const remainingSec = Math.max(0, Number(runtime.remaining_sec || 0));
      const ringProgress = clamp(1 - (remainingSec / intervalSec), 0, 1);
      const dashOffset = RING_CIRCUMFERENCE * (1 - ringProgress);
      const now = Date.now();
      stepBurstPlayback(now);
      const burst = actionBurst[loopKey];
      const effectCounts = actionTotals[loopKey];

      const actionButtons = def.actions.map((actionDef) => {
        const enabled = activeActions.has(actionDef.value);
        const current = runtime.running && runtime.current_action === actionDef.value;
        const hit = burst.action === actionDef.value && Number(burst.until || 0) > now;
        const burstCount = hit ? Math.max(0, Math.round(Number(burst.count || 0))) : 0;
        const totalCount = Math.max(0, Math.round(Number(effectCounts[actionDef.value] || 0)));
        let statText = "";
        if (burstCount > 0) {
          statText = `+${burstCount}次`;
        } else if (totalCount > 0) {
          statText = `${totalCount}次`;
        } else if (current) {
          statText = "执行中";
        }
        return `
          <button
            class="automation-action-dot ${enabled ? "is-on" : "is-off"} ${runtime.running && enabled ? "is-running" : ""} ${current ? "is-current" : ""} ${hit ? "is-hit" : ""}"
            data-auto-action-loop="${loopKey}"
            data-auto-action-value="${actionDef.value}"
            aria-pressed="${enabled ? "true" : "false"}"
            ${busy ? "disabled" : ""}
          >
            <span class="automation-dot-core"></span>
            <span class="automation-dot-name">${escapeHtml(actionDef.label)}</span>
            <span class="automation-dot-stat ${statText ? "is-visible" : ""}">${escapeHtml(statText)}</span>
            <span class="automation-dot-star" aria-hidden="true">★</span>
          </button>
        `;
      }).join("");

      const ringText = state.runtime?.is_ready ? formatRemainingTime(remainingSec) : "--:--";

      return `
        <section class="automation-row" data-auto-loop="${loopKey}">
          <div class="automation-row-main">
            <div class="automation-ring-wrap">
              <button
                class="automation-ring-button ${cfg.enable_auto ? "is-on" : "is-off"} ${isOpen ? "is-open" : ""}"
                data-auto-ring="${loopKey}"
                title="${escapeHtml(def.title)}：左键开关循环，右键调整间隔"
                ${busy ? "disabled" : ""}
              >
                <svg viewBox="0 0 64 64" aria-hidden="true">
                  <circle class="automation-ring-track" cx="32" cy="32" r="${RING_RADIUS}"></circle>
                  <circle
                    class="automation-ring-progress"
                    data-auto-ring-progress="${loopKey}"
                    cx="32"
                    cy="32"
                    r="${RING_RADIUS}"
                    style="stroke-dasharray:${RING_CIRCUMFERENCE.toFixed(3)};stroke-dashoffset:${dashOffset.toFixed(3)};"
                  ></circle>
                </svg>
                <span class="automation-ring-time" data-auto-remaining="${loopKey}">${ringText}</span>
              </button>
              <div class="automation-interval-pop ${isOpen ? "is-open" : ""}" data-auto-pop="${loopKey}">
                <div class="automation-interval-title">${escapeHtml(def.title)}间隔</div>
                <input
                  type="range"
                  min="${def.minMinute}"
                  max="${def.maxMinute}"
                  step="1"
                  value="${Math.round(intervalMinute)}"
                  data-auto-range="${loopKey}"
                />
                <div class="automation-interval-foot">
                  <button data-auto-range-step="${loopKey}" data-step="-1" ${busy ? "disabled" : ""}>-</button>
                  <span data-auto-range-value="${loopKey}">${intervalLabelText(intervalMinute)}</span>
                  <button data-auto-range-step="${loopKey}" data-step="1" ${busy ? "disabled" : ""}>+</button>
                </div>
              </div>
            </div>
            <div class="automation-actions-lane ${cfg.enable_auto ? "" : "is-hidden"}" data-auto-actions-lane="${loopKey}">
              <div class="automation-action-list" data-auto-action-list="${loopKey}">
                ${actionButtons}
              </div>
            </div>
          </div>
        </section>
      `;
    }

    function render() {
      if (!refs.automationPanel) return;
      const visibleLoopKeys = getVisibleLoopKeys();
      if (popoverLoop && !visibleLoopKeys.includes(popoverLoop)) {
        popoverLoop = "";
      }
      refs.automationPanel.innerHTML = visibleLoopKeys.map((loopKey) => buildLoopRow(loopKey)).join("");
      updateCountdownVisuals();
    }

    function updateCountdownVisuals() {
      if (!refs.automationPanel) return;
      const burstChanged = stepBurstPlayback(Date.now());
      const visibleLoopKeys = getVisibleLoopKeys();
      for (const loopKey of visibleLoopKeys) {
        const cfg = getLoopConfig(loopKey);
        const runtime = getRuntimeLoop(loopKey);
        const intervalSec = Math.max(1, Math.round(Number(cfg.base_minute || 1) * 60));
        const remainingSec = Math.max(0, Number(runtime.remaining_sec || 0));
        const ringProgress = clamp(1 - (remainingSec / intervalSec), 0, 1);
        const dashOffset = RING_CIRCUMFERENCE * (1 - ringProgress);
        const timeNode = refs.automationPanel.querySelector(`[data-auto-remaining="${loopKey}"]`);
        if (timeNode) {
          timeNode.textContent = state.runtime?.is_ready ? formatRemainingTime(remainingSec) : "--:--";
        }
        const circle = refs.automationPanel.querySelector(`[data-auto-ring-progress="${loopKey}"]`);
        if (circle) {
          circle.style.strokeDashoffset = dashOffset.toFixed(3);
        }
      }
      if (burstChanged) {
        render();
      }
    }

    async function ensureConfigLoaded() {
      if (isPlainObject(state.config?.data) && Object.keys(state.config.data).length > 0) {
        return state.config.data;
      }
      if (loadingConfigPromise) {
        return loadingConfigPromise;
      }
      if (typeof requestFn !== "function") {
        return {};
      }
      loadingConfigPromise = (async () => {
        try {
          const data = await requestFn("/api/config");
          if (typeof setConfigData === "function") {
            setConfigData(data || {});
          } else {
            state.config.data = deepClone(data || {});
          }
          return state.config?.data || {};
        } finally {
          loadingConfigPromise = null;
        }
      })();
      return loadingConfigPromise;
    }

    async function updateLoopConfig(loopKey, patch, successMessage, options = {}) {
      const silent = Boolean(options && options.silent);
      await ensureConfigLoaded();
      if (typeof requestFn !== "function") return;
      if (loopBusy.has(loopKey)) return;
      loopBusy.add(loopKey);
      render();
      try {
        const payload = { [loopKey]: patch };
        const data = await requestFn("/api/config", {
          method: "POST",
          body: JSON.stringify({ config: payload })
        });
        if (typeof setConfigData === "function") {
          setConfigData(data?.config || {});
        } else if (isPlainObject(data?.config)) {
          state.config.data = deepClone(data.config);
        }
        state.runtime = data?.runtime || state.runtime;
        state.account = data?.account || state.account;
        syncRuntimeSnapshot();
        if (typeof onRuntimeAccountChanged === "function") {
          onRuntimeAccountChanged();
        }
        if (successMessage && !silent) {
          toast(successMessage, "success");
        }
      } catch (error) {
        if (!silent) {
          toast(`保存失败: ${error.message || "unknown"}`, "error");
        }
      } finally {
        loopBusy.delete(loopKey);
        render();
      }
    }

    async function toggleLoopEnabled(loopKey) {
      const cfg = getLoopConfig(loopKey);
      await updateLoopConfig(loopKey, { enable_auto: !cfg.enable_auto }, "", { silent: true });
    }

    async function toggleLoopAction(loopKey, actionValue) {
      const cfg = getLoopConfig(loopKey);
      const current = dedupStringArray(cfg.actions);
      const index = current.indexOf(actionValue);
      let nextActions;
      if (index >= 0) {
        nextActions = current.filter((item) => item !== actionValue);
      } else {
        nextActions = normalizeActions(loopKey, current.concat([actionValue]));
      }
      await updateLoopConfig(loopKey, { actions: nextActions }, "", { silent: true });
    }

    async function commitLoopInterval(loopKey, minutes) {
      const def = LOOP_DEFS[loopKey];
      const minute = clamp(Math.round(Number(minutes || 0)), def.minMinute, def.maxMinute);
      draftMinute[loopKey] = minute;
      await updateLoopConfig(loopKey, { base_minute: minute }, "", { silent: true });
    }

    function closePopover() {
      if (!popoverLoop) return;
      popoverLoop = "";
      render();
    }

    async function onPanelClick(event) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const ringBtn = target.closest("[data-auto-ring]");
      if (ringBtn) {
        const loopKey = String(ringBtn.getAttribute("data-auto-ring") || "");
        if (!LOOP_DEFS[loopKey]) return;
        popoverLoop = "";
        await toggleLoopEnabled(loopKey);
        return;
      }

      const actionBtn = target.closest("[data-auto-action-loop][data-auto-action-value]");
      if (actionBtn) {
        const loopKey = String(actionBtn.getAttribute("data-auto-action-loop") || "");
        const actionValue = String(actionBtn.getAttribute("data-auto-action-value") || "");
        if (LOOP_DEFS[loopKey] && actionValue) {
          await toggleLoopAction(loopKey, actionValue);
        }
        return;
      }

      const stepBtn = target.closest("[data-auto-range-step][data-step]");
      if (stepBtn) {
        const loopKey = String(stepBtn.getAttribute("data-auto-range-step") || "");
        const def = LOOP_DEFS[loopKey];
        if (!def) return;
        const step = Number(stepBtn.getAttribute("data-step") || 0);
        const base = Number(draftMinute[loopKey] || getLoopConfig(loopKey).base_minute);
        const minute = clamp(Math.round(base + step), def.minMinute, def.maxMinute);
        draftMinute[loopKey] = minute;
        const range = refs.automationPanel?.querySelector(`[data-auto-range="${loopKey}"]`);
        if (range) {
          range.value = String(minute);
        }
        const label = refs.automationPanel?.querySelector(`[data-auto-range-value="${loopKey}"]`);
        if (label) {
          label.textContent = intervalLabelText(minute);
        }
      }
    }

    function onPanelContextMenu(event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const ringBtn = target.closest("[data-auto-ring]");
      if (!ringBtn) return;
      event.preventDefault();
      const loopKey = String(ringBtn.getAttribute("data-auto-ring") || "");
      if (!LOOP_DEFS[loopKey]) return;
      const cfg = getLoopConfig(loopKey);
      draftMinute[loopKey] = cfg.base_minute;
      popoverLoop = popoverLoop === loopKey ? "" : loopKey;
      render();
    }

    function onPanelInput(event) {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (!target.matches("[data-auto-range]")) return;
      const loopKey = String(target.getAttribute("data-auto-range") || "");
      const def = LOOP_DEFS[loopKey];
      if (!def) return;
      const minute = clamp(Math.round(Number(target.value || def.minMinute)), def.minMinute, def.maxMinute);
      draftMinute[loopKey] = minute;
      const label = refs.automationPanel?.querySelector(`[data-auto-range-value="${loopKey}"]`);
      if (label) {
        label.textContent = intervalLabelText(minute);
      }
    }

    async function onPanelChange(event) {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (!target.matches("[data-auto-range]")) return;
      const loopKey = String(target.getAttribute("data-auto-range") || "");
      const def = LOOP_DEFS[loopKey];
      if (!def) return;
      const minute = clamp(Math.round(Number(target.value || def.minMinute)), def.minMinute, def.maxMinute);
      await commitLoopInterval(loopKey, minute);
    }

    function bindEvents() {
      if (bound || !refs.automationPanel) return;
      refs.automationPanel.addEventListener("click", (event) => {
        void onPanelClick(event);
      });
      refs.automationPanel.addEventListener("contextmenu", onPanelContextMenu);
      refs.automationPanel.addEventListener("input", onPanelInput);
      refs.automationPanel.addEventListener("change", (event) => {
        void onPanelChange(event);
      });
      handleOutsideClickRef = (event) => {
        if (!popoverLoop) return;
        const target = event.target;
        if (!(target instanceof Node)) return;
        if (refs.automationPanel?.contains(target)) return;
        closePopover();
      };
      document.addEventListener("click", handleOutsideClickRef, true);
      bound = true;
    }

    function startCountdown() {
      if (countdownTimer) {
        clearInterval(countdownTimer);
      }
      countdownTimer = window.setInterval(updateCountdownVisuals, 250);
    }

    function stopCountdown() {
      if (!countdownTimer) return;
      clearInterval(countdownTimer);
      countdownTimer = 0;
    }

    async function init() {
      if (!refs.automationPanel) return;
      bindEvents();
      syncRuntimeSnapshot();
      render();
      startCountdown();
      try {
        await ensureConfigLoaded();
      } catch (error) {
        toast(`加载自动化配置失败: ${error.message || "unknown"}`, "error");
      }
      render();
    }

    function onRuntimeUpdated() {
      syncRuntimeSnapshot();
      render();
    }

    function onConfigUpdated() {
      render();
    }

    function destroy() {
      stopCountdown();
      if (handleOutsideClickRef) {
        document.removeEventListener("click", handleOutsideClickRef, true);
        handleOutsideClickRef = null;
      }
      bound = false;
    }

    return {
      init,
      onRuntimeUpdated,
      onConfigUpdated,
      onActionEvent,
      destroy
    };
  };
})();
