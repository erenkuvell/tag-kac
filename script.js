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
        : "YAKALANDIN!";

    $("result-message").textContent =
        success
            ? message + ` | Tamamlanan görev: ${results.length}/3`
            : message;

    $("final-score").textContent = money(balance);

    $("high-score").textContent =
        "En yüksek skor: " + money(record);

    $("statistics-chart").hidden = true;

    $("result-image").hidden = success;

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
// ADIM 9 - REAL ROAD NETWORK

let roadGraph = null;
let roadLegs = [];

const roadCache = new Map();
const edgeKey = (a,b) => `${a}:${b}`;

async function loadRoadGraph() {

    if (roadGraph) return roadGraph;

    const query = `[out:json][timeout:25];
way["highway"~"^(primary|secondary|tertiary|unclassified|residential|living_street|primary_link|secondary_link|tertiary_link|trunk|trunk_link|service)$"](39.910,32.810,39.952,32.875);
out geom;`;

    const url = "./roads.json";

    const response = await fetch(url, {
        signal: AbortSignal.timeout(35000)
    });

    if (!response.ok) {
        throw new Error("OSM HTTP " + response.status);
    }

    const data = await response.json();

    const nodes = new Map();
    const edges = new Map();
    const incoming = new Set();

    function addEdge(a,b) {

        if (a === b) return;

        const p = nodes.get(a);
        const q = nodes.get(b);

        const w = Math.hypot(
            p[0]-q[0], p[1]-q[1]
        );

        if (!w) return;

        if (!edges.has(a)) edges.set(a, []);

        edges.get(a).push({to:b,w});
        incoming.add(b);
    }

    for (const way of data.elements || []) {

        if (!way.geometry || !way.nodes) continue;

        const t = way.tags || {};

        if (["private","no"].includes(
            t.motor_vehicle || t.motorcar || t.access
        )) continue;

        if (["parking_aisle","driveway","drive-through"]
            .includes(t.service)) continue;

        way.nodes.forEach((id,i) => {

            const p = way.geometry[i];

            if (p) nodes.set(
                id,
                ol.proj.fromLonLat([p.lon,p.lat])
            );
        });

        const reverse = t.oneway === "-1";

        const forward =
            ["yes","1","true"].includes(t.oneway) ||
            (t.junction === "roundabout"
                && t.oneway !== "no");

        for (let i=1;i<way.nodes.length;i++) {

            const a = way.nodes[i-1];
            const b = way.nodes[i];

            if (!nodes.has(a) || !nodes.has(b)) continue;

            if (!reverse) addEdge(a,b);
            if (!forward) addEdge(b,a);
        }
    }

    if (!edges.size) {
        throw new Error("Yol verisi boş");
    }

    roadGraph = {nodes,edges,incoming};

    return roadGraph;
}


// SNAP COORDINATES TO ROAD NETWORK

function nearestRoad(lonLat,graph,start) {

    const p = ol.proj.fromLonLat(lonLat);

    let best;
    let d = Infinity;

    for (const [id,q] of graph.nodes) {

        if (start
            ? !graph.edges.has(id)
            : !graph.incoming.has(id)) continue;

        const n = Math.hypot(
            p[0]-q[0],p[1]-q[1]
        );

        if (n < d) {
            d = n;
            best = id;
        }
    }

    return best;
}


// A* SHORTEST PATH ALGORITHM

function roadPath(
    g,a,b,
    used = new Map(),
    factor = 0,
    blocked = ""
) {

    const goal = g.nodes.get(b);

    const h = id => {

        const p = g.nodes.get(id);

        return Math.hypot(
            p[0]-goal[0],p[1]-goal[1]
        );
    };

    const best = new Map([[a,0]]);
    const prev = new Map();

    const queue = [[a,0,h(a)]];

    while (queue.length) {

        queue.sort((x,y) => y[2]-x[2]);

        const [u,cost] = queue.pop();

        if (cost !== best.get(u)) continue;

        if (u === b) {

            const path = [b];

            while (path[0] !== a) {
                path.unshift(prev.get(path[0]));
            }

            return path;
        }

        for (const e of g.edges.get(u) || []) {

            const key = edgeKey(u,e.to);

            if (key === blocked) continue;

            const next = cost +
                e.w * (1 + factor * (used.get(key)||0));

            if (next >= (best.get(e.to) ?? Infinity)) {
                continue;
            }

            best.set(e.to,next);
            prev.set(e.to,u);

            queue.push([
                e.to,next,next+h(e.to)
            ]);
        }
    }

    return null;
}


