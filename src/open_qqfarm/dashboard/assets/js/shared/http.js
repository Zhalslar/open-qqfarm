async function req(url, options = {}) {
  const customHeaders = options.headers || {};
  const resp = await fetch(url, {
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...customHeaders },
    ...options
  });
  const data = await resp.json();
  if (!resp.ok || data.status !== "ok") {
    throw new Error(data.message || t("request_failed"));
  }
  return data.data;
}

async function withButtonLoading(btn, task) {
  if (!btn) {
    return task();
  }
  if (btn.dataset.loading === "1") {
    return;
  }
  btn.dataset.loading = "1";
  btn.disabled = true;
  btn.classList.add("is-loading");
  try {
    return await task();
  } finally {
    btn.dataset.loading = "0";
    btn.disabled = false;
    btn.classList.remove("is-loading");
  }
}
