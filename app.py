import os
import sys
import time
import logging
import socket
import netifaces
import qrcode
from flask import Flask, render_template, request
from flask_socketio import SocketIO, join_room, leave_room, emit
from OpenSSL import crypto

# --- Helper Function for PyInstaller ---
def resource_path(relative_path):
    """ Get absolute path to resource, works for dev and for PyInstaller """
    try:
        base_path = sys._MEIPASS
    except AttributeError:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

# --- Automated SSL Certificate Generation ---
def generate_self_signed_cert(cert_path, key_path):
    """Generates a self-signed SSL certificate if it doesn't exist."""
    if os.path.exists(cert_path) and os.path.exists(key_path):
        # Optional: Check for expiration here if needed
        logging.info("SSL certificate already exists.")
        return

    logging.info("Generating new self-signed SSL certificate...")
    # Create a key pair
    key = crypto.PKey()
    key.generate_key(crypto.TYPE_RSA, 4096)

    # Create a self-signed certificate
    cert = crypto.X509()
    cert.get_subject().C = "US"
    cert.get_subject().ST = "California"
    cert.get_subject().L = "San Francisco"
    cert.get_subject().O = "InsightLens"
    cert.get_subject().OU = "InsightLens Local"
    cert.get_subject().CN = "insightlens.local"
    cert.set_serial_number(int(time.time() * 1000))
    cert.gmtime_adj_notBefore(0)
    cert.gmtime_adj_notAfter(365 * 24 * 60 * 60) # Valid for 1 year
    cert.set_issuer(cert.get_subject())
    cert.set_pubkey(key)
    cert.sign(key, 'sha256')

    try:
        with open(cert_path, "wt") as f:
            f.write(crypto.dump_certificate(crypto.FILETYPE_PEM, cert).decode("utf-8"))
        with open(key_path, "wt") as f:
            f.write(crypto.dump_privatekey(crypto.FILETYPE_PEM, key).decode("utf-8"))
        logging.info(f"SSL certificate created at {cert_path}")
    except IOError as e:
        logging.error(f"Error writing SSL certificate files: {e}")
        sys.exit(1)

CERT_FILE = resource_path('cert.pem')
KEY_FILE = resource_path('key.pem')
generate_self_signed_cert(CERT_FILE, KEY_FILE)

# --- Basic Configuration ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

app = Flask(__name__, template_folder=resource_path('templates'))
app.config['SECRET_KEY'] = 'your-super-secret-key-change-me'
socketio = SocketIO(app, async_mode='eventlet', cors_allowed_origins="*")

# --- Global State Management ---
class SystemState:
    def __init__(self):
        self.cameras = set()

state = SystemState()
VIEWERS_ROOM = 'viewers_room'

# --- Utility Functions ---
def get_local_ip():
    """Finds the most likely local IP address."""
    try:
        for interface in netifaces.interfaces():
            addresses = netifaces.ifaddresses(interface)
            if netifaces.AF_INET in addresses:
                for addr in addresses[netifaces.AF_INET]:
                    ip = addr['addr']
                    if ip.startswith('192.168.') or ip.startswith('10.') or ip.startswith('172.'):
                        return ip
    except Exception as e:
        logging.warning(f"Could not find preferred IP via netifaces: {e}")

    # Fallback method
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 1))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

def generate_qr_code(static_folder):
    """Generates a QR code for the camera URL."""
    local_ip = get_local_ip()
    camera_url = f"https://{local_ip}:5000/camera"

    if not os.path.exists(static_folder):
        os.makedirs(static_folder)

    qr_path = os.path.join(static_folder, 'qrcode.png')

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
    static_folder_path = resource_path('static')
    camera_url = generate_qr_code(static_folder_path)
    return render_template('viewer.html', camera_url=camera_url)

@app.route('/camera')
def camera():
    return render_template('camera.html')

# --- SocketIO Event Handlers ---
@socketio.on('connect')
def handle_connect():
    logging.info(f"Client connected: {request.sid}")

@socketio.on('viewer_joined')
def handle_viewer_joined():
    join_room(VIEWERS_ROOM)
    logging.info(f"Viewer {request.sid} joined '{VIEWERS_ROOM}'.")
    if state.cameras:
        camera_sid = next(iter(state.cameras))
        emit('camera_already_connected', {'camera_id': camera_sid})

@socketio.on('camera_joined')
def handle_camera_joined(data=None):
    state.cameras.add(request.sid)
    emit('camera_connected', {'camera_id': request.sid, 'capabilities': data or {}}, room=VIEWERS_ROOM)
    logging.info(f"Camera joined: {request.sid}. Total cameras: {len(state.cameras)}")

@socketio.on('video_frame')
def handle_video_frame(data):
    emit('new_frame', data, room=VIEWERS_ROOM, include_self=False)

@socketio.on('disconnect')
def handle_disconnect():
    if request.sid in state.cameras:
        state.cameras.remove(request.sid)
        logging.info(f"Camera disconnected: {request.sid}. Total cameras: {len(state.cameras)}")
        emit('camera_disconnected', {'camera_id': request.sid}, room=VIEWERS_ROOM)
    else:
        logging.info(f"Viewer disconnected: {request.sid}.")

# --- Main Execution ---
if __name__ == '__main__':
    print("--- InsightLens Server ---")

    static_folder_path = resource_path('static')
    camera_url = generate_qr_code(static_folder_path)

    print(f"Server starting on https://{get_local_ip()}:5000")
    print(f"Point your phone's camera to this URL or scan the QR in the viewer: {camera_url}")
    print("--------------------------")

    ssl_context = (CERT_FILE, KEY_FILE)

    try:
        socketio.run(
            app,
            host='0.0.0.0',
            port=5000,
            ssl_context=ssl_context,
            debug=False
        )
    except Exception as e:
        logging.error(f"Failed to start server: {e}")
        if "Address already in use" in str(e):
            logging.error("Port 5000 is already in use. Please stop the other process and try again.")
        sys.exit(1)