function pathLength(g,path) {

    let sum = 0;

    for (let i=1;i<path.length;i++) {

        const a = g.nodes.get(path[i-1]);
        const b = g.nodes.get(path[i]);

        sum += Math.hypot(
            a[0]-b[0],a[1]-b[1]
        );
    }

    return sum;
}


// THREE DIFFERENT ROAD ALTERNATIVES

function threeRoadPaths(g,a,b) {

    const first = roadPath(g,a,b);

    if (!first || first.length < 2) return null;

    const paths = [first];

    const keys = new Set([first.join(",")]);

    const used = new Map();

    function mark(p) {

        for (let i=1;i<p.length;i++) {

            const k = edgeKey(p[i-1],p[i]);

            used.set(k,(used.get(k)||0)+1);
        }
    }

    function add(p) {

        if (!p || keys.has(p.join(","))) return false;

        keys.add(p.join(","));
        paths.push(p);
        mark(p);

        return true;
    }

    mark(first);

    for (const f of [0.6,1.5,3,6,12]) {

        add(roadPath(g,a,b,used,f));

        if (paths.length === 3) break;
    }

    if (paths.length < 3) {

        const candidates = [];

        for (const p of paths) {

            const stride = Math.max(
                1,Math.floor((p.length-1)/10)
            );

            for (let i=1;i<p.length;i+=stride) {

                const q = roadPath(
                    g,a,b,used,0,
                    edgeKey(p[i-1],p[i])
                );

                if (q && !keys.has(q.join(","))) {
                    candidates.push(q);
                }
            }
        }

        candidates.sort(
            (x,y) => pathLength(g,x)-pathLength(g,y)
        );

        for (const p of candidates) {

            add(p);

            if (paths.length === 3) break;
        }
    }

    return paths.length === 3 ? paths : null;
}


// PREPARE MISSION CHECKPOINTS

function prepareRoadLegs(g,m) {

    const a = nearestRoad(m.start,g,true);
    const b = nearestRoad(m.end,g,false);

    if (a === undefined || b === undefined) {
        throw new Error("Başlangıç/varış bulunamadı");
    }

    const main = roadPath(g,a,b);

    if (!main || main.length <= m.steps) {
        throw new Error("Yeterli yol bağlantısı yok");
    }

    const indices = [0];
    const cum = [0];

    for (let i=1;i<main.length;i++) {

        cum.push(
            cum[i-1] +
            pathLength(g,main.slice(i-1,i+1))
        );
    }

    for (let i=1;i<m.steps;i++) {

        const target =
            cum[cum.length-1]*i/m.steps;

        let j = cum.findIndex(x => x >= target);

        j = Math.max(
            indices[i-1]+1,
            Math.min(
                j,
                main.length-1-(m.steps-i)
            )
        );

        indices.push(j);
    }

    indices.push(main.length-1);

    const legs = [];

    for (let i=1;i<indices.length;i++) {

        const paths = threeRoadPaths(
            g,
            main[indices[i-1]],
            main[indices[i]]
        );

        if (!paths) {
            throw new Error(
                `${i}. etapta üç farklı bağlantı bulunamadı`
            );
        }

        legs.push(
            paths.map(
                p => p.map(id => g.nodes.get(id))
            )
        );
    }

    return {
        legs,
        checkpoints: indices.map(
            i => g.nodes.get(main[i])
        )
    };
}


// REPLACE SYNTHETIC ROUTES

