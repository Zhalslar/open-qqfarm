(function () {
  const shared = (window.openQQFarmShared = window.openQQFarmShared || {});

  shared.createPageFarmCamera = function createPageFarmCamera({
    refs,
    state,
    clampValue
  }) {
    const clamp = typeof clampValue === "function"
      ? clampValue
      : (value, min, max) => Math.min(max, Math.max(min, value));

    function readFarmCameraBounds(scale) {
      const viewport = refs.farmViewport;
      const grid = refs.landGrid;
      const bgLayer = refs.farmBgLayer;
      if (!viewport || !grid) {
        return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
      }
      const vw = Number(viewport.clientWidth || 0);
      const vh = Number(viewport.clientHeight || 0);
      const baseW = Number(grid.offsetWidth || vw);
      const baseH = Number(grid.offsetHeight || vh);
      const scaledW = baseW * scale;
      const scaledH = baseH * scale;

      let minX = 0;
      let maxX = 0;
      let minY = 0;
      let maxY = 0;

      if (scaledW <= vw) {
        const marginX = Math.min(140, vw * 0.28);
        minX = (vw - scaledW) / 2 - marginX;
        maxX = (vw - scaledW) / 2 + marginX;
      } else {
        minX = vw - scaledW;
        maxX = 0;
      }
      if (scaledH <= vh) {
        const marginY = Math.min(120, vh * 0.28);
        minY = (vh - scaledH) / 2 - marginY;
        maxY = (vh - scaledH) / 2 + marginY;
      } else {
        minY = vh - scaledH;
        maxY = 0;
      }

      if (bgLayer) {
        const bgW = Number(bgLayer.offsetWidth || vw);
        const bgH = Number(bgLayer.offsetHeight || vh);
        const bgLeft = Number(bgLayer.offsetLeft || 0);
        const bgTop = Number(bgLayer.offsetTop || 0);

        // Background layer layout offset should not be scaled.
        // Visible coverage after transform:
        // left = bgLeft + x, right = bgLeft + x + bgW * scale
        // top = bgTop + y, bottom = bgTop + y + bgH * scale
        let bgMinX = vw - bgLeft - bgW * scale;
        let bgMaxX = -bgLeft;
        let bgMinY = vh - bgTop - bgH * scale;
        let bgMaxY = -bgTop;

        if (bgMinX > bgMaxX) {
          const midX = (bgMinX + bgMaxX) / 2;
          bgMinX = midX;
          bgMaxX = midX;
        }
        if (bgMinY > bgMaxY) {
          const midY = (bgMinY + bgMaxY) / 2;
          bgMinY = midY;
          bgMaxY = midY;
        }

        const mergedMinX = Math.max(minX, bgMinX);
        const mergedMaxX = Math.min(maxX, bgMaxX);
        const mergedMinY = Math.max(minY, bgMinY);
        const mergedMaxY = Math.min(maxY, bgMaxY);

        if (mergedMinX <= mergedMaxX) {
          minX = mergedMinX;
          maxX = mergedMaxX;
        } else {
          const targetX = clamp((minX + maxX) / 2, bgMinX, bgMaxX);
          minX = targetX;
          maxX = targetX;
        }
        if (mergedMinY <= mergedMaxY) {
          minY = mergedMinY;
          maxY = mergedMaxY;
        } else {
          const targetY = clamp((minY + maxY) / 2, bgMinY, bgMaxY);
          minY = targetY;
          maxY = targetY;
        }
      }

      return { minX, maxX, minY, maxY };
    }

    function updateLandGridTracks(cols, rows) {
      const grid = refs.landGrid;
      const viewport = refs.farmViewport;
      if (!grid || !viewport) return;

      const safeCols = Math.max(1, Number(cols || 1));
      const safeRows = Math.max(1, Number(rows || 1));
      const style = window.getComputedStyle(grid);
      const padX = Number.parseFloat(style.paddingLeft || "0") + Number.parseFloat(style.paddingRight || "0");
      const padY = Number.parseFloat(style.paddingTop || "0") + Number.parseFloat(style.paddingBottom || "0");
      const gapX = Number.parseFloat(style.columnGap || style.gap || "0");
      const gapY = Number.parseFloat(style.rowGap || style.gap || "0");
      const innerWidth = Math.max(0, Number(viewport.clientWidth || 0) - padX);
      const innerHeight = Math.max(0, Number(viewport.clientHeight || 0) - padY);
      const cellByHeight = (innerHeight - gapY * (safeRows - 1)) / safeRows;
      const cellByWidth = (innerWidth - gapX * (safeCols - 1)) / safeCols;
      const cellRaw = Math.min(cellByHeight, cellByWidth);
      const cell = clamp(cellRaw, 56, 150);

      grid.style.gridTemplateColumns = `repeat(${safeCols}, ${cell}px)`;
      grid.style.gridTemplateRows = `repeat(${safeRows}, ${cell}px)`;
      grid.style.justifyContent = "center";
    }

    function applyFarmCamera() {
      const cam = state.farmCamera;
      const grid = refs.landGrid;
      const bgLayer = refs.farmBgLayer;
      if (!cam || !grid) return;

      cam.scale = clamp(Number(cam.scale || 1), cam.minScale, cam.maxScale);
      const bounds = readFarmCameraBounds(cam.scale);
      if (!cam.initialized) {
        const initialOffsetY = Number(cam.initialOffsetY || 0);
        cam.x = (bounds.minX + bounds.maxX) / 2;
        cam.y = (bounds.minY + bounds.maxY) / 2 + initialOffsetY;
        cam.initialized = true;
      }
      cam.x = clamp(Number(cam.x || 0), bounds.minX, bounds.maxX);
      cam.y = clamp(Number(cam.y || 0), bounds.minY, bounds.maxY);

      const matrix = `matrix(${cam.scale}, 0, 0, ${cam.scale}, ${cam.x}, ${cam.y})`;
      grid.style.transform = matrix;
      if (bgLayer) {
        bgLayer.style.transform = matrix;
      }
    }

    function syncFarmCameraTargets() {
      const cam = state.farmCamera;
      if (!cam) return;
      cam.targetScale = cam.scale;
      cam.targetX = cam.x;
      cam.targetY = cam.y;
    }

    function stopFarmZoomAnimation() {
      const cam = state.farmCamera;
      if (!cam) return;
      if (cam.zoomRaf) {
        cancelAnimationFrame(cam.zoomRaf);
        cam.zoomRaf = 0;
      }
    }

    function animateFarmCameraToTarget() {
      const cam = state.farmCamera;
      if (!cam || cam.zoomRaf) return;

      const step = () => {
        const targetScale = clamp(Number(cam.targetScale || cam.scale), cam.minScale, cam.maxScale);
        const targetBounds = readFarmCameraBounds(targetScale);
        const targetX = clamp(Number(cam.targetX || cam.x), targetBounds.minX, targetBounds.maxX);
        const targetY = clamp(Number(cam.targetY || cam.y), targetBounds.minY, targetBounds.maxY);
        cam.targetScale = targetScale;
        cam.targetX = targetX;
        cam.targetY = targetY;

        const ds = targetScale - cam.scale;
        const dx = targetX - cam.x;
        const dy = targetY - cam.y;
        const done = Math.abs(ds) < 0.001 && Math.abs(dx) < 0.25 && Math.abs(dy) < 0.25;
        if (done) {
          cam.scale = targetScale;
          cam.x = targetX;
          cam.y = targetY;
          applyFarmCamera();
          cam.zoomRaf = 0;
          return;
        }

        const easing = 0.2;
        cam.scale += ds * easing;
        cam.x += dx * easing;
        cam.y += dy * easing;
        applyFarmCamera();
        cam.zoomRaf = requestAnimationFrame(step);
      };

      cam.zoomRaf = requestAnimationFrame(step);
    }

    function zoomFarmCamera(nextScale, clientX, clientY) {
      const cam = state.farmCamera;
      const viewport = refs.farmViewport;
      if (!cam || !viewport) return;

      const baseScale = clamp(Number(cam.targetScale || cam.scale), cam.minScale, cam.maxScale);
      const baseX = Number(cam.targetX || cam.x);
      const baseY = Number(cam.targetY || cam.y);
      const targetScale = clamp(Number(nextScale || baseScale), cam.minScale, cam.maxScale);
      if (Math.abs(targetScale - baseScale) < 0.0001) {
        return;
      }

      const rect = viewport.getBoundingClientRect();
      const anchorX = clamp(clientX - rect.left, 0, rect.width);
      const anchorY = clamp(clientY - rect.top, 0, rect.height);
      const worldX = (anchorX - baseX) / baseScale;
      const worldY = (anchorY - baseY) / baseScale;
      const targetBounds = readFarmCameraBounds(targetScale);

      cam.targetScale = targetScale;
      cam.targetX = clamp(anchorX - worldX * targetScale, targetBounds.minX, targetBounds.maxX);
      cam.targetY = clamp(anchorY - worldY * targetScale, targetBounds.minY, targetBounds.maxY);
      animateFarmCameraToTarget();
    }

    function stopFarmDrag() {
      const cam = state.farmCamera;
      const viewport = refs.farmViewport;
      if (!cam || !cam.dragging) return;

      cam.dragging = false;
      viewport?.classList.remove("is-dragging");
      syncFarmCameraTargets();
    }

    function bindFarmViewportControls() {
      const viewport = refs.farmViewport;
      const grid = refs.landGrid;
      const cam = state.farmCamera;
      if (!viewport || !grid || !cam) return;
      const inViewport = (target) => {
        return Boolean(target && target.nodeType === 1 && viewport.contains(target));
      };
      const preventContextMenuWhileDragging = (event) => {
        if (!cam.dragging) return;
        event.preventDefault();
      };
      const startDrag = (event) => {
        if (!inViewport(event.target)) return;
        const isRightDragStart = event.button === 2 || (event.button === 0 && event.ctrlKey);
        if (!isRightDragStart) return;
        stopFarmZoomAnimation();
        cam.dragging = true;
        cam.lastX = event.clientX;
        cam.lastY = event.clientY;
        viewport.classList.add("is-dragging");
        event.preventDefault();
      };

      viewport.addEventListener("wheel", (event) => {
        event.preventDefault();
        const baseScale = Number(cam.targetScale || cam.scale);
        const unit =
          event.deltaMode === 1 ? 16 :
            event.deltaMode === 2 ? 120 :
              1;
        const normalizedDeltaY = Number(event.deltaY || 0) * unit;
        const clampedDeltaY = clamp(normalizedDeltaY, -80, 80);
        const next = baseScale * Math.exp(-clampedDeltaY * 0.0007);
        zoomFarmCamera(next, event.clientX, event.clientY);
      }, { passive: false });

      document.addEventListener("mousedown", startDrag, true);

      viewport.addEventListener("contextmenu", (event) => {
        event.preventDefault();
      });
      viewport.addEventListener("dragstart", (event) => {
        if (!cam.dragging) return;
        event.preventDefault();
      });

      document.addEventListener("mousemove", (event) => {
        if (!cam.dragging) return;
        const dx = event.clientX - cam.lastX;
        const dy = event.clientY - cam.lastY;
        cam.lastX = event.clientX;
        cam.lastY = event.clientY;
        cam.x += dx;
        cam.y += dy;
        applyFarmCamera();
        syncFarmCameraTargets();
        event.preventDefault();
      }, true);

      document.addEventListener("mouseup", () => {
        stopFarmDrag();
      }, true);
      window.addEventListener("contextmenu", preventContextMenuWhileDragging, true);
      window.addEventListener("blur", () => {
        stopFarmDrag();
      });

      window.addEventListener("resize", () => {
        const farm = state.farm;
        if (farm) {
          const cols = Math.max(1, Number(farm.grid_cols || 6));
          const rows = Math.max(1, Number(farm.grid_rows || 4));
          updateLandGridTracks(cols, rows);
        }
        applyFarmCamera();
        syncFarmCameraTargets();
      });
    }

    return {
      updateLandGridTracks,
      applyFarmCamera,
      syncFarmCameraTargets,
      bindFarmViewportControls,
      stopFarmDrag
    };
  };
})();
