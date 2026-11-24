# 🚗 TAG KAÇ!

### GMT 458 – Web GIS | Assignment 2: GeoGame

> Choose your route, beat the clock and complete the ride!

## 1. Project Description

TAG KAÇ! is an interactive, map-based urban strategy game.
The player acts as a driver who accepts passenger requests
and attempts to complete trips within a limited time.

The player must choose between three alternative routes
at each decision point while dealing with fictional
in-game obstacles.

The game combines entertainment with geographic
information systems and spatial decision-making.

## 2. Functional Requirements

- Interactive geographic map
- Passenger request and acceptance system
- Three alternative routes at each decision point
- Animated vehicle movement
- Randomly generated fictional obstacles
- Taxi and taxi station obstacles
- Simulated traffic police encounters
- Virtual penalty payment system
- Limited hints
- Countdown timer
- Multiple difficulty levels
- Passenger satisfaction system
- Score and high-score tracking
- Game restart functionality
- End-game statistics

## 3. Gameplay

1. The player receives a passenger request.
2. The player accepts the request.
3. The countdown timer begins.
4. Three alternative routes appear on the map.
5. The player selects a route.
6. A safe route allows the journey to continue.
7. A taxi obstacle ends the game.
8. A simulated police encounter requires a virtual
   penalty payment or a game restart.
9. The player reaches the destination and earns money.
10. The next mission begins.

## 4. Difficulty Levels

| Feature | Level 1 | Level 2 | Level 3 |
|---|---|---|---|
| Difficulty | Easy | Medium | Hard |
| Decision Points | 4 | 5 | 6 |
| Time Limit | 120 sec | 150 sec | 180 sec |
| Reward | 350 TL | 650 TL | 1000 TL |
| Hints | 3 | 3 | 2 |
| Police Obstacles | No | Yes | Yes |

Total missions: 3

Total decision points: 15

Total route alternatives: 45

Target gameplay duration: 5–8 minutes.

The game has one life per session.

## 5. Scoring System

- Initial virtual balance: 1000 TL
- Simulated penalty: 500 TL
- Maximum mission rewards: 2000 TL
- Maximum final balance: 3000 TL

The player's final balance determines the score.
The highest score will be stored using LocalStorage.

All payments are fictional and have no monetary value.

## 6. Temporal Component

Each mission has a countdown timer.

The player must reach the destination before the
time limit expires. Route selection and travel time
will affect the remaining time.

If the timer reaches zero, the game ends.

## 7. Geographic Information Systems

The project will use:

- Geographic coordinates (latitude and longitude)
- WGS84 (EPSG:4326)
- Web Mercator (EPSG:3857)
- Coordinate transformations
- Point and LineString geometries
- Vector layers
- Route distance calculations
- GeoJSON data
- Spatial relationships
- Road network topology

## 8. Planned Technologies

- HTML5
- CSS3
- JavaScript
- OpenLayers
- OpenStreetMap
- Chart.js
- GeoJSON
- LocalStorage
- Git and GitHub
- GitHub Pages

## 9. Proposed Frontend Layout

```text
+------------------------------------------+
|                TAG KAC!                  |
+------------------------------------------+
| TIME       BALANCE       LEVEL     HINTS  |
+------------------------------------------+
|                                          |
|             INTERACTIVE MAP              |
|                                          |
|       ROUTES - VEHICLE - DESTINATION      |
|                                          |
+------------------------------------------+
|             JOURNEY PROGRESS              |
+------------------------------------------+
|   ROUTE 1     ROUTE 2       ROUTE 3       |
+------------------------------------------+
|      USE HINT       CUSTOMER MESSAGE     |
+------------------------------------------+
```

A detailed visual design will be added during development.

## 10. Open Geographic Data

OpenStreetMap will be used as the geographic
basemap.

All game obstacles will be fictional and randomly
generated. The game will not use real-time police
locations or actual taxi station locations.

## 11. JavaScript Implementation

### Planned Event Handlers

- Passenger request acceptance
- Map and route selection
- Hint button interaction
- Penalty payment
- Game restart

### Closures

JavaScript closures are planned for countdown
timer and game session management.

### DOM Manipulation

The DOM will be used to update the timer, balance,
mission progress, notifications and game statistics.

## 12. Artificial Intelligence Usage

ChatGPT has been used for initial brainstorming
and project planning.

Further explanations of AI-assisted learning and
the conversation URL will be added during development.

## 13. Disclaimer

This is an independent educational project developed
for GMT 458 Web GIS.

All gameplay scenarios, obstacles and financial
transactions are fictional.

The project is not affiliated with any transportation
company or public authority.

## 14. Development Status

- [x] Game concept
- [x] GitHub repository
- [ ] Frontend design
- [ ] Interactive map
- [ ] Route system
- [ ] Game mechanics
- [ ] Scoring and timer
- [ ] Statistics
- [ ] Testing
- [ ] GitHub Pages deployment