buildRoutes = function() {

    const taxi = Math.floor(Math.random()*3);

    const police =
        level > 0 && step % 2 === 0

        ? (taxi+1+Math.floor(Math.random()*2))%3

        : -1;

    return roadLegs[step].map((coords,i) => {

        const geometry =
            new ol.geom.LineString(coords);

        const feature = new ol.Feature({
            geometry,
            routeIndex:i
        });

        feature.setStyle(lineStyle(colors[i]));

        return {

            feature,
            geometry,

            km: ol.sphere.getLength(geometry)/1000,

            obstacle: i === taxi

                ? (Math.random()<0.5
                    ? "taxi"
                    : "stand")

                : i === police
                    ? "police"
                    : null,

            marker:null
        };
    });
};


// LOAD REAL ROADS BEFORE STARTING TIMER

$("accept-btn").removeEventListener(
    "click",startMission
);

startMission = async function() {

    const button = $("accept-btn");

    button.disabled = true;

    button.textContent = "YOLLAR HAZIRLANIYOR...";

    try {

        if (typeof ol === "undefined") {
            throw new Error("OpenLayers yüklenmedi");
        }

        const graph = await loadRoadGraph();

        if (!roadCache.has(level)) {

            roadCache.set(
                level,
                prepareRoadLegs(graph,current())
            );
        }

        const data = roadCache.get(level);

        roadLegs = data.legs;
        checkpoints = data.checkpoints;

        showScreen("game-screen");

        initializeMap();

        active = true;

        timer.start(current().time);

        drawStep();

    } catch(e) {

        stopMotion();

        showScreen("request-screen");

        modal(
            "Yol verisi hazırlanamadı",
            e.message + " — Tekrar deneyebilirsin.",
            [["TAMAM",()=>{}]]
        );

        console.error(e);

    } finally {

        button.disabled = false;

        button.textContent = "TALEBİ KABUL ET";
    }
};

$("accept-btn").addEventListener(
    "click",startMission
);


// IMMEDIATE TAXI GAME OVER

chooseRoute = function(i) {

    if (!active || busy || !routes[i]) return;

    if (!timer.remaining()) {

        finishGame(false,"Süren doldu!");

        return;
    }

    busy = true;

    controls();

    const r = routes[i];

    r.feature.setStyle(
        lineStyle(colors[i],8,5)
    );

   if (r.obstacle === "taxi" ||
    r.obstacle === "stand") {

    revealObstacle(r);

    stopMotion();

    controls();

    const msg = r.obstacle === "taxi"
        ? "🚕 Taksiciye yakalandın! Yolculuk yarıda kaldı."
        : "🚏 Taksi durağı engeline yakalandın! Yolculuk yarıda kaldı.";

    $("customer-message").textContent = msg;

    finishGame(false, msg);

    return;
}

    if (r.obstacle === "police") {

        $("customer-message").textContent =
            "Araç ilerliyor...";

        animateRoute(r,0,0.55,()=>{

            revealObstacle(r);

            policeEncounter(r);
        });

        return;
    }

    $("customer-message").textContent =
        "Araç ilerliyor...";

    animateRoute(
        r,0,1,
        () => completeStep(r)
    );
};


// IMPROVED HINT LABELS

$("hint-btn").removeEventListener(
    "click",useHint
);

const oldUseHint = useHint;

useHint = function() {

    if (!active || busy || revealed || hints===0) {
        return;
    }

    oldUseHint();

    const labels = {
        taxi:"🚕 Taksi",
        stand:"🚏 Taksi durağı",
        police:"🚔 Polis"
    };

    $("customer-message").textContent =

        "Oyun ipucu: " +

        routes.map((r,i) =>

            r.obstacle
                ? `Rota ${i+1}: ${labels[r.obstacle]}`
                : ""

        ).filter(Boolean).join(" | ");
};

$("hint-btn").addEventListener(
    "click",useHint
);
// ==========================================
// STAGE 11 - SOUND EFFECTS
// ==========================================

let audioContext = null;

