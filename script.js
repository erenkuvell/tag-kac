"use strict";

const $ = id => document.getElementById(id);
const colors = ["#419cff", "#b48bff", "#79b925"];
const money = n => n.toLocaleString("tr-TR") + " TL";

// MISSION DATA

const missions = [
    {
        customer: "Ahmet",
        pickup: "Kızılay",
        destination: "Bahçelievler",
        start: [32.8541, 39.9208],
        end: [32.8277, 39.9256],
        reward: 350,
        time: 120,
        hints: 3,
        steps: 4
    },
    {
        customer: "Zeynep",
        pickup: "Bahçelievler",
        destination: "Anıtkabir",
        start: [32.8277, 39.9256],
        end: [32.8376, 39.9250],
        reward: 650,
        time: 150,
        hints: 3,
        steps: 5
    },
    {
        customer: "Mehmet",
        pickup: "Anıtkabir",
        destination: "Ulus",
        start: [32.8376, 39.9250],
        end: [32.8549, 39.9417],
        reward: 1000,
        time: 180,
        hints: 2,
        steps: 6
    }
];

const messages = [
    "Abi, navigasyon açık değil mi?",
    "Çok güzel Ankara manzarası!",
    "Bu yol biraz uzun sanki...",
    "Az kaldı mı?",
    "Şimdilik her şey yolunda!"
];

const routeButtons = [
    ...document.querySelectorAll(".route-btn")
];

let map, source, vehicle;

let level = 0;
let step = 0;
let balance = 1000;
let hints = 3;

let active = false;
let busy = false;
let revealed = false;
let soundEnabled = true;

let animation = 0;
let routes = [];
let checkpoints = [];
let travelled = [];
let results = [];

let penalties = 0;
let distance = 0;

const current = () => missions[level];


// SCREEN MANAGEMENT

function showScreen(id) {
    document.querySelectorAll(".screen")
        .forEach(s => s.hidden = s.id !== id);
}


// COUNTDOWN TIMER - CLOSURE

function createTimer() {

    let interval = null;
    let deadline = 0;

    function remaining() {
        return Math.max(
            0,
            Math.ceil((deadline - Date.now()) / 1000)
        );
    }

    function stop() {
        clearInterval(interval);
        interval = null;
    }

    function render() {

        const r = remaining();

        $("timer").textContent =
            String(Math.floor(r / 60)).padStart(2, "0")
            + ":" +
            String(r % 60).padStart(2, "0");

        $("timer").classList.toggle(
            "danger", r <= 15
        );

        if (!r && active) {
            finishGame(false, "Süren doldu!");
        }
    }

    function start(seconds) {
        stop();
        deadline = Date.now() + seconds * 1000;
        render();
        interval = setInterval(render, 200);
    }

    return { start, stop, remaining };
}

const timer = createTimer();


function closeModal() {
    if ($("game-modal").open) {
        $("game-modal").close();
    }
}

function stopMotion() {

    cancelAnimationFrame(animation);

    animation = 0;

    timer.stop();

    active = false;
    busy = false;
}


// PASSENGER REQUEST

function prepareMission(reset = true) {

    closeModal();
    stopMotion();

    if (reset) {
        level = 0;
        balance = 1000;
        results = [];
    }

    const m = current();

    step = 0;
    hints = m.hints;
    travelled = [];
    penalties = 0;
    distance = 0;

    $("customer-name").textContent =
        `Seviye ${level + 1}/3 · Müşteri: ${m.customer}`;

    $("pickup-location").textContent = m.pickup;

    $("destination-location").textContent =
        m.destination;

    $("trip-reward").textContent = money(m.reward);

    showScreen("request-screen");
}


// OPENLAYERS MAP

function initializeMap() {

    if (map) {
        map.updateSize();
        return;
    }

    source = new ol.source.Vector();

    map = new ol.Map({

        target: "map",

        layers: [
            new ol.layer.Tile({
                source: new ol.source.OSM()
            }),

            new ol.layer.Vector({ source })
        ],

        view: new ol.View({
            center: ol.proj.fromLonLat(current().start),
            zoom: 14
        })
    });

    map.addControl(new ol.control.ScaleLine());

    map.on("singleclick", e => {

        if (!active || busy) return;

        const hit = map.forEachFeatureAtPixel(

            e.pixel,

            f => Number.isInteger(
                f.get("routeIndex")
            ) ? f : undefined,

            { hitTolerance: 7 }
        );

        if (hit) {

            chooseRoute(hit.get("routeIndex"));

        } else {

            const [lon, lat] =
                ol.proj.toLonLat(e.coordinate);

            $("customer-message").textContent =
                `Koordinat: ${lat.toFixed(5)}° N, ${lon.toFixed(5)}° E`;
        }
    });
}


