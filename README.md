# WiFi Signal Strength Mapper

A lightweight macOS app that creates a WiFi signal strength heatmap overlaid on your floor plan. Walk around your home or office with your MacBook, click to record measurements, and visualise your WiFi coverage.

## Features

- WiFi signal strength visualisation.
- Upload a floor plan or use the provided example.
- Interactive heatmap.
- Save and load measurement sessions.

## Installation

To use this mapper and record real Wi-Fi data, you must run it locally on your MacBook.

### 1. Install Dependencies
You need Python installed. Install the required packages via pip:

```bash
pip install flask flask-cors pyobjc-framework-CoreWLAN
```

### 2. Run the Server
Start the local Python backend, which also serves the frontend files:

```bash
python server.py
```

### 3. Open the App
Once the server is running, open your web browser and navigate to:
**http://localhost:5050**

You can now upload a floor plan, walk around your home with your MacBook, and click to record real-time Wi-Fi measurements!

## Usage

* Walk around your house with your computer.
* Sometime, stop and click on the location you are standing (coming soon: auto detection)
* This will capture the Wifi signal strength at the location you are standing and save it onto the map where you clicked.
* Keep walking and clicking.
* Soon you will have a wifi heatmap of your house!

## Architecture

Because web browsers cannot read raw hardware data (like Wi-Fi signal strength) for security reasons, this project is split into two parts:
1. **Frontend (UI)**: Located in the `docs/` folder, built with HTML, CSS, and Vanilla JS.
2. **Backend (Data Provider)**: A lightweight Python Flask server (`server.py`) that uses macOS's `CoreWLAN` framework to read real Wi-Fi sensors and provides them to the frontend.

## Tech Stack

- **Frontend**: HTML5, CSS3 (Vanilla), JavaScript (Vanilla)
- **Backend**: Python, Flask, pyobjc (macOS CoreWLAN)

## License

[MIT](LICENSE)
