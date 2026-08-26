#!/usr/bin/env python3
"""
WiFi Signal Strength Mapper - Backend Server
Uses macOS CoreWLAN framework for real-time WiFi signal measurements.
"""

import json
import os
import time
from datetime import datetime
from flask import Flask, jsonify, send_from_directory, request
from flask_cors import CORS

app = Flask(__name__, static_folder='docs', static_url_path='')
CORS(app)

# Store measurement sessions
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
os.makedirs(DATA_DIR, exist_ok=True)


def get_wifi_info():
    """Get current WiFi signal information using CoreWLAN framework."""
    try:
        from CoreWLAN import CWWiFiClient
        client = CWWiFiClient.sharedWiFiClient()
        iface = client.interface()

        if iface is None:
            return {'error': 'No WiFi interface found'}

        channel = iface.wlanChannel()
        channel_num = channel.channelNumber() if channel else None
        channel_band = channel.channelBand() if channel else None

        # Map band enum to human-readable
        band_map = {1: '2.4 GHz', 2: '5 GHz', 3: '6 GHz'}
        band_str = band_map.get(channel_band, f'Unknown ({channel_band})')

        rssi = iface.rssiValue()
        noise = iface.noiseMeasurement()
        snr = rssi - noise if noise else None

        # Signal quality as percentage (rough mapping)
        # -30 dBm = 100%, -90 dBm = 0%
        quality = max(0, min(100, int((rssi + 90) * (100 / 60))))

        return {
            'ssid': str(iface.ssid()) if iface.ssid() else 'Hidden/Private',
            'rssi': rssi,
            'noise': noise,
            'snr': snr,
            'channel': channel_num,
            'band': band_str,
            'tx_rate': iface.transmitRate(),
            'quality': quality,
            'timestamp': datetime.now().isoformat(),
        }
    except ImportError:
        return {'error': 'CoreWLAN not available. This app requires macOS.'}
    except Exception as e:
        return {'error': str(e)}


@app.route('/')
def index():
    return app.send_static_file('index.html')


@app.route('/api/wifi')
def wifi_signal():
    """Get current WiFi signal strength."""
    # Average multiple readings for stability
    samples = int(request.args.get('samples', 3))
    readings = []
    for _ in range(samples):
        info = get_wifi_info()
        if 'error' not in info:
            readings.append(info)
        time.sleep(0.1)

    if not readings:
        return jsonify(get_wifi_info())

    # Average the RSSI values
    avg_rssi = sum(r['rssi'] for r in readings) / len(readings)
    avg_noise = sum(r['noise'] for r in readings) / len(readings)
    avg_quality = sum(r['quality'] for r in readings) / len(readings)

    result = readings[-1].copy()
    result['rssi'] = round(avg_rssi)
    result['noise'] = round(avg_noise)
    result['quality'] = round(avg_quality)
    result['samples'] = len(readings)

    return jsonify(result)


@app.route('/api/save', methods=['POST'])
def save_session():
    """Save a measurement session to disk."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    name = data.get('name', f'session_{datetime.now().strftime("%Y%m%d_%H%M%S")}')
    filename = f'{name}.json'
    filepath = os.path.join(DATA_DIR, filename)

    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2)

    return jsonify({'success': True, 'filename': filename})


@app.route('/api/load/<filename>')
def load_session(filename):
    """Load a saved measurement session."""
    filepath = os.path.join(DATA_DIR, filename)
    if not os.path.exists(filepath):
        return jsonify({'error': 'Session not found'}), 404

    with open(filepath) as f:
        data = json.load(f)

    return jsonify(data)


@app.route('/api/sessions')
def list_sessions():
    """List all saved sessions."""
    sessions = []
    for f in sorted(os.listdir(DATA_DIR)):
        if f.endswith('.json'):
            filepath = os.path.join(DATA_DIR, f)
            with open(filepath) as fh:
                data = json.load(fh)
            sessions.append({
                'filename': f,
                'name': data.get('name', f),
                'point_count': len(data.get('points', [])),
                'created': data.get('created', ''),
            })
    return jsonify(sessions)


if __name__ == '__main__':
    print("\n" + "=" * 60)
    print("  📡 WiFi Signal Strength Mapper")
    print("  Open http://localhost:5050 in your browser")
    print("=" * 60 + "\n")
    app.run(host='0.0.0.0', port=5050, debug=True)
