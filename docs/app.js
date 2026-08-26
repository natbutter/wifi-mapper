/**
 * WiFi Signal Mapper — Frontend Application
 * Handles floor plan display, click-to-record measurements,
 * heatmap rendering, and pan/zoom controls.
 */

(function () {
    'use strict';

    // ===== State =====
    const state = {
        floorPlanLoaded: false,
        mode: 'record',          // 'record' | 'view'
        points: [],              // { x, y, rssi, quality, ssid, channel, band, noise, timestamp }
        imgNatW: 0,
        imgNatH: 0,
        // Transform state (pan & zoom)
        scale: 1,
        panX: 0,
        panY: 0,
        isPanning: false,
        panStartX: 0,
        panStartY: 0,
        spaceHeld: false,
        didPan: false,
        // Settings
        heatmapOpacity: 0.6,
        heatmapRadius: 50,
        showPoints: true,
        showValues: true,
        // Live signal polling
        liveInterval: null,
    };

    // ===== DOM References =====
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);
    const canvasArea = $('#canvasArea');

    const dom = {
        demoBanner: $('#demoBanner'),
        floorPlanInput: $('#floorPlanInput'),
        uploadZone: $('#uploadZone'),
        emptyState: $('#emptyState'),
        mapContainer: $('#mapContainer'),
        floorPlanImg: $('#floorPlanImg'),
        heatmapCanvas: $('#heatmapCanvas'),
        overlayCanvas: $('#overlayCanvas'),
        tooltip: $('#tooltip'),
        zoomControls: $('#zoomControls'),
        recordingIndicator: $('#recordingIndicator'),

        signalBars: $('#signalBars'),
        signalRssi: $('#signalRssi'),
        signalQuality: $('#signalQuality'),

        modeRecord: $('#modeRecord'),
        modeView: $('#modeView'),
        heatmapOpacity: $('#heatmapOpacity'),
        heatmapRadius: $('#heatmapRadius'),
        showPoints: $('#showPoints'),
        showValues: $('#showValues'),

        statPoints: $('#statPoints'),
        statAvgRssi: $('#statAvgRssi'),
        statBestRssi: $('#statBestRssi'),
        statWorstRssi: $('#statWorstRssi'),

        btnSave: $('#btnSave'),
        btnClear: $('#btnClear'),
        btnExport: $('#btnExport'),
        btnSessions: $('#btnSessions'),
        btnUploadCta: $('#btnUploadCta'),
        btnExampleCta: $('#btnExampleCta'),
        btnUseExample: $('#btnUseExample'),
        btnZoomIn: $('#btnZoomIn'),
        btnZoomOut: $('#btnZoomOut'),
        btnZoomReset: $('#btnZoomReset'),

        sessionsModal: $('#sessionsModal'),
        sessionsList: $('#sessionsList'),
        btnCloseModal: $('#btnCloseModal'),

        toastContainer: $('#toastContainer'),
    };

    const overlayCtx = dom.overlayCanvas.getContext('2d');
    const heatmapCtx = dom.heatmapCanvas.getContext('2d');

    // ===== Toast Notifications =====
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        dom.toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease-in forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ===== Signal Quality Helpers =====
    function rssiToCategory(rssi) {
        if (rssi >= -40) return 'excellent';
        if (rssi >= -55) return 'good';
        if (rssi >= -70) return 'fair';
        if (rssi >= -80) return 'weak';
        return 'dead';
    }

    function rssiToColor(rssi) {
        // Map RSSI to a smooth gradient from green to red
        const t = Math.max(0, Math.min(1, (rssi + 90) / 60)); // 0=dead, 1=excellent
        if (t > 0.66) {
            // Green to yellow-green
            const u = (t - 0.66) / 0.34;
            return `rgb(${Math.round(34 + (132 - 34) * (1 - u))}, ${Math.round(197 + (204 - 197) * (1 - u) * 0.5)}, ${Math.round(94 - 72 * (1 - u))})`;
        } else if (t > 0.33) {
            // Yellow to orange
            const u = (t - 0.33) / 0.33;
            return `rgb(${Math.round(249 - (249 - 234) * u)}, ${Math.round(115 + (179 - 115) * u)}, ${Math.round(22 + (8 - 22) * u)})`;
        } else {
            // Orange to dark red
            const u = t / 0.33;
            return `rgb(${Math.round(127 + (239 - 127) * u)}, ${Math.round(29 + (68 - 29) * u)}, ${Math.round(29 + (68 - 29) * u)})`;
        }
    }

    function rssiToLabel(rssi) {
        const cat = rssiToCategory(rssi);
        const labels = {
            excellent: 'Excellent',
            good: 'Good',
            fair: 'Fair',
            weak: 'Weak',
            dead: 'No Signal',
        };
        return labels[cat];
    }

    // ===== Live Signal Polling =====
    async function fetchWifi() {
        try {
            const res = await fetch('/api/wifi?samples=3');
            const data = await res.json();
            if (data.error) {
                dom.signalRssi.textContent = 'Error';
                dom.signalQuality.textContent = data.error;
                dom.demoBanner.style.display = 'flex';
                return null;
            }
            dom.demoBanner.style.display = 'none';
            updateLiveSignal(data);
            return data;
        } catch (e) {
            dom.signalRssi.textContent = '-- dBm';
            dom.signalQuality.textContent = 'Server offline';
            dom.demoBanner.style.display = 'flex';
            return null;
        }
    }

    function updateLiveSignal(data) {
        const cat = rssiToCategory(data.rssi);
        dom.signalBars.className = `signal-bars ${cat}`;
        dom.signalRssi.textContent = `${data.rssi} dBm`;
        dom.signalQuality.textContent = `${rssiToLabel(data.rssi)} · ${data.band || ''} · Ch ${data.channel || '?'}`;
        dom.signalRssi.style.color = rssiToColor(data.rssi);
    }

    function startLivePolling() {
        fetchWifi();
        state.liveInterval = setInterval(fetchWifi, 2000);
    }

    // ===== Floor Plan Loading =====
    function loadFloorPlan(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            loadFloorPlanFromSrc(e.target.result);
        };
        reader.readAsDataURL(file);
    }

    function loadFloorPlanFromSrc(src) {
        const img = dom.floorPlanImg;
        img.onload = () => {
            state.imgNatW = img.naturalWidth;
            state.imgNatH = img.naturalHeight;
            state.floorPlanLoaded = true;

            // Show map, hide empty state
            dom.emptyState.style.display = 'none';
            dom.mapContainer.style.display = 'block';
            dom.zoomControls.style.display = 'flex';

            if (state.mode === 'record') {
                dom.recordingIndicator.style.display = 'flex';
            }

            // Update upload zone thumbnail
            dom.uploadZone.classList.add('has-image');
            dom.uploadZone.innerHTML = '';
            const thumb = document.createElement('img');
            thumb.src = src;
            thumb.alt = 'Floor plan thumbnail';
            dom.uploadZone.appendChild(thumb);
            const label = document.createElement('span');
            label.textContent = 'Click to change';
            label.style.fontSize = '10px';
            label.style.color = 'var(--text-muted)';
            label.style.marginTop = '4px';
            dom.uploadZone.appendChild(label);

            fitToView();
            render();
        };
        img.src = src;
    }

    function fitToView() {
        const container = dom.mapContainer;
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        const iw = state.imgNatW;
        const ih = state.imgNatH;

        const padding = 40;
        const scaleX = (cw - padding * 2) / iw;
        const scaleY = (ch - padding * 2) / ih;
        state.scale = Math.min(scaleX, scaleY, 1);

        state.panX = (cw - iw * state.scale) / 2;
        state.panY = (ch - ih * state.scale) / 2;

        applyTransform();
    }

    function applyTransform() {
        const t = `translate(${state.panX}px, ${state.panY}px) scale(${state.scale})`;
        dom.floorPlanImg.style.transform = t;
        dom.heatmapCanvas.style.transform = t;
        dom.overlayCanvas.style.transform = t;
    }

    // ===== Coordinate Conversions =====
    function screenToImage(clientX, clientY) {
        const rect = dom.mapContainer.getBoundingClientRect();
        const x = (clientX - rect.left - state.panX) / state.scale;
        const y = (clientY - rect.top - state.panY) / state.scale;
        return { x, y };
    }

    // ===== Rendering =====
    function render() {
        if (!state.floorPlanLoaded) return;

        const w = state.imgNatW;
        const h = state.imgNatH;

        // Size canvases to match image
        dom.overlayCanvas.width = w;
        dom.overlayCanvas.height = h;
        dom.heatmapCanvas.width = w;
        dom.heatmapCanvas.height = h;

        dom.floorPlanImg.style.width = w + 'px';
        dom.floorPlanImg.style.height = h + 'px';

        renderHeatmap();
        renderOverlay();
        updateStats();
    }

    function renderHeatmap() {
        const w = state.imgNatW;
        const h = state.imgNatH;
        heatmapCtx.clearRect(0, 0, w, h);

        if (state.points.length === 0) return;

        const radius = state.heatmapRadius * (Math.max(w, h) / 800);

        // Create an offscreen canvas for the intensity map
        const intensityCanvas = document.createElement('canvas');
        intensityCanvas.width = w;
        intensityCanvas.height = h;
        const ictx = intensityCanvas.getContext('2d');

        // Draw intensity circles (grayscale)
        for (const pt of state.points) {
            const intensity = Math.max(0, Math.min(1, (pt.rssi + 90) / 60));
            const gradient = ictx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, radius);
            gradient.addColorStop(0, `rgba(0, 0, 0, ${intensity})`);
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ictx.fillStyle = gradient;
            ictx.fillRect(pt.x - radius, pt.y - radius, radius * 2, radius * 2);
        }

        // Read intensity data and colorize
        const idata = ictx.getImageData(0, 0, w, h);
        const pixels = idata.data;

        for (let i = 0; i < pixels.length; i += 4) {
            const val = pixels[i + 3]; // alpha = intensity
            if (val === 0) continue;

            const t = val / 255; // 0 = dead, 1 = excellent
            let r, g, b;

            if (t > 0.7) {
                // Green
                const u = (t - 0.7) / 0.3;
                r = Math.round(34 + (0 - 34) * u);
                g = Math.round(197 + (200 - 197) * u);
                b = Math.round(94 - 94 * u);
            } else if (t > 0.45) {
                // Yellow-green to yellow
                const u = (t - 0.45) / 0.25;
                r = Math.round(234 - (234 - 34) * u);
                g = Math.round(179 + (197 - 179) * u);
                b = Math.round(8 + (94 - 8) * u);
            } else if (t > 0.25) {
                // Orange to yellow
                const u = (t - 0.25) / 0.2;
                r = Math.round(249 - (249 - 234) * u);
                g = Math.round(115 + (179 - 115) * u);
                b = Math.round(22 - 14 * u);
            } else {
                // Red to orange
                const u = t / 0.25;
                r = Math.round(127 + (249 - 127) * u);
                g = Math.round(29 + (115 - 29) * u);
                b = Math.round(29 - 7 * u);
            }

            pixels[i] = r;
            pixels[i + 1] = g;
            pixels[i + 2] = b;
            pixels[i + 3] = Math.round(val * state.heatmapOpacity);
        }

        heatmapCtx.putImageData(idata, 0, 0);
    }

    function renderOverlay() {
        const w = state.imgNatW;
        const h = state.imgNatH;
        overlayCtx.clearRect(0, 0, w, h);

        if (!state.showPoints && !state.showValues) return;

        const pointRadius = Math.max(6, Math.min(12, Math.max(w, h) / 120));

        for (const pt of state.points) {
            const color = rssiToColor(pt.rssi);

            if (state.showPoints) {
                // Outer glow
                overlayCtx.beginPath();
                overlayCtx.arc(pt.x, pt.y, pointRadius + 4, 0, Math.PI * 2);
                overlayCtx.fillStyle = color.replace('rgb', 'rgba').replace(')', ', 0.25)');
                overlayCtx.fill();

                // Inner circle
                overlayCtx.beginPath();
                overlayCtx.arc(pt.x, pt.y, pointRadius, 0, Math.PI * 2);
                overlayCtx.fillStyle = color;
                overlayCtx.fill();

                // White border
                overlayCtx.strokeStyle = 'rgba(255,255,255,0.8)';
                overlayCtx.lineWidth = 2;
                overlayCtx.stroke();
            }

            if (state.showValues) {
                // Label
                const fontSize = Math.max(10, pointRadius);
                overlayCtx.font = `600 ${fontSize}px Inter, sans-serif`;
                overlayCtx.textAlign = 'center';
                overlayCtx.textBaseline = 'bottom';

                const label = `${pt.rssi}`;
                const labelY = pt.y - pointRadius - 6;

                // Label background
                const metrics = overlayCtx.measureText(label);
                const padX = 5;
                const padY = 3;
                const lw = metrics.width + padX * 2;
                const lh = fontSize + padY * 2;

                overlayCtx.fillStyle = 'rgba(10, 10, 15, 0.85)';
                overlayCtx.beginPath();
                roundRect(overlayCtx, pt.x - lw / 2, labelY - lh, lw, lh, 4);
                overlayCtx.fill();

                overlayCtx.fillStyle = color;
                overlayCtx.fillText(label, pt.x, labelY - padY);
            }
        }
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
    }

    // ===== Stats =====
    function updateStats() {
        const n = state.points.length;
        dom.statPoints.textContent = n;

        if (n === 0) {
            dom.statAvgRssi.textContent = '--';
            dom.statBestRssi.textContent = '--';
            dom.statWorstRssi.textContent = '--';
            return;
        }

        const rssis = state.points.map(p => p.rssi);
        const avg = rssis.reduce((a, b) => a + b, 0) / n;
        dom.statAvgRssi.textContent = Math.round(avg);
        dom.statBestRssi.textContent = Math.max(...rssis);
        dom.statWorstRssi.textContent = Math.min(...rssis);
    }

    // ===== Recording =====
    async function recordPoint(clientX, clientY) {
        const { x, y } = screenToImage(clientX, clientY);

        // Bounds check
        if (x < 0 || y < 0 || x > state.imgNatW || y > state.imgNatH) return;

        showToast('Measuring signal...', 'info');

        const data = await fetchWifi();
        if (!data || data.error) {
            showToast('Failed to read WiFi signal', 'error');
            return;
        }

        const point = {
            x: Math.round(x),
            y: Math.round(y),
            rssi: data.rssi,
            quality: data.quality,
            ssid: data.ssid,
            channel: data.channel,
            band: data.band,
            noise: data.noise,
            timestamp: data.timestamp,
        };

        state.points.push(point);
        render();

        const cat = rssiToCategory(point.rssi);
        showToast(`Recorded: ${point.rssi} dBm (${rssiToLabel(point.rssi)})`, cat === 'dead' || cat === 'weak' ? 'error' : 'success');
    }

    // ===== Pan & Zoom =====
    function zoom(delta, centerX, centerY) {
        const oldScale = state.scale;
        const factor = delta > 0 ? 1.15 : 1 / 1.15;
        state.scale = Math.max(0.1, Math.min(5, state.scale * factor));

        // Zoom toward center point
        if (centerX !== undefined) {
            const rect = dom.mapContainer.getBoundingClientRect();
            const mx = centerX - rect.left;
            const my = centerY - rect.top;
            state.panX = mx - (mx - state.panX) * (state.scale / oldScale);
            state.panY = my - (my - state.panY) * (state.scale / oldScale);
        }

        applyTransform();
    }

    // ===== Event Listeners =====

    // Upload
    function triggerUpload() {
        dom.floorPlanInput.click();
    }

    dom.uploadZone.addEventListener('click', triggerUpload);
    dom.btnUploadCta.addEventListener('click', triggerUpload);

    dom.floorPlanInput.addEventListener('change', (e) => {
        if (e.target.files[0]) loadFloorPlan(e.target.files[0]);
    });

    // Drag & drop
    dom.uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dom.uploadZone.classList.add('dragover');
    });
    dom.uploadZone.addEventListener('dragleave', () => {
        dom.uploadZone.classList.remove('dragover');
    });
    dom.uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dom.uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files[0]) loadFloorPlan(e.dataTransfer.files[0]);
    });

    // Also allow drop on the empty state area
    dom.emptyState.addEventListener('dragover', (e) => e.preventDefault());
    dom.emptyState.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.files[0]) loadFloorPlan(e.dataTransfer.files[0]);
    });

    // Example floor plan buttons
    const loadExample = () => {
        loadFloorPlanFromSrc('example-floorplan.png');
        showToast('Loaded example floor plan', 'info');
    };
    if (dom.btnExampleCta) dom.btnExampleCta.addEventListener('click', loadExample);
    if (dom.btnUseExample) dom.btnUseExample.addEventListener('click', loadExample);

    // ===== Mode Switching =====
    function setMode(mode) {
        state.mode = mode;
        state.isPanning = false;
        state.didPan = false;
        state.spaceHeld = false;
        dom.mapContainer.classList.remove('panning');

        if (mode === 'record') {
            dom.modeRecord.classList.add('active');
            dom.modeView.classList.remove('active');
            dom.mapContainer.classList.remove('mode-view');
            dom.recordingIndicator.style.display = state.floorPlanLoaded ? 'flex' : 'none';
            dom.overlayCanvas.style.cursor = 'crosshair';
            dom.tooltip.style.display = 'none';
        } else {
            dom.modeView.classList.add('active');
            dom.modeRecord.classList.remove('active');
            dom.mapContainer.classList.add('mode-view');
            dom.recordingIndicator.style.display = 'none';
            dom.overlayCanvas.style.cursor = 'grab';
        }
    }

    // Canvas click (record) — suppress if we just panned
    dom.overlayCanvas.addEventListener('click', (e) => {
        if (state.didPan) {
            state.didPan = false;
            return;
        }
        if (state.mode === 'record' && !state.spaceHeld && e.button === 0) {
            recordPoint(e.clientX, e.clientY);
        }
    });

    // Canvas hover (tooltip in view mode)
    dom.overlayCanvas.addEventListener('mousemove', (e) => {
        if (state.mode !== 'view' || state.isPanning) {
            dom.tooltip.style.display = 'none';
            return;
        }

        const { x, y } = screenToImage(e.clientX, e.clientY);
        const pointRadius = Math.max(6, Math.min(12, Math.max(state.imgNatW, state.imgNatH) / 120));
        const hitRadius = (pointRadius + 8) / state.scale;

        let hit = null;
        for (const pt of state.points) {
            const dx = pt.x - x;
            const dy = pt.y - y;
            if (Math.sqrt(dx * dx + dy * dy) < hitRadius) {
                hit = pt;
                break;
            }
        }

        if (hit) {
            dom.tooltip.innerHTML = `
                <div style="font-weight:700;color:${rssiToColor(hit.rssi)}">${hit.rssi} dBm · ${rssiToLabel(hit.rssi)}</div>
                <div>Quality: ${hit.quality}%</div>
                <div>Channel: ${hit.channel} · ${hit.band}</div>
                <div>Noise: ${hit.noise} dBm</div>
                <div style="color:var(--text-muted)">${new Date(hit.timestamp).toLocaleTimeString()}</div>
            `;
            dom.tooltip.style.display = 'block';
            dom.tooltip.style.left = (e.clientX - dom.mapContainer.getBoundingClientRect().left + 15) + 'px';
            dom.tooltip.style.top = (e.clientY - dom.mapContainer.getBoundingClientRect().top - 10) + 'px';
        } else {
            dom.tooltip.style.display = 'none';
        }
    });

    // Pan — works in View mode always, and in Record mode when holding Space or middle-click
    canvasArea.addEventListener('mousedown', (e) => {
        if (!state.floorPlanLoaded) return;
        if (state.mode === 'view' || e.button === 1 || state.spaceHeld) {
            state.isPanning = true;
            state.didPan = false;
            state.dragStartX = e.clientX;
            state.dragStartY = e.clientY;
            state.panStartX = e.clientX - state.panX;
            state.panStartY = e.clientY - state.panY;
            dom.mapContainer.classList.add('panning');
            e.preventDefault();
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (!state.isPanning) return;
        const dx = e.clientX - state.dragStartX;
        const dy = e.clientY - state.dragStartY;
        if (Math.hypot(dx, dy) > 4) {
            state.didPan = true;
        }
        state.panX = e.clientX - state.panStartX;
        state.panY = e.clientY - state.panStartY;
        applyTransform();
    });

    window.addEventListener('mouseup', () => {
        if (state.isPanning) {
            state.isPanning = false;
            dom.mapContainer.classList.remove('panning');
        }
    });

    window.addEventListener('blur', () => {
        state.isPanning = false;
        state.spaceHeld = false;
        dom.mapContainer.classList.remove('panning');
    });

    // Scroll to zoom — attached to full canvas area so it works everywhere
    canvasArea.addEventListener('wheel', (e) => {
        if (!state.floorPlanLoaded) return;
        e.preventDefault();
        zoom(-e.deltaY, e.clientX, e.clientY);
    }, { passive: false });

    // Space key to enable pan-drag in Record mode
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !e.repeat && state.floorPlanLoaded && state.mode === 'record') {
            state.spaceHeld = true;
            dom.overlayCanvas.style.cursor = 'grab';
            e.preventDefault();
        }
    });
    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space') {
            state.spaceHeld = false;
            if (state.mode === 'record') {
                dom.overlayCanvas.style.cursor = 'crosshair';
            }
        }
    });

    // Zoom buttons
    dom.btnZoomIn.addEventListener('click', () => {
        const rect = dom.mapContainer.getBoundingClientRect();
        zoom(1, rect.left + rect.width / 2, rect.top + rect.height / 2);
    });
    dom.btnZoomOut.addEventListener('click', () => {
        const rect = dom.mapContainer.getBoundingClientRect();
        zoom(-1, rect.left + rect.width / 2, rect.top + rect.height / 2);
    });
    dom.btnZoomReset.addEventListener('click', fitToView);

    // Mode toggle buttons
    dom.modeRecord.addEventListener('click', () => setMode('record'));
    dom.modeView.addEventListener('click', () => setMode('view'));

    // Controls
    dom.heatmapOpacity.addEventListener('input', (e) => {
        state.heatmapOpacity = e.target.value / 100;
        render();
    });

    dom.heatmapRadius.addEventListener('input', (e) => {
        state.heatmapRadius = parseInt(e.target.value);
        render();
    });

    dom.showPoints.addEventListener('change', (e) => {
        state.showPoints = e.target.checked;
        render();
    });

    dom.showValues.addEventListener('change', (e) => {
        state.showValues = e.target.checked;
        render();
    });

    // Save
    dom.btnSave.addEventListener('click', async () => {
        if (state.points.length === 0) {
            showToast('No measurements to save', 'error');
            return;
        }

        const name = prompt('Session name:', `wifi_survey_${new Date().toISOString().slice(0, 10)}`);
        if (!name) return;

        try {
            const res = await fetch('/api/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    points: state.points,
                    created: new Date().toISOString(),
                    imgWidth: state.imgNatW,
                    imgHeight: state.imgNatH,
                    imgSrc: dom.floorPlanImg.src || '',
                }),
            });
            const data = await res.json();
            if (data.success) {
                showToast('Session saved!', 'success');
            } else {
                showToast('Save failed: ' + data.error, 'error');
            }
        } catch (e) {
            showToast('Save failed: ' + e.message, 'error');
        }
    });

    // Clear
    dom.btnClear.addEventListener('click', () => {
        if (state.points.length === 0) return;
        if (!confirm('Clear all measurement points?')) return;
        state.points = [];
        render();
        showToast('All points cleared', 'info');
    });

    // Export
    dom.btnExport.addEventListener('click', () => {
        if (state.points.length === 0) {
            showToast('No data to export', 'error');
            return;
        }

        // CSV export
        const headers = ['x', 'y', 'rssi', 'quality', 'channel', 'band', 'noise', 'timestamp'];
        const csv = [
            headers.join(','),
            ...state.points.map(p => headers.map(h => p[h] ?? '').join(','))
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wifi_survey_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('Data exported as CSV', 'success');
    });

    // Sessions modal
    dom.btnSessions.addEventListener('click', async () => {
        dom.sessionsModal.style.display = 'flex';
        try {
            const res = await fetch('/api/sessions');
            const sessions = await res.json();

            if (sessions.length === 0) {
                dom.sessionsList.innerHTML = '<p class="text-muted">No saved sessions yet.</p>';
                return;
            }

            dom.sessionsList.innerHTML = sessions.map(s => `
                <div class="session-item" data-filename="${s.filename}">
                    <div>
                        <div class="name">${s.name}</div>
                        <div class="meta">${s.point_count} points · ${s.created ? new Date(s.created).toLocaleDateString() : ''}</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"/></svg>
                </div>
            `).join('');

            // Load on click
            dom.sessionsList.querySelectorAll('.session-item').forEach(el => {
                el.addEventListener('click', async () => {
                    const filename = el.dataset.filename;
                    try {
                        const res = await fetch(`/api/load/${filename}`);
                        const data = await res.json();
                        state.points = data.points || [];
                        if (data.imgSrc) {
                            loadFloorPlanFromSrc(data.imgSrc);
                        } else {
                            render();
                        }
                        dom.sessionsModal.style.display = 'none';
                        showToast(`Loaded session: ${data.name}`, 'success');
                    } catch (e) {
                        showToast('Failed to load session', 'error');
                    }
                });
            });
        } catch (e) {
            dom.sessionsList.innerHTML = '<p class="text-muted">Failed to load sessions.</p>';
        }
    });

    dom.btnCloseModal.addEventListener('click', () => {
        dom.sessionsModal.style.display = 'none';
    });

    dom.sessionsModal.addEventListener('click', (e) => {
        if (e.target === dom.sessionsModal) dom.sessionsModal.style.display = 'none';
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            dom.sessionsModal.style.display = 'none';
        }
        if (e.key === 'r' && !e.metaKey && !e.ctrlKey) {
            dom.modeRecord.click();
        }
        if (e.key === 'v' && !e.metaKey && !e.ctrlKey) {
            dom.modeView.click();
        }
        if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey)) {
            // Undo last point
            if (state.points.length > 0) {
                state.points.pop();
                render();
                showToast('Undid last point', 'info');
            }
            e.preventDefault();
        }
    });

    // Window resize
    window.addEventListener('resize', () => {
        if (state.floorPlanLoaded) {
            render();
        }
    });

    // ===== Init =====
    startLivePolling();
    loadFloorPlanFromSrc('example-floorplan.png');

})();