// POINT GEOMETRY

function point(
    coordinate,
    label,
    color,
    icon = "",
    z = 10
) {

    const f = new ol.Feature(
        new ol.geom.Point(coordinate)
    );

    f.setStyle(new ol.style.Style({

        zIndex: z,

        image: new ol.style.Circle({

            radius: icon ? 18 : 10,

            fill: new ol.style.Fill({ color }),

            stroke: new ol.style.Stroke({
                color: "#fff",
                width: 2
            })
        }),

        text: new ol.style.Text({

            text: icon || label,

            font: icon
                ? "22px Arial"
                : "bold 13px Arial",

            offsetY: icon ? 0 : -22,

            fill: new ol.style.Fill({
                color: "#fff"
            }),

            stroke: icon
                ? undefined
                : new ol.style.Stroke({
                    color: "#101512",
                    width: 4
                })
        })
    }));

    source.addFeature(f);

    return f;
}


// LINE GEOMETRY STYLING

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


// CHECKPOINT GENERATION

function buildCheckpoints() {

    const m = current();

    const a = ol.proj.fromLonLat(m.start);
    const b = ol.proj.fromLonLat(m.end);

    return Array.from(

        { length: m.steps + 1 },

        (_, i) => [

            a[0] + (b[0] - a[0]) * i / m.steps,

            a[1] + (b[1] - a[1]) * i / m.steps

        ]
    );
}


// FICTIONAL GAME ROUTES
// No real obstacle or police location data.

function buildRoutes(a, b) {

    const dx = b[0] - a[0];
    const dy = b[1] - a[1];

    const len = Math.hypot(dx, dy);

    const at = (t, o) => [
        a[0] + dx * t - dy / len * o,
        a[1] + dy * t + dx / len * o
    ];

    const taxi = Math.floor(Math.random() * 3);

    const police =
        level > 0 &&
        (step % 2 === 1 || (level === 2 && step === 4))

        ? (taxi + 1 + Math.floor(Math.random() * 2)) % 3

        : -1;

    return [-0.34, 0, 0.47].map((offset, i) => {

        const geometry = new ol.geom.LineString([

            a,

            at(0.25, len * offset),

            at(0.75, len * offset),

            b
        ]);

        const feature = new ol.Feature({
            geometry,
            routeIndex: i
        });

        feature.setStyle(lineStyle(colors[i]));

        return {

            feature,

            geometry,

            km: ol.sphere.getLength(geometry) / 1000,

            obstacle: i === taxi

                ? (Math.random() < 0.5 ? "taxi" : "stand")

                : i === police
                    ? "police"
                    : null,

            marker: null
        };
    });
}


// DASHBOARD

function dashboard() {

    $("balance").textContent = money(balance);

    $("level").textContent = `${level + 1}/3`;

    $("hint-count").textContent = hints;

    const p = Math.round(
        100 * step / current().steps
    );

    $("trip-progress").value = p;

    $("progress-text").textContent = "%" + p;
}


function controls() {

    routeButtons.forEach(
        b => b.disabled = !active || busy
    );

    $("hint-btn").disabled =
        !active || busy || revealed || hints === 0;
}


// DISPLAY ROUTES

