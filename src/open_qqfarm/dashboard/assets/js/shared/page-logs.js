(function () {
  const shared = (window.openQQFarmShared = window.openQQFarmShared || {});

  shared.createPageLogs = function createPageLogs({
    refs,
    state,
    request,
    escapeHtml,
    formatLogTime,
    openPanel,
    normalizeActionEvent,
    onActionEvent
  }) {
    const reqFn = typeof request === "function" ? request : window.req;
    const escape = typeof escapeHtml === "function"
      ? escapeHtml
      : (value) => String(value || "");
    const fmtLogTime = typeof formatLogTime === "function"
      ? formatLogTime
      : (value) => String(value || "");
    const openPanelFn = typeof openPanel === "function" ? openPanel : () => {};
    const normalizeEvent = typeof normalizeActionEvent === "function"
      ? normalizeActionEvent
      : () => null;
    const emitActionEvent = typeof onActionEvent === "function"
      ? onActionEvent
      : () => {};

    function setLogStatus(text) {
      state.logStatusText = String(text || "");
    }

    function actionEventFromLogRow(row) {
      if (!row || typeof row !== "object") return null;
      const fields = row.fields && typeof row.fields === "object" ? row.fields : null;
      if (!fields) return null;
      if (String(fields.event || "").trim().toLowerCase() !== "farm_action") {
        return null;
      }
      return normalizeEvent({
        seq: row.seq,
        ts: row.ts,
        source: fields.source,
        loop: fields.loop,
        op: fields.op,
        count: fields.count,
        effective: fields.effective,
        gid: fields.gid,
        land_id: fields.land_id,
        goods_id: fields.goods_id,
        item_id: fields.item_id
      });
    }

    function appendLogRow(row, options = {}) {
      const shouldDispatchAction = Boolean(options?.dispatchAction);
      if (!row) return;
      const seq = Number(row.seq || 0);
      if (seq > state.lastLogSeq) {
        state.lastLogSeq = seq;
      }
      state.logs.push(row);
      while (state.logs.length > 260) {
        state.logs.shift();
      }
      if (shouldDispatchAction) {
        const actionEvent = actionEventFromLogRow(row);
        if (actionEvent) {
          emitActionEvent(actionEvent);
        }
      }
      if (state.panelOpen && state.panelMode === "logs") {
        renderLogsPanel();
      }
    }

    function renderLogsPanel() {
      refs.panelBody.classList.remove("warehouse-grid", "owner-detail", "shop-grid-view", "config-view");
      refs.panelBody.classList.add("logs-view");
      if (!Array.isArray(state.logs) || state.logs.length === 0) {
        refs.panelBody.innerHTML = "<div class='data-row'><div class='data-main'>暂无日志</div></div>";
        return;
      }
      const html = state.logs.map((row) => {
        const fieldsText = row.fields && Object.keys(row.fields).length
          ? `<div>${escape(JSON.stringify(row.fields))}</div>`
          : "";
        return `
          <div class="log-item">
            <div class="line-top">
              <span class="log-level ${escape(row.level || "")}">${escape(row.level || "INFO")}</span>
              <span>${escape(fmtLogTime(row.ts))}</span>
            </div>
            <div>${escape(row.msg || "")}</div>
            ${fieldsText}
          </div>
        `;
      }).join("");
      refs.panelBody.innerHTML = html;
      refs.panelBody.scrollTop = refs.panelBody.scrollHeight;
    }

    function showLogsPanel() {
      openPanelFn("实时日志", "logs");
      renderLogsPanel();
    }

    async function loadLogBackfill() {
      try {
        const rows = await reqFn("/api/logs?limit=120");
        state.logs = [];
        for (const row of rows) {
          appendLogRow(row, { dispatchAction: false });
        }
      } catch (error) {
        setLogStatus(`log error: ${error.message || "unknown"}`);
      }
    }

    function stopLogStream() {
      if (state.logSource) {
        state.logSource.close();
        state.logSource = null;
      }
      if (state.logPollTimer) {
        clearInterval(state.logPollTimer);
        state.logPollTimer = null;
      }
      if (state.logReconnectTimer) {
        clearTimeout(state.logReconnectTimer);
        state.logReconnectTimer = null;
      }
    }

    async function pollLogs() {
      try {
        const rows = await reqFn(`/api/logs?since=${state.lastLogSeq}&limit=120`);
        for (const row of rows) {
          appendLogRow(row, { dispatchAction: true });
        }
      } catch (error) {
        setLogStatus(`poll error: ${error.message || "unknown"}`);
      }
    }

    function connectLogStream() {
      stopLogStream();
      if (!window.EventSource) {
        setLogStatus("polling");
        state.logPollTimer = setInterval(pollLogs, 2000);
        return;
      }
      const url = `/api/logs/stream?since=${state.lastLogSeq}`;
      const source = new EventSource(url);
      state.logSource = source;
      setLogStatus("stream connecting");

      source.addEventListener("log", (event) => {
        try {
          const row = JSON.parse(event.data || "{}");
          appendLogRow(row, { dispatchAction: true });
        } catch (_err) {
        }
      });

      source.onopen = () => {
        setLogStatus("stream live");
      };

      source.onerror = () => {
        setLogStatus("stream retrying");
        source.close();
        state.logSource = null;
        state.logReconnectTimer = setTimeout(connectLogStream, 2200);
      };
    }

    return {
      showLogsPanel,
      loadLogBackfill,
      stopLogStream,
      connectLogStream
    };
  };
})();
