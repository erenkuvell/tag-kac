// ==========================================
// TAG KAC! - GMT 458 WEB GIS PROJECT
// Stage 1: Game engine and interactive map
// ==========================================

"use strict";

const $ = (id) => document.getElementById(id);

let map;
let vectorSource;
let balance = 1000;
let soundEnabled = true;

// Mission data: [longitude, latitude]

const mission = {
    customer: "Ahmet",
    pickup: "Kızılay",
    destination: "Bahçelievler",
    start: [32.8541, 39.9208],
    end: [32.8277, 39.9256],
    reward: 350,
    time: 120,
    hints: 3
};


// ==========================================
// SCREEN MANAGEMENT
// ==========================================

function showScreen(id) {

    document.querySelectorAll(".screen")
        .forEach(screen => {
            screen.hidden = screen.id !== id;
        });

}


// ==========================================
// COUNTDOWN TIMER - JAVASCRIPT CLOSURE
// ==========================================

function createTimer() {

    let interval = null;
    let remaining = 0;

    function stop() {
        clearInterval(interval);
        interval = null;
    }

    function render() {

        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;

        $("timer").textContent =
            String(minutes).padStart(2, "0") +
            ":" +
            String(seconds).padStart(2, "0");

        $("timer").classList.toggle(
            "danger", remaining <= 15
        );
    }

    function start(seconds) {

        stop();

        remaining = seconds;
        render();

        interval = setInterval(() => {

            remaining = Math.max(0, remaining - 1);
            render();

            if (remaining === 0) {

                stop();
                finishGame("Süren doldu!");

            }

        }, 1000);
    }

    return { start, stop };
}

const gameTimer = createTimer();


// ==========================================
// PASSENGER REQUEST
// ==========================================

function prepareMission() {

    gameTimer.stop();

    balance = 1000;

    $("customer-name").textContent =
        "Müşteri: " + mission.customer;

    $("pickup-location").textContent =
        mission.pickup;

    $("destination-location").textContent =
        mission.destination;

    $("trip-reward").textContent =
        mission.reward + " TL";

    showScreen("request-screen");

}


// ==========================================
// MAP INITIALIZATION
// ==========================================

function initializeMap() {

    if (map) {

        map.updateSize();
        return;

    }

    vectorSource = new ol.source.Vector();

    const vectorLayer = new ol.layer.Vector({
        source: vectorSource
    });

    map = new ol.Map({

        target: "map",

        layers: [

            new ol.layer.Tile({
                source: new ol.source.OSM()
            }),

            vectorLayer

        ],

        view: new ol.View({

            center: ol.proj.fromLonLat(
                [32.8410, 39.9230]
            ),

            zoom: 13

        })

    });

    map.addControl(
        new ol.control.ScaleLine()
    );

    map.on("singleclick", function (event) {

        const coordinate =
            ol.proj.toLonLat(event.coordinate);

        $("customer-message").textContent =
            "Seçilen koordinat: " +
            coordinate[1].toFixed(5) +
            "° N, " +
            coordinate[0].toFixed(5) +
            "° E";

    });

}


// ==========================================
// MAP MARKERS
// ==========================================

function addMarker(coordinate, label, color) {

    const marker = new ol.Feature({

        geometry: new ol.geom.Point(
            ol.proj.fromLonLat(coordinate)
        )

    });

    marker.setStyle(

        new ol.style.Style({

            image: new ol.style.Circle({

                radius: 13,

                fill: new ol.style.Fill({
                    color: color
                }),

                stroke: new ol.style.Stroke({
                    color: "#ffffff",
                    width: 3
                })

            }),

            text: new ol.style.Text({

                text: label,

                font: "bold 13px Arial",

                offsetY: -25,

                fill: new ol.style.Fill({
                    color: "#ffffff"
                }),

                stroke: new ol.style.Stroke({
                    color: "#101512",
                    width: 4
                })

            })

        })

    );

    vectorSource.addFeature(marker);

}


// ==========================================
// START MISSION
// ==========================================

function startMission() {

    if (typeof ol === "undefined") {

        showModal(
            "Harita yüklenemedi",
            "İnternet bağlantını kontrol et.",
            "TAMAM"
        );

        return;
    }

    showScreen("game-screen");

    $("balance").textContent = balance + " TL";
    $("level").textContent = "1/3";
    $("hint-count").textContent = mission.hints;

    $("trip-progress").value = 0;
    $("progress-text").textContent = "%0";

    $("customer-message").textContent =
        "Müşteri: Merhaba! Hazırsanız başlayalım.";

    initializeMap();

    vectorSource.clear();

    addMarker(
        mission.start,
        "A - Kızılay",
        "#32bd72"
    );

    addMarker(
        mission.end,
        "B - Bahçelievler",
        "#ef4444"
    );

    map.updateSize();

    map.getView().fit(
        vectorSource.getExtent(),
        {
            padding: [65, 65, 65, 65],
            maxZoom: 15
        }
    );

    gameTimer.start(mission.time);

}


// ==========================================
// MODAL WINDOW
// ==========================================

function showModal(title, message, buttonText) {

    $("modal-title").textContent = title;
    $("modal-message").textContent = message;

    const actions = $("modal-actions");

    actions.replaceChildren();

    const button = document.createElement("button");

    button.className = "primary-btn";
    button.textContent = buttonText;

    button.addEventListener("click", () => {

        $("game-modal").close();

    });

    actions.appendChild(button);

    $("game-modal").showModal();

}


// ==========================================
// GAME RESULT
// ==========================================

function finishGame(message) {

    gameTimer.stop();

    $("result-title").textContent = "Oyun Sonu";
    $("result-message").textContent = message;
    $("final-score").textContent = balance + " TL";

    const highScore =
        Number(localStorage.getItem("tagHighScore")) || 0;

    $("high-score").textContent =
        "En yüksek skor: " + highScore + " TL";

    showScreen("result-screen");

}


// ==========================================
// EVENT HANDLERS
// ==========================================

$("start-btn").addEventListener(
    "click", prepareMission
);

$("accept-btn").addEventListener(
    "click", startMission
);

$("help-btn").addEventListener("click", () => {

    showModal(
        "Nasıl Oynanır?",
        "Müşteri talebini kabul et. " +
        "Süre dolmadan varış noktasına ulaş. " +
        "Güzergâhlarını dikkatli seç ve " +
        "ipucu haklarını kullan. " +
        "Tüm senaryolar kurgusaldır.",
        "ANLADIM"
    );

});

$("record-btn").addEventListener("click", () => {

    const record =
        localStorage.getItem("tagHighScore") || 0;

    showModal(
        "En Yüksek Skor",
        record + " TL",
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

    gameTimer.stop();
    showScreen("main-menu");

});

// Route mechanics will be added in the next stage.

document.querySelectorAll(".route-btn")
    .forEach(button => {
        button.disabled = true;
    });

$("hint-btn").disabled = true;

console.log("TAG KAC! Game engine initialized.");