function unlockAudio() {

    if (!soundEnabled) return;

    try {

        const AudioClass =
            window.AudioContext ||
            window.webkitAudioContext;

        if (!AudioClass) return;

        if (!audioContext) {
            audioContext = new AudioClass();
        }

        if (audioContext.state === "suspended") {
            audioContext.resume().catch(() => {});
        }

    } catch (error) {
        console.warn("Ses başlatılamadı.", error);
    }
}

document.addEventListener(
    "click",
    unlockAudio,
    true
);

function playTone(
    frequency,
    duration = 0.2,
    delay = 0,
    type = "sine",
    volume = 0.07,
    endFrequency = frequency
) {

    if (!soundEnabled || !audioContext) return;

    if (audioContext.state !== "running") return;

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    const start = audioContext.currentTime + delay;

    oscillator.type = type;

    oscillator.frequency.setValueAtTime(
        frequency, start
    );

    oscillator.frequency.linearRampToValueAtTime(
        endFrequency, start + duration
    );

    gain.gain.setValueAtTime(0.001, start);

    gain.gain.exponentialRampToValueAtTime(
        volume, start + 0.015
    );

    gain.gain.exponentialRampToValueAtTime(
        0.001, start + duration
    );

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
}


// SOUND EFFECT LIBRARY

function playEffect(name) {

    if (!soundEnabled) return;

    switch (name) {

        case "request":

            playTone(660, 0.15);
            playTone(880, 0.20, 0.17);
            playTone(1100, 0.25, 0.38);

            break;


        case "drive":

            playTone(
                75, 0.55, 0,
                "sawtooth", 0.035, 150
            );

            break;


        case "hint":

            playTone(900, 0.15);
            playTone(1300, 0.20, 0.15);

            break;


        case "police":

            for (let i = 0; i < 4; i++) {

                playTone(
                    650, 0.25, i * 0.5,
                    "triangle", 0.07, 1100
                );

                playTone(
                    1100, 0.25, i * 0.5 + 0.25,
                    "triangle", 0.07, 650
                );
            }

            break;


        case "money":

            playTone(850, 0.15);
            playTone(1100, 0.15, 0.15);
            playTone(1500, 0.25, 0.30);

            break;


        case "caught":

            playTone(330, 0.25, 0, "square", 0.04);
            playTone(220, 0.30, 0.25, "square", 0.04);
            playTone(110, 0.50, 0.55, "triangle");

            break;


        case "victory":

            [523, 659, 784, 1047].forEach(
                (frequency, i) => {

                    playTone(
                        frequency,
                        0.35,
                        i * 0.20,
                        "triangle"
                    );
                }
            );

            break;
    }
}


// PASSENGER REQUEST SOUND

const originalPrepareMission11 = prepareMission;

prepareMission = function(reset = true) {

    originalPrepareMission11(reset);

    playEffect("request");
};


// HINT SOUND

$("hint-btn").addEventListener("click", () => {

    playEffect("hint");
});


// POLICE SIREN

const originalPoliceEncounter11 = policeEncounter;

policeEncounter = function(route) {

    playEffect("police");

    originalPoliceEncounter11(route);
};


// MISSION SUCCESS SOUND

const originalCompleteMission11 = completeMission;

completeMission = function() {

    if (level < missions.length - 1) {

        playEffect("money");
    }

    originalCompleteMission11();
};


// ==========================================
// IMPROVED RESULT SCREEN
// ==========================================

const originalFinishGame11 = finishGame;

finishGame = function(success, message) {

    const caught = !success &&
        /taksi/i.test(message);

    if (!$("result-image")) {

        const img = document.createElement("img");

        img.id = "result-image";
        img.src = "./caught-taxi.png";
        img.alt = "Yakalanma görseli";
        img.hidden = true;

        $("result-title").after(img);
    }

    originalFinishGame11(success, message);

    $("result-image").hidden = !caught;

    $("result-image").onerror = function() {

        this.hidden = true;

        console.warn(
            "Yakalanma görseli bulunamadı."
        );
    };

    if (success) {

        playEffect("victory");

    } else if (caught) {

        $("result-title").textContent =
            "YAKALANDIN!";

        playEffect("caught");

    } else {

        $("result-title").textContent =
            "OYUN BİTTİ!";

        playEffect("caught");
    }
};


