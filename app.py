import os
import sys
import time
import logging
import threading
import qrcode
import socket
import netifaces
from flask import Flask, render_template, request
from flask_socketio import SocketIO, join_room, leave_room, emit

# --- Helper Function for PyInstaller ---
def resource_path(relative_path):
    """ Get absolute path to resource, works for dev and for PyInstaller """
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

# --- Basic Configuration ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-super-secret-key-change-me'
socketio = SocketIO(app, async_mode='threading', cors_allowed_origins="*")

# --- Global State Management ---
class SystemState:
    def __init__(self):
        self.cameras = set()
        self.frame_rate = 15
        # MODIFIED: Removed latency from connection stats
        self.connection_stats = {}

state = SystemState()
VIEWERS_ROOM = 'viewers_room'

# --- Utility Functions ---
def get_local_ip():
    try:
        for interface in netifaces.interfaces():
            addresses = netifaces.ifaddresses(interface)
            if netifaces.AF_INET in addresses:
                for addr in addresses[netifaces.AF_INET]:
                    ip = addr['addr']
                    if ip.startswith('192.168.') or ip.startswith('10.') or ip.startswith('172.'):
                        return ip
    except Exception:
        pass
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 1))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

def generate_qr_code():
    local_ip = get_local_ip()
    camera_url = f"https://{local_ip}:5000/camera"
    qr_path = os.path.join(resource_path('static'), 'qrcode.png')
    try:
        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(camera_url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        img.save(qr_path)
        logging.info(f"QR code generated for URL: {camera_url}")
    except Exception as e:
        logging.error(f"Failed to generate QR code: {e}")
    return camera_url

# --- Routes ---
@app.route('/')
def viewer():
    camera_url = generate_qr_code()
    cache_version = int(time.time())
    return render_template('viewer.html', camera_url=camera_url, cache_version=cache_version)

@app.route('/camera')
def camera():
    cache_version = int(time.time())
    return render_template('camera.html', cache_version=cache_version)

# --- SocketIO Event Handlers ---
@socketio.on('connect')
def handle_connect():
    logging.info(f"Client connected: {request.sid}")

@socketio.on('viewer_joined')
def handle_viewer_joined():
    try:
        join_room(VIEWERS_ROOM)
        logging.info(f"Viewer {request.sid} joined '{VIEWERS_ROOM}'.")
        if state.cameras:
            camera_sid = next(iter(state.cameras))
            emit('camera_already_connected', {'camera_id': camera_sid})
            logging.info(f"Notified new viewer about existing camera: {camera_sid}")
    except Exception as e:
        logging.error(f"Error in handle_viewer_joined: {e}")

@socketio.on('camera_joined')
def handle_camera_joined(data=None):
    try:
        state.cameras.add(request.sid)
        camera_info = data or {}
        emit('camera_connected', {'camera_id': request.sid, 'capabilities': camera_info}, to=VIEWERS_ROOM)
        logging.info(f"Camera joined: {request.sid}. Total cameras: {len(state.cameras)}")
    except Exception as e:
        logging.error(f"Error in handle_camera_joined: {e}")

@socketio.on('video_frame')
def handle_video_frame(data):
    try:
        emit('new_frame', data, to=VIEWERS_ROOM)
    except Exception as e:
        logging.error(f"Error in handle_video_frame: {e}")

# MODIFIED: Removed 'frame_acknowledged' handler
# @socketio.on('frame_acknowledged') ...

@socketio.on('disconnect')
def handle_disconnect():
    try:
        if request.sid in state.cameras:
            state.cameras.remove(request.sid)
            logging.info(f"Camera disconnected: {request.sid}. Total cameras: {len(state.cameras)}")
            emit('camera_disconnected', {'camera_id': request.sid}, to=VIEWERS_ROOM)
        else:
            logging.info(f"Viewer disconnected: {request.sid}.")
    except Exception as e:
        logging.error(f"Error in handle_disconnect: {e}")

# MODIFIED: Removed stats_updater thread
# def stats_updater(): ...

# --- Main Execution ---
if __name__ == '__main__':
    camera_url = generate_qr_code()

    # MODIFIED: Removed stats_updater thread start

    print("--- InsightLens Server ---")
    print(f"Server starting on https://{get_local_ip()}:5000")
    print(f"Point your phone's camera to this URL: {camera_url}")
    print("--------------------------")

    ssl_context = (
        resource_path('cert.pem'),
        resource_path('key.pem')
    )

    socketio.run(
        app,
        host='0.0.0.0',
        port=5000,
        ssl_context=ssl_context,
        debug=False,
        allow_unsafe_werkzeug=True
    )
