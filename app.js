// ==========================================
// CONFIG
// ==========================================
const USE_SIMULATION   = true;   // set to false when real telemetry calls updateDashboardData()
const STALE_AFTER_MS   = 5000;   // no data for this long -> "Link lost"
const STABLE_RATE_DEG_S = 5;     // angular rate (deg/s) below which attitude is "STABLE"
const SPARK_POINTS     = 30;
const MAP_FOLLOW_ZOOM  = 4;

// ==========================================
// UTILITIES
// ==========================================
const $ = (id) => document.getElementById(id);
const random = (min, max) => Math.random() * (max - min) + min;
const normAngle = (a) => ((a + 180) % 360 + 360) % 360 - 180;
const setText = (id, text) => { const el = $(id); if (el) el.textContent = text; };

function updateClock() {
    setText('utc-time', new Date().toISOString().substring(11, 19));
}
setInterval(updateClock, 1000);
updateClock();

// ==========================================
// FULLSCREEN (native API with CSS fallback for browsers without it, e.g. iPhone Safari)
// ==========================================
const fsCards = Array.from(document.querySelectorAll('[data-fs-card]'));

function nativeFsElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function syncFullscreenState() {
    const active = nativeFsElement();
    fsCards.forEach((card) => {
        const on = card === active || card.classList.contains('fs-fallback');
        card.classList.toggle('is-fs', on);
        const btn = card.querySelector('[data-fs-btn]');
        if (btn) {
            const name = btn.dataset.label;
            btn.setAttribute('aria-label', on ? `Exit fullscreen: ${name}` : `View ${name} fullscreen`);
            btn.title = on ? 'Back to dashboard (Esc)' : `View ${name} fullscreen`;
        }
    });
    document.body.style.overflow = fsCards.some((c) => c.classList.contains('fs-fallback')) ? 'hidden' : '';
}

function enterFullscreen(card) {
    const request = card.requestFullscreen || card.webkitRequestFullscreen;
    const fallback = () => { card.classList.add('fs-fallback'); syncFullscreenState(); };
    if (!request) return fallback();
    try {
        const result = request.call(card);
        if (result && result.catch) result.catch(fallback);
    } catch (e) { fallback(); }
}

function exitFullscreen() {
    fsCards.forEach((c) => c.classList.remove('fs-fallback'));
    if (nativeFsElement()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    syncFullscreenState();
}

fsCards.forEach((card) => {
    const btn = card.querySelector('[data-fs-btn]');
    btn.addEventListener('click', () => {
        const isFs = card.classList.contains('is-fs');
        isFs ? exitFullscreen() : enterFullscreen(card);
    });
});
document.addEventListener('fullscreenchange', syncFullscreenState);
document.addEventListener('webkitfullscreenchange', syncFullscreenState);
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && fsCards.some((c) => c.classList.contains('fs-fallback'))) exitFullscreen();
});
syncFullscreenState();

// ==========================================
// LINK STATUS (replaces the old hard-coded "Link Active" / "REC" / "STABLE")
// ==========================================
let lastDataAt = null;
let linkState = 'waiting';

function renderLink() {
    let state = 'waiting';
    let text = 'Waiting for telemetry…';
    if (lastDataAt !== null) {
        const age = Date.now() - lastDataAt;
        if (age > STALE_AFTER_MS) {
            state = 'lost';
            text = `Link lost · last data ${Math.round(age / 1000)}s ago`;
        } else {
            state = 'active';
            text = 'Telemetry link active';
        }
    }
    setText('link-text', text);
    if (state === linkState) return;
    linkState = state;

    const status = $('link-status');
    status.classList.toggle('is-active', state === 'active');
    status.classList.toggle('is-lost', state === 'lost');
    document.body.classList.toggle('link-lost', state === 'lost');

    const offline = state !== 'active';
    if (state === 'lost') {              // don't keep claiming "Stable" on stale data
        const badge = $('orient-badge');
        badge.textContent = 'No data';
        badge.classList.add('is-warn');
    }
    $('rec-badge').classList.toggle('is-offline', offline);
    setText('cam-label', offline ? 'CAM_1 | NO SIGNAL' : 'CAM_1 | ACTIVE');
}
setInterval(renderLink, 1000);
renderLink();

// ==========================================
// SPARKLINES
// ==========================================
Chart.defaults.color = '#475569';
Chart.defaults.font.family = "'JetBrains Mono', monospace";