// ==========================================
// IMMEDIATE TAXI ENCOUNTER
// ==========================================

const originalChooseRoute11 = chooseRoute;

chooseRoute = function(i) {

    if (!active || busy || !routes[i]) return;

    if (!timer.remaining()) {

        finishGame(false, "Süren doldu!");

        return;
    }

    const route = routes[i];

    if (
        route.obstacle === "taxi" ||
        route.obstacle === "stand"
    ) {

        busy = true;

        route.feature.setStyle(
            lineStyle(colors[i], 8, 5)
        );

        revealObstacle(route);

        stopMotion();

        controls();

        const message =
            route.obstacle === "taxi"

            ? "🚕 Taksiciye yakalandın!"

            : "🚏 Taksi durağına yakalandın!";

        $("customer-message").textContent =
            message;

        // Show obstacle briefly before result.

        setTimeout(() => {

            finishGame(false, message);

        }, 450);

        return;
    }

    playEffect("drive");

    originalChooseRoute11(i);
};


console.log(
    "TAG KAC! Stage 11 - Sound effects enabled."
);
// ==========================================
// STAGE 13 - VERIFIED ROAD ROUTES
// ==========================================

let verifiedRouteData = null;

missions[1].destination = "Anıtkabir çevresi";
missions[2].pickup = "Anıtkabir çevresi";

missions[1].hints = 2;

roadCache.clear();

loadRoadGraph = async function() {

    if (verifiedRouteData) {
        return verifiedRouteData;
    }

    const response = await fetch(
        "./game-routes.json"
    );

    if (!response.ok) {
        throw new Error(
            "Güzergâh dosyası bulunamadı."
        );
    }

    const data = await response.json();

    if (!Array.isArray(data.levels) ||
        data.levels.length !== 3) {

        throw new Error(
            "Güzergâh verisi geçersiz."
        );
    }

    verifiedRouteData = data;

    return verifiedRouteData;
};


prepareRoadLegs = function(data, mission) {

    const rawLegs = data.levels[level];

    if (!rawLegs || !rawLegs.length) {
        throw new Error(
            "Seviye verisi bulunamadı."
        );
    }

    const legs = rawLegs.map(leg =>

        leg.map(route =>

            route.map(coordinate =>
                ol.proj.fromLonLat(coordinate)
            )
        )
    );

    mission.steps = legs.length;

    mission.start = rawLegs[0][0][0];

    const lastRoute =
        rawLegs[rawLegs.length - 1][0];

    mission.end =
        lastRoute[lastRoute.length - 1];

    const checkpoints = [
        legs[0][0][0]
    ];

    legs.forEach(leg => {

        const route = leg[0];

        checkpoints.push(
            route[route.length - 1]
        );
    });

    return {
        legs,
        checkpoints
    };
};


console.log(
    "TAG KAC! - Verified routes enabled."
);
// ==========================================
// STAGE 15 - POLICE IMAGE MODAL
// ==========================================

function ensureModalImage() {

    let img = document.getElementById("modal-image");

    if (!img) {
        img = document.createElement("img");
        img.id = "modal-image";
        img.alt = "Polis yakalanma görseli";
        img.hidden = true;

        $("modal-message").before(img);
    }

    return img;
}

const originalModalStage15 = modal;

modal = function(title, message, actions) {

    const img = ensureModalImage();
    img.hidden = true;

    originalModalStage15(title, message, actions);
};

