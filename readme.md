# 🔍 InsightLens - Local Camera Streaming

InsightLens is a local web application that turns your phone into a high-quality, real-time document camera. It streams video from your phone's camera (or from a webcam on the same device... really whatever camera you connect) directly to an immersive, full-screen viewer in your desktop browser over your local Wi-Fi network.

## Features

* **Immersive Full-Screen View:** The viewer displays the camera feed full-screen, with a floating UI that can be hidden for an unobstructed view.
* **Easy Setup:** Connect your phone by scanning a QR code—no apps to install.
* **Interactive Viewer:** Features digital pan, zoom, freeze-frame, and calibration tools.
* **Real-time Control:** Adjust camera settings like zoom, flash, and quality directly from the phone.
* **Resilient Connection:** Viewers can refresh the page and automatically reconnect to an active camera stream.

## 🚀 Getting Started on macOS

Follow these instructions to set up and run the InsightLens server on your local machine.

### Prerequisites

* **Python 3 & Pip:** Ensure you have Python 3 and its package manager installed.
* **OpenSSL:** Comes pre-installed on macOS.

### Step 1: Get the Project Files

Clone or download the project, then navigate to the main `insightlens_local` directory in your Terminal.

```bash
cd path/to/insightlens_local
```

### Step 2: Create a Virtual Environment

Using a virtual environment is highly recommended to keep project dependencies isolated.

```bash
# Create a new virtual environment
python3 -m venv insightlens_local

# Activate it
source insightlens_local/bin/activate
```

*Your terminal prompt should now be prefixed with `(insightlens_local)`.*

### Step 3: Install Dependencies

Use `pip` to install all the required packages from the `requirements.txt` file.

```bash
pip install -r requirements.txt
```

### Step 4: Generate a Self-Signed SSL Certificate

Modern browsers require a secure connection (HTTPS) to access your phone's camera. Run the following command **once** in the project directory to generate the necessary certificate.

```bash
openssl req -x509 -newkey rsa:4096 -nodes -out cert.pem -keyout key.pem -days 365 \
-subj "/C=US/ST=State/L=City/O=Organization/OU=OrgUnit/CN=insightlens.local"
```

*This will create `cert.pem` and `key.pem` files in your directory.*

### Step 5: Run the Application

With the setup complete, you can now start the server.

```bash
python app.py
```

The server is now running. The terminal will show a message like `(71880) wsgi starting up on https://0.0.0.0:5000` and then wait quietly. **This is the correct behavior.**

### Step 6: Access and Connect

1.  **Open the Viewer:** On your Mac, open a web browser and go to the server address (e.g., `https://192.168.1.10:5000` or `https://localhost:5000`).
2.  **Connect Your Phone:**
    * Make sure your phone is connected to the **same Wi-Fi network** as your Mac.
    * Scan the QR code displayed on the viewer page.

> **⚠️ Important Security Warning**
>
> When you first open the camera page on your phone, your browser will show a security warning. This is expected because the certificate is self-signed.
>
> You must tap **"Advanced"** and then **"Proceed to [your IP address] (unsafe)"**. This is safe to do, as you are connecting to your own computer.

## ⌨️ Viewer Controls

| Action          | Button | Keyboard Shortcut |
| --------------- | :----: | :---------------: |
| Zoom In / Out   | `+` / `-` | `+` / `-`         |
| Reset View      |   `⌂`   |        `0`        |
| Freeze Frame    |   `⏸️`   |      `Space`      |
| Hide/Show HUD   |   `👀`   |        `h`        |
| Toggle Fullscreen |   `⛶`   |        `f`        |
| Recalibrate     |   `🔄`   |        N/A        |

## troubleshooting

### "Address already in use" Error

If the server fails to start and complains about port 5000, it means a previous version of the app didn't shut down correctly. To fix this:

1.  Find the process using the port: `lsof -i :5000`
2.  Note the number in the `PID` column.
3.  Stop the process: `kill -9 <PID>` (replace `<PID>` with the number).

### To Stop the Server

* Go back to your Terminal window where the server is running.
* Press `Control + C`.
* To deactivate the virtual environment, type: `deactivate`
