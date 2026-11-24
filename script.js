// TAG KAÇ! — GMT 458 Web GIS
// Stage 7: Playable first mission

"use strict";

const $ = id => document.getElementById(id);
const colors = ["#419cff", "#b48bff", "#79b925"];

const mission = {
    customer: "Ahmet",
    pickup: "Kızılay",
    destination: "Bahçelievler",
    start: [32.8541, 39.9208],
    end: [32.8277, 39.9256],
    reward: 350,
    time: 120,
    hints: 3,
    steps: 4
};

let map, vectorSource, vehicle;
let routes = [], checkpoints = [], travelled = [];
let balance = 1000, hints = 3, step = 0;
let active = false, busy = false;
let revealed = false, animation = 0;
let soundEnabled = true;

const routeButtons = [...document.querySelectorAll(".route-btn")];
const money = value => value.toLocaleString("tr-TR") + " TL";

function showScreen(id) {
    document.querySelectorAll(".screen").forEach(s => {
        s.hidden = s.id !== id;
    });
}

// COUNTDOWN TIMER - CLOSURE

function createTimer() {
    let interval = null;
    let deadline = 0;

    function stop() {
        clearInterval(interval);
        interval = null;
    }

    function render() {
        const remaining = Math.max(
            0,
            Math.ceil((deadline - Date.now()) / 1000)
        );

        $("timer").textContent =
            String(Math.floor(remaining / 60)).padStart(2, "0")
            + ":" +
            String(remaining % 60).padStart(2, "0");

        $("timer").classList.toggle("danger", remaining <= 15);

        if (!remaining && active) {
            finishGame(false, "Süren doldu!");
        }
    }

    function start(seconds) {
        stop();
        deadline = Date.now() + seconds * 1000;
        render();
        interval = setInterval(render, 200);
    }

    return { start, stop };
}

const gameTimer = createTimer();

function resetMotion() {
    cancelAnimationFrame(animation);
    animation = 0;
    active = false;
    busy = false;
    gameTimer.stop();
}

// PASSENGER REQUEST

function prepareMission() {
    resetMotion();

    balance = 1000;
    hints = mission.hints;
    step = 0;
    travelled = [];

    $("customer-name").textContent =
        "Müşteri: " + mission.customer;

    $("pickup-location").textContent = mission.pickup;
    $("destination-location").textContent = mission.destination;
    $("trip-reward").textContent = money(mission.reward);

    showScreen("request-screen");
}

// MAP INITIALIZATION

function initializeMap() {
    if (map) {
        map.updateSize();
        return;
    }

    vectorSource = new ol.source.Vector();

    map = new ol.Map({
        target: "map",

        layers: [
            new ol.layer.Tile({
                source: new ol.source.OSM()
            }),

            new ol.layer.Vector({
                source: vectorSource
            })
        ],

        view: new ol.View({
            center: ol.proj.fromLonLat(mission.start),
            zoom: 14
        })
    });

    map.addControl(new ol.control.ScaleLine());

    map.on("singleclick", event => {
        if (!active || busy) return;

        const hit = map.forEachFeatureAtPixel(
            event.pixel,

            feature => Number.isInteger(
                feature.get("routeIndex")
            ) ? feature : undefined,

            { hitTolerance: 7 }
        );

        if (hit) {
            chooseRoute(hit.get("routeIndex"));
            return;
        }

        const [lon, lat] = ol.proj.toLonLat(event.coordinate);

        $("customer-message").textContent =
            `Koordinat: ${lat.toFixed(5)}° N, ${lon.toFixed(5)}° E`;
    });
}

// POINT GEOMETRIES

function pointFeature(coordinate, label, color, icon = "", z = 10) {

    const feature = new ol.Feature(
        new ol.geom.Point(coordinate)
    );

    feature.setStyle(new ol.style.Style({

        zIndex: z,

        image: new ol.style.Circle({
            radius: icon ? 18 : 10,

            fill: new ol.style.Fill({ color }),

            stroke: new ol.style.Stroke({
                color: "#ffffff",
                width: 2
            })
        }),

        text: new ol.style.Text({
            text: icon || label,

            font: icon ? "22px Arial" : "bold 13px Arial",

            offsetY: icon ? 0 : -22,

            fill: new ol.style.Fill({
                color: "#ffffff"
            }),

            stroke: icon ? undefined : new ol.style.Stroke({
                color: "#101512",
                width: 4
            })
        })
    }));

    vectorSource.addFeature(feature);

    return feature;
}

// ROUTE STYLING

