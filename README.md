# WiFi Signal Strength Mapper

A frontend web application that creates a real-time WiFi signal strength heatmap overlaid on your floor plan.

## Features

- Real-time WiFi signal strength visualization.
- Upload a floor plan or use the provided example.
- Interactive heatmap with adjustable opacity and point radius.
- Pan and zoom controls for large floor plans.
- Save and load measurement sessions.

## Tech Stack

- HTML5
- CSS3 (Vanilla)
- JavaScript (Vanilla)

## Usage

This project consists entirely of static frontend files. To use it, you can serve the `static` directory using any basic web server, for example:

```bash
# Using Python's built-in HTTP server:
cd static
python -m http.server 8000
```

Then, open your browser and navigate to `http://localhost:8000`.

Alternatively, you can use any other static file server (like `npx serve`, Live Server in VS Code, etc.).
