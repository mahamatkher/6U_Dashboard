# 6U Ground Station Dashboard

A modern, responsive, and real-time mission control dashboard designed for a 6U CubeSat or similar spacecraft. The dashboard provides a comprehensive view of critical telemetry, including optical feeds, 3D orientation, sensor data, power status, and GPS tracking.

![6U Ground Station Dashboard](https://img.shields.io/badge/Status-Active-success)
![Vanilla JS](https://img.shields.io/badge/Framework-Vanilla_JS-yellow)
![HTML5](https://img.shields.io/badge/UI-HTML5_%2B_CSS3-blue)

## Features

- **Optical Feed**: Real-time camera feed visualization with recording status.
- **Orientation (Attitude)**: Real-time 3D cube visualization of Pitch, Yaw, and Roll using CSS 3D transforms.
- **Sensors**: Live sparkline charts (via Chart.js) for Pressure, Humidity, and Ambient Light, plus Internal/External Temperature monitors.
- **Power Systems**: Solar array output visualization and battery charge/voltage tracking.
- **Live Tracking**: Real-time GPS mapping and ground track visualization using Leaflet.js and OpenStreetMap.
- **Fullscreen Mode**: Every module can be expanded into fullscreen mode for detailed monitoring.

## Getting Started

The dashboard is built entirely with vanilla web technologies (HTML, CSS, JavaScript) and requires no build steps or bundlers. 

### Prerequisites

You only need a basic web server to serve the static files. If you have Python installed, you can use its built-in HTTP server.

### Running Locally

1. Clone this repository:
   ```bash
   git clone https://github.com/mahamatkher/6U_Dashboard.git
   cd 6U_Dashboard
   ```

2. Start a local web server. For example, using Python:
   ```bash
   python -m http.server 8000
   ```
   *(Alternatively, you can use Node's `http-server`, PHP, or VS Code Live Server).*

3. Open your browser and navigate to `http://localhost:8000`.

## Connecting Your Own Telemetry Pipeline

By default, the dashboard runs in simulation mode, generating random telemetry data to demonstrate the UI. To connect this dashboard to your real telemetry pipeline, follow these steps:

### 1. Disable the Simulation
Open `app.js` and set the simulation flag to `false` at the top of the file:
```javascript
const USE_SIMULATION = false;
```

### 2. Feed Data via the API
The dashboard exposes a single entry point for incoming data: `updateDashboardData(data)`. You can call this function whenever a new telemetry packet arrives from your backend (e.g., via WebSockets, Server-Sent Events, or polling).

Example integration using WebSockets:
```javascript
const socket = new WebSocket('ws://localhost:8080/telemetry');

socket.onmessage = function(event) {
    const packet = JSON.parse(event.data);
    
    // Map your custom packet to the dashboard's expected format
    updateDashboardData({
        tempInt: packet.internal_temp,       // °C
        tempExt: packet.external_temp,       // °C
        pressure: packet.baro_pressure,      // kPa
        humidity: packet.relative_hum,       // %
        light: packet.lux_reading,           // lux
        batteryPercent: packet.batt_soc,     // 0-100%
        batteryVoltage: packet.batt_v,       // Volts
        pitch: packet.attitude.pitch,        // degrees
        yaw: packet.attitude.yaw,            // degrees
        roll: packet.attitude.roll,          // degrees
        lat: packet.gps.latitude,            // decimal degrees
        lon: packet.gps.longitude,           // decimal degrees
        solarPanels: packet.solar_array      // Array of 12 percentages [60, 85, ...]
    });
};
```

### Expected Data Format
The `updateDashboardData` function accepts an object. You can pass all fields at once or only the fields that have updated.

| Property | Type | Description |
|---|---|---|
| `tempInt` | Number | Internal temperature (°C) |
| `tempExt` | Number | External temperature (°C) |
| `pressure` | Number | Pressure (kPa) |
| `humidity` | Number | Relative humidity (%) |
| `light` | Number | Ambient light (lux) |
| `batteryPercent`| Number | Battery state of charge (0-100) |
| `batteryVoltage`| Number | Battery voltage (V) |
| `pitch`, `yaw`, `roll` | Number | Attitude angles (degrees) |
| `lat`, `lon` | Number | GPS Coordinates (decimal degrees) |
| `solarPanels` | Array[Number] | Array of 12 numbers (0-100) representing the output % of each solar panel |

## Customization

- **Logos**: Replace `assets/chandigarh university logo.png` and `assets/kcc logo.png` with your organization's logos.
- **Theming**: Core colors are defined as CSS variables at the top of `index.html` (e.g., `--brand`, `--brand-text`, `--ink`, etc.).

## Dependencies

The dashboard relies on two external libraries, loaded via CDN in `index.html`:
- [Chart.js](https://www.chartjs.org/) (for sparkline charts)
- [Leaflet.js](https://leafletjs.com/) (for GPS mapping)
- [FontAwesome](https://fontawesome.com/) (for icons)

## License

This project is open-source and available under the [MIT License](LICENSE).