function lineStyle(color, width = 5, z = 2) {

    return [
        new ol.style.Style({
            zIndex: z,

            stroke: new ol.style.Stroke({
                color: "#202923",
                width: width + 3
            })
        }),

        new ol.style.Style({
            zIndex: z + 1,

            stroke: new ol.style.Stroke({
                color,
                width
            })
        })
    ];
}

// FICTIONAL GAME NETWORK
// Not real street navigation or obstacle locations.

function buildCheckpoints() {

    const a = ol.proj.fromLonLat(mission.start);
    const b = ol.proj.fromLonLat(mission.end);

    return Array.from(
        { length: mission.steps + 1 },

        (_, i) => [
            a[0] + (b[0] - a[0]) * i / mission.steps,
            a[1] + (b[1] - a[1]) * i / mission.steps
        ]
    );
}

function buildRoutes(a, b) {

    const dx = b[0] - a[0];
    const dy = b[1] - a[1];

    const length = Math.hypot(dx, dy);

    const nx = -dy / length;
    const ny = dx / length;

    const at = (t, offset) => [
        a[0] + dx * t + nx * offset,
        a[1] + dy * t + ny * offset
    ];

    const obstacleIndex = Math.floor(Math.random() * 3);

    return [-0.34, 0, 0.47].map((offset, i) => {

        const coords = [
            a,
            at(0.25, length * offset),
            at(0.75, length * offset),
            b
        ];

        const geometry = new ol.geom.LineString(coords);

        const feature = new ol.Feature({
            geometry,
            routeIndex: i
        });

        feature.setStyle(lineStyle(colors[i]));

        return {
            feature,
            geometry,

            km: ol.sphere.getLength(geometry) / 1000,

            obstacle: i === obstacleIndex
                ? (Math.random() < 0.5 ? "taxi" : "stand")
                : null
        };
    });
}

// DASHBOARD

function updateDashboard() {

    $("balance").textContent = money(balance);
    $("level").textContent = "1/3";
    $("hint-count").textContent = hints;

    const percent = Math.round(
        100 * step / mission.steps
    );

    $("trip-progress").value = percent;
    $("progress-text").textContent = "%" + percent;
}

function updateControls() {

    routeButtons.forEach(button => {
        button.disabled = !active || busy;
    });

    $("hint-btn").disabled =
        !active || busy || revealed || hints === 0;
}

// DRAW ROUTES

function drawStep() {

    vectorSource.clear();

    revealed = false;
    busy = false;

    travelled.forEach(coords => {

        const feature = new ol.Feature(
            new ol.geom.LineString(coords)
        );

        feature.setStyle(lineStyle("#75847b", 3, 0));

        vectorSource.addFeature(feature);
    });

    const a = checkpoints[step];
    const b = checkpoints[step + 1];

    routes = buildRoutes(a, b);

    routes.forEach((route, i) => {

        vectorSource.addFeature(route.feature);

        $("distance-" + (i + 1)).textContent =
            route.km.toFixed(2) + " km";
    });

    if (step > 0) {
        pointFeature(
            checkpoints[0],
            "A - Kızılay",
            "#32bd72"
        );
    }

    pointFeature(
        checkpoints[mission.steps],
        "B - Bahçelievler",
        "#ef4444"
    );

    if (step + 1 < mission.steps) {
        pointFeature(
            b,
            "Ara nokta " + (step + 1),
            "#586671"
        );
    }

    vehicle = pointFeature(
        a, "", "#17231c", "🚗", 30
    );

    updateDashboard();
    updateControls();

    $("customer-message").textContent =
        `Müşteri: Hadi gidelim! | Etap ${step + 1}/${mission.steps} | Kurgusal oyun rotaları`;

    const extent = ol.extent.createEmpty();

    routes.forEach(route => {
        ol.extent.extend(
            extent,
            route.geometry.getExtent()
        );
    });

    map.updateSize();

    map.getView().fit(extent, {
        padding: [55, 55, 55, 55],
        maxZoom: 16,
        duration: 350
    });
}

// OBSTACLES AND HINTS

function revealObstacle(route) {

    pointFeature(
        route.geometry.getCoordinateAt(0.55),
        "",
        "#e8b92c",
        route.obstacle === "stand" ? "🚏" : "🚕",
        20
    );
}

function useHint() {

    if (!active || busy || revealed || hints === 0) {
        return;
    }

    hints--;
    revealed = true;

    routes.filter(route => route.obstacle)
        .forEach(revealObstacle);

    updateDashboard();
    updateControls();

    $("customer-message").textContent =
        "İpucu: 🚕 Taksi / 🚏 Taksi durağı işareti görünen rota oyun engeli içeriyor.";
}