function createSparkline(canvasId, unit, decimals) {
    return new Chart($(canvasId).getContext('2d'), {
        type: 'line',
        data: {
            labels: Array.from({ length: SPARK_POINTS }, (_, i) => i),
            // Start empty: no fabricated history. The line fills in from the right as real data arrives.
            datasets: [{
                data: Array(SPARK_POINTS).fill(null),
                borderColor: '#0ea5e9',
                borderWidth: 2,
                cubicInterpolationMode: 'monotone',
                pointRadius: 0,
                pointHoverRadius: 4,
                pointHoverBackgroundColor: '#0369a1',
                fill: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            layout: { padding: { top: 6, bottom: 6 } },
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: true,
                    displayColors: false,
                    callbacks: {
                        title: () => '',
                        label: (c) => (c.parsed.y == null ? '' : `${c.parsed.y.toFixed(decimals)} ${unit}`)
                    }
                }
            },
            scales: { x: { display: false }, y: { display: false, grace: '15%' } }
        }
    });
}

const charts = {
    pres:  createSparkline('chart-pres',  'kPa', 2),
    hum:   createSparkline('chart-hum',   '%',   2),
    light: createSparkline('chart-light', 'lux', 0)
};

function pushChart(chart, value) {
    const d = chart.data.datasets[0].data;
    d.shift();
    d.push(value);
    chart.update('none');
}

// ==========================================
// SOLAR BARS
// ==========================================
const solarContainer = $('solar-bars');
for (let i = 0; i < 12; i++) {
    const bar = document.createElement('div');
    bar.className = 'solar-bar';
    bar.title = `Panel ${i + 1}: no data`;
    solarContainer.appendChild(bar);
}

const cube = $('satellite-cube');

// ==========================================
// MAP (Leaflet)
// ==========================================
const map = L.map('map', { zoomControl: false, attributionControl: false }).setView([20, 0], 2);
L.control.zoom({ position: 'bottomright' }).addTo(map);
// OpenStreetMap's tile policy requires visible attribution
L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    className: 'map-tiles',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
}).addTo(map);

const craftIcon = L.divIcon({
    className: '',
    html: '<div class="craft-icon"><div class="craft-ping"></div><div class="craft-dot"></div></div>',
    iconSize: [48, 48],
    iconAnchor: [24, 24]
});
const craftMarker = L.marker([0, 0], { icon: craftIcon, opacity: 0, keyboard: false }).addTo(map);

// Ground track, split into segments so it doesn't draw a line across the map at the antimeridian
const trailSegments = [[]];
const trail = L.polyline(trailSegments, { color: '#0ea5e9', weight: 3, opacity: 0.8 }).addTo(map);
const TRAIL_MAX_POINTS = 400;

let hasFix = false;
let following = true;
let lastLatLng = null;
const recenterBtn = $('recenter-btn');

function setFollowing(on) {
    following = on;
    recenterBtn.hidden = on || !hasFix;
    if (on && lastLatLng) map.panTo(lastLatLng);
}
// Let people pan/zoom freely: dragging stops auto-follow instead of being snapped back every 2s
map.on('dragstart', () => setFollowing(false));
recenterBtn.addEventListener('click', () => setFollowing(true));

// Keep tiles correct when the layout resizes (breakpoints, fullscreen, rotation)
new ResizeObserver(() => map.invalidateSize()).observe($('map'));

function updateMapLocation(lat, lon) {
    const ll = L.latLng(lat, lon);
    lastLatLng = ll;
    craftMarker.setLatLng(ll).setOpacity(1);

    const seg = trailSegments[trailSegments.length - 1];
    const prev = seg[seg.length - 1];
    if (prev && Math.abs(prev.lng - lon) > 180) trailSegments.push([]);
    trailSegments[trailSegments.length - 1].push(ll);
    while (trailSegments.reduce((n, s) => n + s.length, 0) > TRAIL_MAX_POINTS) {
        trailSegments[0].shift();
        if (!trailSegments[0].length && trailSegments.length > 1) trailSegments.shift();
    }
    trail.setLatLngs(trailSegments);

    if (!hasFix) {                       // first fix: jump to a useful zoom instead of a world view
        hasFix = true;
        map.setView(ll, MAP_FOLLOW_ZOOM);
    } else if (following) {
        map.panTo(ll, { animate: true, duration: 0.9, noMoveStart: true });
    }
}

// ==========================================
// CORE DATA INJECTION API  (unchanged keys — call this with real telemetry)
// ==========================================
let prevAttitude = null;

function setBattery(pct) {
    const p = Math.max(0, Math.min(100, pct));
    $('val-batt').textContent = `${Math.round(p)}%`;
    const bar = $('batt-bar');
    bar.style.width = `${p}%`;
    bar.classList.toggle('is-warn', p < 40 && p >= 20);
    bar.classList.toggle('is-bad', p < 20);
    $('batt-track').setAttribute('aria-valuenow', Math.round(p));
    // text cue so state is not conveyed by colour alone
    setText('batt-state', p < 20 ? 'Critical' : p < 40 ? 'Low' : 'Nominal');
}

