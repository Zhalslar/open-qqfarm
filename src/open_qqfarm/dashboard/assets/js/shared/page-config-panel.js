(function () {
  const shared = (window.openQQFarmShared = window.openQQFarmShared || {});

  shared.createPageConfigPanel = function createPageConfigPanel({
    refs,
    state,
    escapeHtml,
    clampValue
  }) {
    const safeClamp = typeof clampValue === "function"
      ? clampValue
      : (value, min, max) => Math.min(max, Math.max(min, value));

    const DEFAULT_CONFIG = {
      account: {
        uin: "",
        auth_code: ""
      },
      farm: {
        enable_auto: true,
        actions: ["weed", "insect", "water", "harvest", "sell", "buy_seed", "remove", "unlock", "upgrade", "plant"],
        base_minute: 5,
        harvest_sell: true,
        seed_mode: "preferred_id",
        preferred_seed_id: 20002,
        normal_fertilize: false,
        organic_fertilize: false
      },
      friend: {
        enable_auto: true,
        actions: ["steal", "help_water", "help_weed", "help_insect"],
        base_minute: 60,
        put_insect_count: 1,
        put_weed_count: 1,
        whitelist: [],
        blacklist: [],
        steal: true,
        help: true,
        bad: false
      },
      notify: {
        actions: [
          "LandsNotify",
          "ItemNotify",
          "TaskInfoNotify",
          "FriendApplicationReceivedNotify",
          "BasicNotify",
          "Kickout"
        ]
      },
      auto_reward: true,
      client: {
        client_version: "",
        appid: "",
        platform: "qq",
        os: "iOS",
        sys_software: "",
        network: "wifi",
        memory: 7672,
        device_id: ""
      },
      user_heartbeat: 30,
      ws_heartbeat: 30,
      rpc_timeout: 25,
      step_interval: 0.2
    };

    const TOGGLE_FIELDS = [
      {
        path: "farm.enable_auto",
        label: "自动处理自家农场",
        note: "开启后会自动执行收获、浇水、除草等动作。"
      },
      {
        path: "friend.enable_auto",
        label: "自动处理好友农场",
        note: "开启后会按策略去好友农场执行动作。"
      },
      {
        path: "auto_reward",
        label: "自动领取任务奖励",
        note: "收到任务更新时自动尝试领奖。"
      }
    ];

    const RANGE_FIELDS = [
      {
        id: "farm_base_minute",
        path: "farm.base_minute",
        label: "自家任务基础间隔",
        note: "每轮自家农场任务的基础等待时间。",
        min: 1,
        max: 240,
        step: 1,
        unit: "分钟"
      },
      {
        id: "friend_base_minute",
        path: "friend.base_minute",
        label: "好友任务基础间隔",
        note: "每轮好友任务的基础等待时间。",
        min: 5,
        max: 360,
        step: 1,
        unit: "分钟"
      },
      {
        id: "friend_put_insect_count",
        path: "friend.put_insect_count",
        label: "每次放虫地块数",
        note: "捣乱模式下每轮最多放虫多少块地。",
        min: 0,
        max: 24,
        step: 1,
        unit: "块"
      },
      {
        id: "friend_put_weed_count",
        path: "friend.put_weed_count",
        label: "每次放草地块数",
        note: "捣乱模式下每轮最多放草多少块地。",
        min: 0,
        max: 24,
        step: 1,
        unit: "块"
      },
      {
        id: "user_heartbeat",
        path: "user_heartbeat",
        label: "用户心跳间隔",
        note: "与服务器同步在线状态的周期。",
        min: 5,
        max: 120,
        step: 1,
        unit: "秒"
      },
      {
        id: "ws_heartbeat",
        path: "ws_heartbeat",
        label: "WebSocket 心跳间隔",
        note: "维持长连接活跃的周期。",
        min: 5,
        max: 120,
        step: 1,
        unit: "秒"
      },
      {
        id: "rpc_timeout",
        path: "rpc_timeout",
        label: "RPC 超时时间",
        note: "单次请求最长等待时间。",
        min: 5,
        max: 180,
        step: 1,
        unit: "秒"
      },
      {
        id: "step_interval",
        path: "step_interval",
        label: "动作最小间隔",
        note: "每个动作之间停顿，建议不要太小。",
        min: 0.05,
        max: 2,
        step: 0.05,
        unit: "秒"
      }
    ];

    const SELECT_FIELDS = [
      {
        path: "farm.seed_mode",
        label: "自动选种策略",
        note: "控制空地自动种植时的选种逻辑。",
        options: [
          { value: "preferred_id", label: "按指定种子 ID" },
          { value: "max_exp", label: "按每小时经验最高" },
          { value: "max_fert_exp", label: "按化肥后每小时经验最高" },
          { value: "max_profit", label: "按每小时收益最高" },
          { value: "max_fert_profit", label: "按化肥后每小时收益最高" },
          { value: "max_item_id", label: "按种子 ID 最大" }
        ]
      }
    ];

    const TEXT_FIELDS = [
      {
        path: "farm.preferred_seed_id",
        label: "指定种子 ID",
        note: "当选种策略为“按指定种子 ID”时使用。",
        type: "number",
        min: 1,
        max: 99999
      }
    ];

    const LIST_FIELDS = [
      {
        path: "friend.whitelist",
        label: "好友白名单",
        note: "一行一个 GID，留空表示不限制。"
      },
      {
        path: "friend.blacklist",
        label: "好友黑名单",
        note: "一行一个 GID，命中后跳过。"
      }
    ];

    const ACTION_GROUPS = [
      {
        path: "farm.actions",
        title: "自家农场动作",
        note: "控制自动流程要执行的动作。",
        options: [
          { value: "weed", label: "除草" },
          { value: "insect", label: "除虫" },
          { value: "water", label: "浇水" },
          { value: "harvest", label: "收获" },
          { value: "sell", label: "卖果实" },
          { value: "buy_seed", label: "购种" },
          { value: "remove", label: "清枯作物" },
          { value: "unlock", label: "解锁地块" },
          { value: "upgrade", label: "升级地块" },
          { value: "plant", label: "种植" },
          { value: "normal_fertilize", label: "普通化肥" },
          { value: "organic_fertilize", label: "有机化肥" }
        ]
      },
      {
        path: "friend.actions",
        title: "好友农场动作",
        note: "控制自动访问好友时可执行的动作。",
        options: [
          { value: "steal", label: "偷菜" },
          { value: "help_water", label: "帮浇水" },
          { value: "help_weed", label: "帮除草" },
          { value: "help_insect", label: "帮除虫" },
          { value: "put_insect", label: "放虫" },
          { value: "put_weed", label: "放草" }
        ]
      }
    ];

    const actionOrderByPath = new Map(
      ACTION_GROUPS.map((group) => [group.path, group.options.map((item) => item.value)])
    );
    const rangeByPath = new Map(RANGE_FIELDS.map((field) => [field.path, field]));
    const textByPath = new Map(TEXT_FIELDS.map((field) => [field.path, field]));
    const selectByPath = new Map(SELECT_FIELDS.map((field) => [field.path, field]));

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

    function getByPath(source, path, fallback) {
      const keys = String(path || "").split(".").filter(Boolean);
      let cursor = source;
      for (const key of keys) {
        if (!isPlainObject(cursor) || !(key in cursor)) {
          return fallback;
        }
        cursor = cursor[key];
      }
      return cursor === undefined ? fallback : cursor;
    }

    function setByPath(target, path, value) {
      const keys = String(path || "").split(".").filter(Boolean);
      if (keys.length <= 0) return;
      let cursor = target;
      for (let i = 0; i < keys.length - 1; i += 1) {
        const key = keys[i];
        if (!isPlainObject(cursor[key])) {
          cursor[key] = {};
        }
        cursor = cursor[key];
      }
      cursor[keys[keys.length - 1]] = value;
    }

    function ensureArrayStrings(raw, fallback = []) {
      const base = Array.isArray(raw) ? raw : fallback;
      const dedup = new Set();
      for (const item of base) {
        const text = String(item || "").trim();
        if (!text) continue;
        dedup.add(text);
      }
      return Array.from(dedup);
    }

    function parseListText(raw) {
      const text = String(raw || "");
      return ensureArrayStrings(text.split(/[\n,，\s]+/g), []);
    }

    function countDecimals(step) {
      const text = String(step || "1");
      const index = text.indexOf(".");
      if (index < 0) return 0;
      return Math.max(0, text.length - index - 1);
    }

    function normalizeNumber(raw, field, fallbackValue) {
      const fallback = Number(fallbackValue);
      let value = Number(raw);
      if (!Number.isFinite(value)) {
        value = Number.isFinite(fallback) ? fallback : Number(field.min || 0);
      }
      const min = Number(field.min);
      const max = Number(field.max);
      if (Number.isFinite(min) && Number.isFinite(max)) {
        value = safeClamp(value, min, max);
      }
      const step = Math.abs(Number(field.step || 1));
      if (step > 0) {
        const decimals = countDecimals(step);
        value = Math.round(value / step) * step;
        value = Number(value.toFixed(decimals));
      }
      return value;
    }

    function formatNumberValue(value, step) {
      const n = Number(value);
      if (!Number.isFinite(n)) return "0";
      const decimals = countDecimals(step);
      if (decimals <= 0) {
        return `${Math.round(n)}`;
      }
      return n.toFixed(decimals).replace(/(\.\d*?[1-9])0+$/g, "$1").replace(/\.0+$/g, "");
    }

    function formatRangeValue(field, value) {
      const unit = String(field.unit || "").trim();
      const text = formatNumberValue(value, field.step);
      return unit ? `${text} ${unit}` : text;
    }

    function normalizeConfigData(rawConfig) {
      const config = isPlainObject(rawConfig) ? deepClone(rawConfig) : {};

      for (const field of TOGGLE_FIELDS) {
        const fallback = getByPath(DEFAULT_CONFIG, field.path, false);
        const raw = getByPath(config, field.path, fallback);
        setByPath(config, field.path, Boolean(raw));
      }

      for (const field of RANGE_FIELDS) {
        const fallback = getByPath(DEFAULT_CONFIG, field.path, field.min || 0);
        const raw = getByPath(config, field.path, fallback);
        setByPath(config, field.path, normalizeNumber(raw, field, fallback));
      }

      for (const field of SELECT_FIELDS) {
        const fallback = getByPath(DEFAULT_CONFIG, field.path, field.options[0]?.value || "");
        const raw = String(getByPath(config, field.path, fallback) || "");
        const found = field.options.some((item) => item.value === raw);
        setByPath(config, field.path, found ? raw : fallback);
      }

      for (const field of TEXT_FIELDS) {
        const fallback = getByPath(DEFAULT_CONFIG, field.path, "");
        const raw = getByPath(config, field.path, fallback);
        if (field.type === "number") {
          const min = Number(field.min);
          const max = Number(field.max);
          let value = Number(raw);
          if (!Number.isFinite(value)) {
            value = Number(fallback || 0);
          }
          if (Number.isFinite(min) && Number.isFinite(max)) {
            value = safeClamp(value, min, max);
          }
          setByPath(config, field.path, Math.round(value));
          continue;
        }
        setByPath(config, field.path, String(raw ?? ""));
      }

      for (const field of LIST_FIELDS) {
        const fallback = getByPath(DEFAULT_CONFIG, field.path, []);
        const raw = getByPath(config, field.path, fallback);
        setByPath(config, field.path, ensureArrayStrings(raw, fallback));
      }

      for (const group of ACTION_GROUPS) {
        const fallback = getByPath(DEFAULT_CONFIG, group.path, []);
        const selected = ensureArrayStrings(getByPath(config, group.path, fallback), fallback);
        const order = actionOrderByPath.get(group.path) || [];
        const normalized = selected
          .filter((value) => order.includes(value))
          .sort((a, b) => order.indexOf(a) - order.indexOf(b));
        setByPath(config, group.path, normalized);
      }

      return config;
    }

    function getConfigData() {
      if (!isPlainObject(state?.config?.data)) {
        state.config.data = normalizeConfigData({});
      }
      return state.config.data;
    }

    function setConfigData(rawConfig) {
      state.config.data = normalizeConfigData(rawConfig);
      return state.config.data;
    }

    function renderToggleField(field, configData) {
      const on = Boolean(getByPath(configData, field.path, false));
      return `
        <article class="cfg-item">
          <div class="cfg-item-main">
            <div class="cfg-item-title">${escapeHtml(field.label)}</div>
            <div class="cfg-item-note">${escapeHtml(field.note)}</div>
          </div>
          <button type="button" class="cfg-toggle ${on ? "is-on" : ""}" role="switch" aria-checked="${on ? "true" : "false"}" data-config-toggle-path="${escapeHtml(field.path)}">
            <span class="cfg-toggle-track"><span class="cfg-toggle-thumb"></span></span>
            <span class="cfg-toggle-state" data-toggle-state>${on ? "开" : "关"}</span>
          </button>
        </article>
      `;
    }

    function renderRangeField(field, configData) {
      const value = normalizeNumber(getByPath(configData, field.path, field.min), field, field.min);
      const valueText = formatRangeValue(field, value);
      return `
        <article class="cfg-item cfg-item-block">
          <div class="cfg-item-title">${escapeHtml(field.label)}</div>
          <div class="cfg-item-note">${escapeHtml(field.note)}</div>
          <div class="cfg-range-row">
            <input
              class="cfg-range"
              type="range"
              min="${field.min}"
              max="${field.max}"
              step="${field.step}"
              value="${value}"
              data-config-range-path="${escapeHtml(field.path)}"
              data-config-range-id="${escapeHtml(field.id)}"
            />
            <span class="cfg-range-value" data-range-value-id="${escapeHtml(field.id)}">${escapeHtml(valueText)}</span>
          </div>
        </article>
      `;
    }

    function renderSelectField(field, configData) {
      const selected = String(getByPath(configData, field.path, field.options[0]?.value || "") || "");
      const options = field.options.map((item) => `
        <option value="${escapeHtml(item.value)}" ${item.value === selected ? "selected" : ""}>${escapeHtml(item.label)}</option>
      `).join("");
      return `
        <article class="cfg-item cfg-item-block">
          <div class="cfg-item-title">${escapeHtml(field.label)}</div>
          <div class="cfg-item-note">${escapeHtml(field.note)}</div>
          <select class="cfg-select" data-config-select-path="${escapeHtml(field.path)}">
            ${options}
          </select>
        </article>
      `;
    }

    function renderTextField(field, configData) {
      const raw = getByPath(configData, field.path, "");
      const value = field.type === "number" ? String(Math.round(Number(raw || 0))) : String(raw ?? "");
      return `
        <article class="cfg-item cfg-item-block">
          <div class="cfg-item-title">${escapeHtml(field.label)}</div>
          <div class="cfg-item-note">${escapeHtml(field.note)}</div>
          <input
            class="cfg-input"
            type="${field.type === "number" ? "number" : "text"}"
            value="${escapeHtml(value)}"
            ${field.type === "number" ? `min="${Number(field.min || 0)}" max="${Number(field.max || 999999)}" step="1"` : ""}
            data-config-text-path="${escapeHtml(field.path)}"
          />
        </article>
      `;
    }

    function renderListField(field, configData) {
      const rows = ensureArrayStrings(getByPath(configData, field.path, []), []);
      return `
        <article class="cfg-item cfg-item-block">
          <div class="cfg-item-title">${escapeHtml(field.label)}</div>
          <div class="cfg-item-note">${escapeHtml(field.note)}</div>
          <textarea class="cfg-textarea" rows="3" data-config-list-path="${escapeHtml(field.path)}">${escapeHtml(rows.join("\n"))}</textarea>
        </article>
      `;
    }

    function renderActionGroup(group, configData) {
      const selected = new Set(ensureArrayStrings(getByPath(configData, group.path, []), []));
      const chips = group.options.map((option) => {
        const on = selected.has(option.value);
        return `
          <button
            type="button"
            class="cfg-chip ${on ? "is-on" : ""}"
            data-config-action-group="${escapeHtml(group.path)}"
            data-config-action-value="${escapeHtml(option.value)}"
            aria-pressed="${on ? "true" : "false"}"
          >
            ${escapeHtml(option.label)}
          </button>
        `;
      }).join("");
      return `
        <article class="cfg-item cfg-item-block">
          <div class="cfg-item-title">${escapeHtml(group.title)}</div>
          <div class="cfg-item-note">${escapeHtml(group.note)}</div>
          <div class="cfg-chip-group">${chips}</div>
        </article>
      `;
    }

    function renderConfigPanel() {
      const configData = getConfigData();
      const error = String(state.config.error || "").trim();
      const farmPrimaryToggleField = TOGGLE_FIELDS.find((field) => field.path === "farm.enable_auto") || null;
      const friendPrimaryToggleField = TOGGLE_FIELDS.find((field) => field.path === "friend.enable_auto") || null;
      const moreToggleFields = TOGGLE_FIELDS.filter((field) => field.path === "auto_reward");
      const farmPrimaryRangeField = RANGE_FIELDS.find((field) => field.path === "farm.base_minute") || null;
      const friendPrimaryRangeField = RANGE_FIELDS.find((field) => field.path === "friend.base_minute") || null;
      const friendExtraRangeFields = RANGE_FIELDS.filter((field) =>
        field.path.startsWith("friend.") && field.path !== "friend.base_minute"
      );
      const moreRangeFields = RANGE_FIELDS.filter((field) =>
        ["user_heartbeat", "ws_heartbeat", "rpc_timeout", "step_interval"].includes(field.path)
      );
      const farmSelectFields = SELECT_FIELDS.filter((field) => field.path.startsWith("farm."));
      const farmTextFields = TEXT_FIELDS.filter((field) => field.path.startsWith("farm."));
      const farmActionGroup = ACTION_GROUPS.find((group) => group.path === "farm.actions") || null;
      const friendActionGroup = ACTION_GROUPS.find((group) => group.path === "friend.actions") || null;
      const friendListFields = LIST_FIELDS.filter((field) => field.path.startsWith("friend."));

      refs.panelBody.classList.remove("warehouse-grid", "warehouse-page", "owner-detail", "logs-view", "login-view", "shop-grid-view");
      refs.panelBody.classList.add("config-view");
      refs.panelBody.innerHTML = `
        <section class="config-dashboard">
          <div class="config-intro">
            <div class="config-title">可视化配置面板</div>
            <div class="config-tip">按配置文件结构分组展示。未展示的配置会保留原值，不会丢失。</div>
          </div>
          ${error ? `<div class="config-error">${escapeHtml(error)}</div>` : ""}

          <div class="cfg-sections-pair">
            <section class="cfg-section cfg-section-cycle cfg-section-farm">
              <div class="cfg-section-title">自家农场循环</div>
              <div class="cfg-section-sub">对应 config.farm，控制自家农场自动流程。</div>
              <div class="cfg-list">
                ${farmPrimaryToggleField ? renderToggleField(farmPrimaryToggleField, configData) : ""}
                ${farmPrimaryRangeField ? renderRangeField(farmPrimaryRangeField, configData) : ""}
                ${farmActionGroup ? renderActionGroup(farmActionGroup, configData) : ""}
              </div>
              <div class="cfg-grid cfg-grid-farm-tail">
                ${farmSelectFields.map((field) => renderSelectField(field, configData)).join("")}
                ${farmTextFields.map((field) => renderTextField(field, configData)).join("")}
              </div>
            </section>

            <section class="cfg-section cfg-section-cycle cfg-section-friend">
              <div class="cfg-section-title">好友农场循环</div>
              <div class="cfg-section-sub">对应 config.friend，控制访问好友农场的自动流程。</div>
              <div class="cfg-list">
                ${friendPrimaryToggleField ? renderToggleField(friendPrimaryToggleField, configData) : ""}
                ${friendPrimaryRangeField ? renderRangeField(friendPrimaryRangeField, configData) : ""}
                ${friendActionGroup ? renderActionGroup(friendActionGroup, configData) : ""}
              </div>
              <div class="cfg-grid">
                ${friendExtraRangeFields.map((field) => renderRangeField(field, configData)).join("")}
              </div>
              <div class="cfg-grid">
                ${friendListFields.map((field) => renderListField(field, configData)).join("")}
              </div>
            </section>
          </div>

          <section class="cfg-section">
            <div class="cfg-section-title">更多配置</div>
            <div class="cfg-section-sub">包含奖励与执行节奏相关的全局参数。</div>
            <div class="cfg-list">
              ${moreToggleFields.map((field) => renderToggleField(field, configData)).join("")}
            </div>
            <div class="cfg-grid">
              ${moreRangeFields.map((field) => renderRangeField(field, configData)).join("")}
            </div>
          </section>

        </section>
      `;
    }

    function paintToggleButton(btn, on) {
      if (!btn) return;
      const enabled = Boolean(on);
      btn.classList.toggle("is-on", enabled);
      btn.setAttribute("aria-checked", enabled ? "true" : "false");
      const text = btn.querySelector("[data-toggle-state]");
      if (text) {
        text.textContent = enabled ? "开" : "关";
      }
    }

    function paintActionChip(btn, on) {
      if (!btn) return;
      const enabled = Boolean(on);
      btn.classList.toggle("is-on", enabled);
      btn.setAttribute("aria-pressed", enabled ? "true" : "false");
    }

    function updateRangeDisplayById(id, path) {
      if (!refs.panelBody) return;
      const label = refs.panelBody.querySelector(`[data-range-value-id="${id}"]`);
      if (!label) return;
      const field = rangeByPath.get(path);
      if (!field) return;
      const value = getByPath(getConfigData(), path, field.min);
      label.textContent = formatRangeValue(field, value);
    }

    function handleInputEvent(event) {
      if (!(event?.target instanceof Element)) {
        return false;
      }
      const data = getConfigData();

      const rangeInput = event.target.closest("input[data-config-range-path]");
      if (rangeInput) {
        const path = String(rangeInput.getAttribute("data-config-range-path") || "");
        const rangeId = String(rangeInput.getAttribute("data-config-range-id") || "");
        const field = rangeByPath.get(path);
        if (!field) return false;
        const fallback = getByPath(DEFAULT_CONFIG, path, field.min);
        const value = normalizeNumber(rangeInput.value, field, fallback);
        setByPath(data, path, value);
        rangeInput.value = String(value);
        updateRangeDisplayById(rangeId, path);
        return true;
      }

      const selectInput = event.target.closest("select[data-config-select-path]");
      if (selectInput) {
        const path = String(selectInput.getAttribute("data-config-select-path") || "");
        const field = selectByPath.get(path);
        if (!field) return false;
        const value = String(selectInput.value || "");
        const allowed = field.options.some((option) => option.value === value);
        setByPath(data, path, allowed ? value : field.options[0]?.value || "");
        return true;
      }

      const textInput = event.target.closest("input[data-config-text-path]");
      if (textInput) {
        const path = String(textInput.getAttribute("data-config-text-path") || "");
        const field = textByPath.get(path);
        if (!field) return false;
        if (field.type === "number") {
          const min = Number(field.min);
          const max = Number(field.max);
          let value = Number(textInput.value || 0);
          if (!Number.isFinite(value)) {
            value = Number(getByPath(DEFAULT_CONFIG, path, 0));
          }
          if (Number.isFinite(min) && Number.isFinite(max)) {
            value = safeClamp(value, min, max);
          }
          value = Math.round(value);
          textInput.value = String(value);
          setByPath(data, path, value);
        } else {
          setByPath(data, path, String(textInput.value || ""));
        }
        return true;
      }

      const listInput = event.target.closest("textarea[data-config-list-path]");
      if (listInput) {
        const path = String(listInput.getAttribute("data-config-list-path") || "");
        setByPath(data, path, parseListText(listInput.value));
        return true;
      }

      return false;
    }

    function handleClickEvent(event) {
      if (!(event?.target instanceof Element)) {
        return false;
      }
      const data = getConfigData();

      const toggleBtn = event.target.closest("[data-config-toggle-path]");
      if (toggleBtn) {
        const path = String(toggleBtn.getAttribute("data-config-toggle-path") || "");
        const current = Boolean(getByPath(data, path, false));
        const next = !current;
        setByPath(data, path, next);
        paintToggleButton(toggleBtn, next);
        return true;
      }

      const chip = event.target.closest("[data-config-action-group][data-config-action-value]");
      if (chip) {
        const path = String(chip.getAttribute("data-config-action-group") || "");
        const value = String(chip.getAttribute("data-config-action-value") || "");
        if (!path || !value) return false;
        const order = actionOrderByPath.get(path) || [];
        let actions = ensureArrayStrings(getByPath(data, path, []), []);
        if (actions.includes(value)) {
          actions = actions.filter((item) => item !== value);
          paintActionChip(chip, false);
        } else {
          actions.push(value);
          paintActionChip(chip, true);
        }
        actions = actions
          .filter((item) => order.includes(item))
          .sort((a, b) => order.indexOf(a) - order.indexOf(b));
        setByPath(data, path, actions);
        return true;
      }

      return false;
    }

    function buildPayload() {
      return deepClone(getConfigData());
    }

    return {
      setConfigData,
      renderConfigPanel,
      handleInputEvent,
      handleClickEvent,
      buildPayload
    };
  };
})();