// VEHICLE ANIMATION

function chooseRoute(index) {

    if (!active || busy || !routes[index]) return;

    busy = true;
    updateControls();

    const route = routes[index];

    route.feature.setStyle(
        lineStyle(colors[index], 8, 5)
    );

    if (route.obstacle && !revealed) {
        revealObstacle(route);
    }

    const target = route.obstacle ? 0.55 : 1;

    const duration = Math.min(
        6500,
        3000 + route.km * 2000
    ) * target;

    const start = performance.now();

    $("customer-message").textContent =
        "Araç ilerliyor...";

    function move(now) {

        if (!active) return;

        const fraction = Math.min(
            1,
            (now - start) / duration
        );

        vehicle.getGeometry().setCoordinates(
            route.geometry.getCoordinateAt(
                fraction * target
            )
        );

        if (fraction < 1) {
            animation = requestAnimationFrame(move);
            return;
        }

        if (route.obstacle) {

            finishGame(
                false,
                route.obstacle === "stand"
                    ? "Taksi durağına yakalandın!"
                    : "Taksiciye yakalandın!"
            );

            return;
        }

        travelled.push(
            route.geometry.getCoordinates()
        );

        step++;
        updateDashboard();

        if (step === mission.steps) {

            balance += mission.reward;

            finishGame(
                true,
                "Müşteriyi ulaştırdın! +350 TL"
            );

        } else {
            drawStep();
        }
    }

    animation = requestAnimationFrame(move);
}

// START MISSION

function startMission() {

    if (typeof ol === "undefined") {

        showModal(
            "Harita yüklenemedi",
            "OpenLayers bağlantısını kontrol et.",
            "TAMAM"
        );

        return;
    }

    showScreen("game-screen");

    initializeMap();

    checkpoints = buildCheckpoints();

    active = true;

    drawStep();

    gameTimer.start(mission.time);
}

// MODAL

function showModal(title, message, buttonText) {

    $("modal-title").textContent = title;
    $("modal-message").textContent = message;

    const button = document.createElement("button");

    button.className = "primary-btn";
    button.textContent = buttonText;

    button.addEventListener("click", () => {
        $("game-modal").close();
    });

    $("modal-actions").replaceChildren(button);

    $("game-modal").showModal();
}

// HIGH SCORE

function readRecord() {

    try {
        return Number(
            localStorage.getItem("tagStage1Record")
        ) || 0;

    } catch {
        return 0;
    }
}

// GAME RESULT

function finishGame(success, message) {

    resetMotion();
    updateControls();

    $("result-title").textContent =
        success ? "1. Görev Tamamlandı!" : "Oyun Bitti!";

    $("result-message").textContent = message;
    $("final-score").textContent = money(balance);

    let record = readRecord();

    if (success && balance > record) {

        record = balance;

        try {
            localStorage.setItem(
                "tagStage1Record",
                String(record)
            );
        } catch {
            // Storage unavailable
        }
    }

    $("high-score").textContent =
        "1. görev rekoru: " + money(record);

    $("statistics-chart").hidden = true;

    showScreen("result-screen");
}

// EVENT HANDLERS

$("start-btn").addEventListener(
    "click", prepareMission
);

$("accept-btn").addEventListener(
    "click", startMission
);

routeButtons.forEach(button => {

    button.addEventListener("click", () => {
        chooseRoute(Number(button.dataset.route));
    });
});

$("hint-btn").addEventListener(
    "click", useHint
);

$("help-btn").addEventListener("click", () => {

    showModal(
        "Nasıl Oynanır?",
        "Talebi kabul et, üç rotadan birini seç ve dört etabı tamamla. Üç ipucu hakkın var. Süre dolarsa veya taksi engeline denk gelirsen oyun biter. Tüm rotalar ve engeller kurgusaldır.",
        "ANLADIM"
    );
});

$("record-btn").addEventListener("click", () => {

    showModal(
        "1. Görev Rekoru",
        money(readRecord()),
        "TAMAM"
    );
});

$("sound-btn").addEventListener("click", () => {

    soundEnabled = !soundEnabled;

    $("sound-btn").textContent =
        soundEnabled
            ? "🔊 SES: AÇIK"
            : "🔇 SES: KAPALI";
});

$("restart-btn").addEventListener(
    "click", prepareMission
);

$("menu-btn").addEventListener("click", () => {

    resetMotion();

    showScreen("main-menu");
});

updateControls();

console.log("TAG KAC! Stage 7 initialized.");