function updateDashboardData(data) {
    if (!data) return;
    lastDataAt = Date.now();
    renderLink();

    // Numbers only: units (°C, kPa, %, lux) live in the markup, so no more "23.3°°"
    if (data.tempInt !== undefined) setText('val-temp-int', data.tempInt.toFixed(1));
    if (data.tempExt !== undefined) setText('val-temp-ext', data.tempExt.toFixed(1));
    if (data.pressure !== undefined) { setText('val-pres', data.pressure.toFixed(1)); pushChart(charts.pres, data.pressure); }
    if (data.humidity !== undefined) { setText('val-hum', data.humidity.toFixed(1));  pushChart(charts.hum, data.humidity); }
    if (data.light !== undefined)    { setText('val-light', String(Math.round(data.light))); pushChart(charts.light, data.light); }

    if (Array.isArray(data.solarPanels)) {
        let totalKw = 0;
        Array.from(solarContainer.children).forEach((bar, i) => {
            const val = data.solarPanels[i] || 0;
            bar.style.height = `${Math.max(4, val)}%`;
            bar.style.backgroundColor = val > 40 ? '#0ea5e9' : '#94a3b8';
            bar.title = `Panel ${i + 1}: ${Math.round(val)}%`;
            totalKw += (val / 100) * 0.135;
        });
        setText('val-solar-kw', `${totalKw.toFixed(2)} kW`);
    }

    if (data.batteryPercent !== undefined) setBattery(data.batteryPercent);
    if (data.batteryVoltage !== undefined) setText('val-batt-v', `${data.batteryVoltage.toFixed(1)} V`);

    if (data.lat !== undefined && data.lon !== undefined) {
        const latStr = `${Math.abs(data.lat).toFixed(4)}°${data.lat >= 0 ? 'N' : 'S'}`;
        const lonStr = `${Math.abs(data.lon).toFixed(4)}°${data.lon >= 0 ? 'E' : 'W'}`;
        $('coord-display').innerHTML =
            `<span class="coord-chip">LAT ${latStr}</span><span class="coord-chip">LON ${lonStr}</span>`;
        updateMapLocation(data.lat, data.lon);
    }

    if (data.pitch !== undefined && data.yaw !== undefined && data.roll !== undefined) {
        cube.style.transform = `translateZ(-70px) rotateX(${data.pitch}deg) rotateY(${data.yaw}deg) rotateZ(${data.roll}deg)`;
        setText('val-pitch', normAngle(data.pitch).toFixed(2) + '°');
        setText('val-yaw',   normAngle(data.yaw).toFixed(2) + '°');
        setText('val-roll',  normAngle(data.roll).toFixed(2) + '°');

        // Derive the status badge from the data instead of hard-coding "STABLE"
        const now = Date.now();
        if (prevAttitude) {
            const dt = Math.max((now - prevAttitude.t) / 1000, 0.001);
            const d = (a, b) => Math.abs(normAngle(a - b));
            const rate = Math.max(d(data.pitch, prevAttitude.p), d(data.yaw, prevAttitude.y), d(data.roll, prevAttitude.r)) / dt;
            const stable = rate < STABLE_RATE_DEG_S;
            const badge = $('orient-badge');
            badge.textContent = stable ? 'Stable' : 'Rotating';
            badge.classList.toggle('is-warn', !stable);
        }
        prevAttitude = { p: data.pitch, y: data.yaw, r: data.roll, t: now };
    }
}

// ==========================================
// DEMONSTRATION SIMULATION LOOP
// ==========================================
if (USE_SIMULATION) {
    let simLat = 32.7157, simLon = -117.1611;
    let simPitch = 0, simYaw = 0, simRoll = 0;

    const tick = () => {
        simLat = Math.max(-80, Math.min(80, simLat + random(-0.05, 0.05)));
        simLon = ((simLon + random(0.05, 0.1) + 180) % 360) - 180;   // wrap at the antimeridian
        simPitch += random(-1, 1);
        simYaw   += random(-2, 2);
        simRoll  += random(-0.5, 0.5);

        updateDashboardData({
            tempInt: random(22.0, 23.5),
            tempExt: random(-42.0, -39.0),
            pressure: random(101.1, 101.5),
            humidity: random(3.5, 4.8),
            light: random(800, 950),
            batteryPercent: random(89, 92),
            batteryVoltage: random(24.1, 24.3),
            pitch: simPitch, yaw: simYaw, roll: simRoll,
            lat: simLat, lon: simLon,
            solarPanels: Array.from({ length: 12 }, () => random(60, 100))
        });
    };
    tick();
    setInterval(tick, 1000);
}
