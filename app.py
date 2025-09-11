import os
import time
import logging
from flask import Flask, render_template, request
from flask_socketio import SocketIO, join_room, leave_room, emit

# --- Basic Configuration ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# CRITICAL FIX: Revert to the standard Flask configuration.
# By default, Flask looks for a folder named 'static' in the same directory as this script.
app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-super-secret-key-change-me'

socketio = SocketIO(app, async_mode='threading', cors_allowed_origins="*")

# --- Global State Management ---
class SystemState:
    def __init__(self):
        self.cameras = set()
        self.is_calibrated = False
        self.calibration_frame = None
        self.frame_rate = 15
        self.last_frame_time = 0
        self.connection_stats = { 'frames_sent': 0, 'frames_dropped': 0, 'latency_ms': 0 }

state = SystemState()

# --- Utility Functions ---
def get_local_ip():
    import socket
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
    import qrcode
    local_ip = get_local_ip()
    camera_url = f"https://{local_ip}:5000/camera"
    # The 'static_folder' is now managed by Flask automatically.
    qr_path = os.path.join(app.static_folder, 'qrcode.png')

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
    cache_buster = int(time.time())
    return render_template('viewer.html', camera_url=camera_url, cache_buster=cache_buster)

@app.route('/camera')
def camera():
    cache_buster = int(time.time())
    return render_template('camera.html', cache_buster=cache_buster)

# --- SocketIO Event Handlers ---
@socketio.on('connect')
def handle_connect():
    logging.info(f"Client connected: {request.sid}")

@socketio.on('disconnect')
def handle_disconnect():
    try:
        if request.sid in state.cameras:
            state.cameras.remove(request.sid)
            logging.info(f"Camera disconnected: {request.sid}. Total cameras: {len(state.cameras)}")
            emit('camera_disconnected', {'camera_id': request.sid}, broadcast=True)
        else:
            logging.info(f"Viewer disconnected: {request.sid}")
            leave_room('viewers_room')
    except Exception as e:
        logging.error(f"Error in disconnect handler: {e}")

@socketio.on('viewer_joined')
def handle_viewer_joined():
    try:
        join_room('viewers_room')
        logging.info(f"Viewer {request.sid} joined 'viewers_room'.")

        # If a camera is already active, notify the new viewer immediately.
        if state.cameras:
            # Get the first available camera's SID to send to the viewer
            camera_sid = next(iter(state.cameras))
            logging.info(f"Notifying new viewer {request.sid} that camera {camera_sid} is already connected.")
            # Emit to the specific SID of the viewer who just joined
            emit('camera_already_connected', {'camera_id': camera_sid}, to=request.sid)

    except Exception as e:
        logging.error(f"Error in viewer_joined handler: {e}")

@socketio.on('camera_joined')
def handle_camera_joined(data=None):
    try:
        state.cameras.add(request.sid)
        camera_info = data or {}
        logging.info(f"Camera joined: {request.sid}. Total cameras: {len(state.cameras)}")
        emit('camera_connected', {'camera_id': request.sid, 'capabilities': camera_info}, to='viewers_room')
    except Exception as e:
        logging.error(f"Error in camera_joined handler: {e}")

@socketio.on('video_frame')
def handle_video_frame(data):
    try:
        current_time = time.time()
        if current_time - state.last_frame_time < (1 / state.frame_rate):
            state.connection_stats['frames_dropped'] += 1
            return
        state.last_frame_time = current_time
        state.connection_stats['frames_sent'] += 1
        emit('new_frame', data, to='viewers_room')
    except Exception as e:
        logging.error(f"Error in video_frame handler: {e}")

@socketio.on('calibrate_frame')
def handle_calibrate_frame(data):
    try:
        state.calibration_frame = data['image']
        state.is_calibrated = True
        emit('calibration_complete', {'reference_frame': data['image']}, to='viewers_room')
        logging.info("Calibration frame has been set.")
    except Exception as e:
        logging.error(f"Error in calibrate_frame handler: {e}")

@socketio.on('frame_acknowledged')
def handle_frame_ack(data):
    try:
        latency = (time.time() * 1000) - data['timestamp']
        state.connection_stats['latency_ms'] = (state.connection_stats['latency_ms'] * 0.9) + (latency * 0.1)
    except Exception as e:
        logging.error(f"Error in frame_acknowledged handler: {e}")

# --- Main Execution ---
if __name__ == '__main__':
    camera_url = generate_qr_code()

    print("--- InsightLens Server ---")
    print(f"Server starting on https://{get_local_ip()}:5000")
    print(f"Point your phone's camera to this URL: {camera_url}")
    print("--------------------------")

    socketio.run(
        app,
        host='0.0.0.0',
        port=5000,
        ssl_context=('cert.pem', 'key.pem'),
        debug=True,
        allow_unsafe_werkzeug=True
    )