policeEncounter = function(route) {

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
                    route,
                    0.55,
                    1,
                    () => completeStep(route)
                );
            }
        ]);
    }

    actions.push([
        "YENİDEN BAŞLAT",
        () => prepareMission(true)
    ]);

    modal(
        "🚔 POLİSE YAKALANDIN!",
        balance >= 500
            ? "Kurgusal oyun cezası: 500 TL. Süre devam ediyor."
            : "Sanal bakiyen yetersiz. Oyunu yeniden başlatmalısın.",
        actions
    );

    const img = ensureModalImage();
    img.src = "./caught-police.jpg";
    img.hidden = false;

    img.onerror = function() {
        this.hidden = true;
        console.warn("Polis görseli yüklenemedi.");
    };

    if (balance < 500) {
        timer.stop();
        active = false;
        controls();
    }
};

console.log("TAG KAC! Stage 15 - Police image modal enabled.");
// STAGE 16 - POLICE IMAGE FIX

(() => {

    const previousModal = modal;

    modal = function(title, message, actions) {

        const isPolice =
            /trafik kontrolü|polise yakalandın/i.test(title);

        previousModal(
            isPolice ? "🚨 POLİSE YAKALANDIN!" : title,
            message,
            actions
        );

        let img = document.getElementById("modal-image");

        if (!img) {

            img = document.createElement("img");
            img.id = "modal-image";

            document.getElementById("modal-message")
                .before(img);
        }

        img.hidden = true;

        if (isPolice) {

            img.alt = "Trafik polisi görseli";

            img.style.width = "100%";
            img.style.maxHeight = "220px";
            img.style.objectFit = "contain";
            img.style.borderRadius = "12px";
            img.style.margin = "10px auto 18px";

            img.onload = () => {
                img.hidden = false;
            };

            img.onerror = () => {
                img.hidden = true;
                console.error("Polis fotoğrafı yüklenemedi.");
            };

            img.src = "./caught-police.jpg";

            if (img.complete && img.naturalWidth > 0) {
                img.hidden = false;
            }
        }
    };

})();
// ==========================================
// STAGE 17 - CUSTOMER SELECTION
// ==========================================

(() => {

    const previousPrepareMission = prepareMission;

    const customers = [
        {
            customer: "Ahmet",
            reward: 350,
            time: 120,
            rating: "4,9"
        },
        {
            customer: "Elif",
            reward: 300,
            time: 150,
            rating: "4,8"
        }
    ];

    prepareMission = function(reset = true) {

        previousPrepareMission(reset);

        const accept = $("accept-btn");

        const details = document.querySelector(
            ".trip-details"
        );

        let panel = $("customer-options");

        if (!panel) {

            panel = document.createElement("div");
            panel.id = "customer-options";

            panel.style.display = "grid";
            panel.style.gap = "15px";
            panel.style.margin = "20px 0";

            details.before(panel);
        }

        panel.replaceChildren();
        panel.hidden = level !== 0;

        details.hidden = false;
        accept.disabled = false;

        if (level !== 0) return;

        $("customer-name").textContent =
            "İki yeni müşteri seni bekliyor!";

        details.hidden = true;
        accept.disabled = true;

        customers.forEach(customer => {

            const button =
                document.createElement("button");

            button.className = "secondary-btn";

            button.style.textAlign = "left";
            button.style.lineHeight = "1.9";
            button.style.whiteSpace = "pre-line";

            button.textContent =
                `👤 ${customer.customer} | ⭐ ${customer.rating}\n` +
                `📍 Kızılay → Bahçelievler\n` +
                `💰 ${customer.reward} TL\n` +
                `⏱ ${customer.time} saniye\n` +
                `MÜŞTERİYİ SEÇ`;

            button.addEventListener("click", () => {

                missions[0].customer =
                    customer.customer;

                missions[0].reward =
                    customer.reward;

                missions[0].time =
                    customer.time;

                $("customer-name").textContent =
                    "Seçilen müşteri: " +
                    customer.customer;

                $("trip-reward").textContent =
                    money(customer.reward);

                panel.querySelectorAll("button")
                    .forEach(b => {
                        b.style.borderColor = "#405044";
                    });

                button.style.borderColor = "#a3ff12";

                details.hidden = false;
                accept.disabled = false;

            });

            panel.appendChild(button);

        });

    };

})();

console.log("Customer selection enabled.");