function drawStep() {

    source.clear();

    revealed = false;
    busy = false;

    travelled.forEach(coords => {

        const f = new ol.Feature(
            new ol.geom.LineString(coords)
        );

        f.setStyle(
            lineStyle("#75847b", 3, 0)
        );

        source.addFeature(f);
    });

    routes = buildRoutes(
        checkpoints[step],
        checkpoints[step + 1]
    );

    const extent = ol.extent.createEmpty();

    routes.forEach((r, i) => {

        source.addFeature(r.feature);

        ol.extent.extend(
            extent,
            r.geometry.getExtent()
        );

        $("distance-" + (i + 1)).textContent =
            r.km.toFixed(2) + " km";
    });

    const m = current();

    if (step > 0) {

        point(
            checkpoints[0],
            "A - " + m.pickup,
            "#32bd72"
        );
    }

    point(
        checkpoints[m.steps],
        "B - " + m.destination,
        "#ef4444"
    );

    if (step + 1 < m.steps) {

        point(
            checkpoints[step + 1],
            "Ara nokta " + (step + 1),
            "#586671"
        );
    }

    vehicle = point(
        checkpoints[step],
        "",
        "#17231c",
        "🚗",
        30
    );

    dashboard();
    controls();

    $("customer-message").textContent =
        `${m.customer}: ${messages[step % messages.length]} | Etap ${step + 1}/${m.steps} · Kurgusal rota`;

    map.updateSize();

    map.getView().fit(extent, {
        padding: [50, 50, 50, 50],
        maxZoom: 16,
        duration: 350
    });
}


// OBSTACLES

function revealObstacle(r) {

    if (!r.obstacle || r.marker) return;

    const icon = r.obstacle === "police"

        ? "🚔"

        : r.obstacle === "stand"
            ? "🚏"
            : "🚕";

    r.marker = point(

        r.geometry.getCoordinateAt(0.55),

        "",

        r.obstacle === "police"
            ? "#419cff"
            : "#e8b92c",

        icon,

        20
    );
}


// HINT SYSTEM

function useHint() {

    if (!active || busy || revealed || hints === 0) {
        return;
    }

    hints--;

    revealed = true;

    routes.forEach(revealObstacle);

    dashboard();
    controls();

    $("customer-message").textContent =
        "İpucu: İşaretli rotalar kurgusal oyun engeli içeriyor.";
}


// VEHICLE ANIMATION

function animateRoute(r, from, to, done) {

    const duration = Math.min(
        9500,
        5500 + r.km * 2000
    ) * (to - from);

    const start = performance.now();

    function move(now) {

        if (!active) return;

        if (timer.remaining() === 0) {
            finishGame(false, "Süren doldu!");
            return;
        }

        const f = Math.min(
            1,
            (now - start) / duration
        );

        vehicle.getGeometry().setCoordinates(

            r.geometry.getCoordinateAt(
                from + (to - from) * f
            )
        );

        if (f < 1) {

            animation = requestAnimationFrame(move);

        } else {

            done();
        }
    }

    animation = requestAnimationFrame(move);
}


// ROUTE SELECTION

function chooseRoute(i) {

    if (!active || busy || !routes[i]) return;

    if (timer.remaining() === 0) {
        finishGame(false, "Süren doldu!");
        return;
    }

    busy = true;

    controls();

    const r = routes[i];

    r.feature.setStyle(
        lineStyle(colors[i], 8, 5)
    );

    $("customer-message").textContent =
        "Araç ilerliyor...";

    animateRoute(

        r,

        0,

        r.obstacle ? 0.55 : 1,

        () => {

            if (!r.obstacle) {

                completeStep(r);

                return;
            }

            revealObstacle(r);

            if (r.obstacle === "police") {

                policeEncounter(r);

            } else {

                finishGame(

                    false,

                    r.obstacle === "stand"

                    ? "Taksi durağı engeline denk geldin!"

                    : "Taksi engeline denk geldin!"
                );
            }
        }
    );
}


// SIMULATED POLICE ENCOUNTER

function policeEncounter(r) {

    const actions = [];

    if (balance >= 500) {

        actions.push([

            "500 TL ÖDE VE DEVAM ET",

            () => {

                if (!active || timer.remaining() === 0) {
                    finishGame(false, "Süren doldu!");
                    return;
                }

                balance -= 500;

                penalties++;

                dashboard();

                animateRoute(
                    r,
                    0.55,
                    1,
                    () => completeStep(r)
                );
            }
        ]);
    }

    actions.push([

        "YENİDEN BAŞLAT",

        () => prepareMission(true)
    ]);

    modal(

        "🚔 Trafik kontrolü",

        balance >= 500

            ? "Kurgusal oyun cezası: 500 TL. Süre devam ediyor."

            : "Sanal bakiyen yetersiz. Oyunu yeniden başlatmalısın.",

        actions
    );

    if (balance < 500) {

        timer.stop();

        active = false;

        controls();
    }
}


// COMPLETE CHECKPOINT

function completeStep(r) {

    travelled.push(
        r.geometry.getCoordinates()
    );

    distance += r.km;

    step++;

    dashboard();

    if (step === current().steps) {

        completeMission();

    } else {

        drawStep();
    }
}


// MISSION COMPLETION AND RATING

function completeMission() {

    const m = current();

    const remaining = timer.remaining();

    stopMotion();

    controls();

    balance += m.reward;

    dashboard();

    const stars = Math.max(

        1,

        Math.min(
            5,
            5 - penalties -
            (remaining < m.time / 4 ? 1 : 0)
        )
    );

    results.push({

        reward: m.reward,

        fines: penalties * 500,

        distance,

        stars
    });

    const summary =
        `${m.customer} varış noktasında! +${money(m.reward)} · ${"★".repeat(stars)}${"☆".repeat(5 - stars)} · Bakiye: ${money(balance)}`;

    if (level === missions.length - 1) {

        finishGame(true, summary);

    } else {

        modal(

            "Görev tamamlandı!",

            summary,

            [[

                "SONRAKİ MÜŞTERİ",

                () => {

                    level++;

                    prepareMission(false);
                }
            ]]
        );
    }
}


// START MISSION

function startMission() {

    if (typeof ol === "undefined") {

        modal(

            "Harita yüklenemedi",

            "OpenLayers bağlantısını kontrol et.",

            [["TAMAM", () => {}]]
        );

        return;
    }

    showScreen("game-screen");

    initializeMap();

    checkpoints = buildCheckpoints();

    active = true;

    timer.start(current().time);

    drawStep();
}


// MODAL WINDOW

function modal(title, message, actions) {

    closeModal();

    $("modal-title").textContent = title;

    $("modal-message").textContent = message;

    $("modal-actions").replaceChildren();

    actions.forEach(([label, fn], i) => {

        const b = document.createElement("button");

        b.className = i === 0
            ? "primary-btn"
            : "secondary-btn";

        b.textContent = label;

        b.addEventListener("click", () => {

            closeModal();

            fn();
        });

        $("modal-actions").appendChild(b);
    });

    $("game-modal").showModal();
}


// HIGH SCORE

function readRecord() {

    try {

        return Number(
            localStorage.getItem("tagFullGameRecord")
        ) || 0;

    } catch {

        return 0;
    }
}


// GAME OVER

function finishGame(success, message) {

    closeModal();

    stopMotion();

    controls();

    let record = readRecord();

    if (success && balance > record) {

        record = balance;

        try {

            localStorage.setItem(
                "tagFullGameRecord",
                String(record)
            );

        } catch {}
    }

    $("result-title").textContent = success

        ? "🏆 TAG EFSANESİ!"

        : "Oyun Bitti!";

    $("result-message").textContent =
        message + ` | Tamamlanan görev: ${results.length}/3`;

    $("final-score").textContent = money(balance);

    $("high-score").textContent =
        "En yüksek skor: " + money(record);

    $("statistics-chart").hidden = true;

    showScreen("result-screen");
}


// EVENT HANDLERS

$("start-btn").addEventListener(

    "click",

    () => prepareMission(true)
);

$("accept-btn").addEventListener(
    "click", startMission
);

routeButtons.forEach(b => {

    b.addEventListener("click", () => {

        chooseRoute(Number(b.dataset.route));
    });
});

$("hint-btn").addEventListener(
    "click", useHint
);

$("help-btn").addEventListener("click", () => {

    modal(

        "Nasıl Oynanır?",

        "Üç müşteri görevini süre dolmadan tamamla. Her etapta üç rotadan birini seç. İpuçları kurgusal engelleri gösterir. Taksi engeli oyunu bitirir; polis engelinde sanal ceza ödeyebilirsin.",

        [["ANLADIM", () => {}]]
    );
});

$("record-btn").addEventListener("click", () => {

    modal(

        "En Yüksek Skor",

        money(readRecord()),

        [["TAMAM", () => {}]]
    );
});

$("sound-btn").addEventListener("click", () => {

    soundEnabled = !soundEnabled;

    $("sound-btn").textContent = soundEnabled

        ? "🔊 SES: AÇIK"

        : "🔇 SES: KAPALI";
});

$("restart-btn").addEventListener(

    "click",

    () => prepareMission(true)
);

$("menu-btn").addEventListener("click", () => {

    stopMotion();

    showScreen("main-menu");
});

$("game-modal").addEventListener(
    "cancel",
    e => e.preventDefault()
);

controls();
