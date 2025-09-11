class InsightLensCamera {
    constructor() {
        this.socket = null;
        this.mediaStream = null;
        this.videoTrack = null;
        this.canvas = document.getElementById('frame-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.isStreaming = false;
        this.streamInterval = null;
        this.frameRate = 15;
        this.quality = 0.8;
        this.capabilities = {};
        this.settings = { zoom: 1, torch: false };
        this.elements = {};
    }

    init() {
        this.elements = {
            cameraUiWrapper: document.getElementById('camera-ui-wrapper'),
            startOverlay: document.getElementById('start-overlay'),
            startBtn: document.getElementById('start-camera-btn'),
            cameraView: document.getElementById('camera-view'),
            zoomSlider: document.getElementById('zoom-slider'),
            torchBtn: document.getElementById('torch-btn'),
            resolutionSelect: document.getElementById('resolution-select'),
            framerateSelect: document.getElementById('framerate-select'),
            retryCameraBtn: document.getElementById('retry-camera-btn'),
            connectionDot: document.getElementById('connection-dot'),
            connectionStatus: document.getElementById('connection-status'),
            zoomDisplay: document.getElementById('zoom-display'),
            torchText: document.getElementById('torch-text'),
            resolutionDisplay: document.getElementById('resolution-display'),
            cameraLoading: document.getElementById('camera-loading'),
            cameraError: document.getElementById('camera-error'),
            errorText: document.getElementById('error-text'),
            notificationToast: document.getElementById('notification-toast'),
            toastMessage: document.getElementById('toast-message'),
            zoomControlGroup: document.getElementById('zoom-control-group'),
            torchControlGroup: document.getElementById('torch-control-group'),
        };

        this.elements.cameraView.setAttribute('playsinline', '');
        this.elements.startBtn.addEventListener('click', () => this.requestCameraAccess());
    }

    setupSocketIO() {
        // MODIFIED: Let Socket.IO automatically handle the secure connection.
        this.socket = io({ transports: ['websocket'] });

        this.socket.on('connect', () => {
            this.updateConnectionStatus('Connected', true);
            this.socket.emit('camera_joined', {
                capabilities: this.capabilities,
                userAgent: navigator.userAgent
            });
        });

        this.socket.on('disconnect', () => {
            this.updateConnectionStatus('Disconnected', false);
            this.stopStreaming();
        });
    }

    setupEventListeners() {
        this.elements.zoomSlider.addEventListener('input', (e) => this.setZoom(parseFloat(e.target.value)));
        this.elements.torchBtn.addEventListener('click', () => this.toggleTorch());
        this.elements.resolutionSelect.addEventListener('change', (e) => this.setQuality(e.target.value));
        this.elements.framerateSelect.addEventListener('change', (e) => this.setFrameRate(parseInt(e.target.value)));
        this.elements.retryCameraBtn.addEventListener('click', () => this.requestCameraAccess());
    }

    async requestCameraAccess() {
        this.showLoading(true);
        this.hideError();

        const constraints = {
            video: {
                facingMode: 'environment',
                width: { ideal: 1920 },
                height: { ideal: 1080 },
            },
            audio: false
        };

        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoTrack = this.mediaStream.getVideoTracks()[0];
            this.capabilities = this.videoTrack.getCapabilities();

            const video = this.elements.cameraView;
            video.srcObject = this.mediaStream;

            video.play().then(() => {
                this.elements.startOverlay.classList.add('hidden');
                this.elements.cameraUiWrapper.classList.remove('hidden');
                this.showLoading(false);
                this.setupSocketIO();
                this.setupEventListeners();
                this.setupCameraControls();
                this.startStreaming();
                this.updateResolutionDisplay();
            }).catch(playError => {
                console.error("Video play failed:", playError);
                this.showError("Could not start the video stream.");
            });

        } catch (error) {
            this.showLoading(false);
            this.showError(this.getCameraErrorMessage(error));
        }
    }

    getCameraErrorMessage(error) {
        switch (error.name) {
            case 'NotAllowedError': return 'Camera access denied. Please allow camera permissions.';
            case 'NotFoundError': return 'No camera found on this device.';
            case 'NotReadableError': return 'Camera is in use by another app.';
            default: return 'An unknown camera error occurred.';
        }
    }

    setupCameraControls() {
        if (this.capabilities.zoom) {
            const { min, max, step } = this.capabilities.zoom;
            this.elements.zoomSlider.min = min;
            this.elements.zoomSlider.max = max;
            this.elements.zoomSlider.step = step || 0.1;
            this.elements.zoomControlGroup.style.display = 'flex';
        }
        if (this.capabilities.torch) {
            this.elements.torchControlGroup.style.display = 'flex';
        }
    }

    startStreaming() {
        if (this.isStreaming) return;
        this.isStreaming = true;
        this.streamInterval = setInterval(() => {
            this.captureAndSendFrame();
        }, 1000 / this.frameRate);
    }

    stopStreaming() {
        if (!this.isStreaming) return;
        this.isStreaming = false;
        clearInterval(this.streamInterval);
    }

    captureAndSendFrame() {
        if (this.elements.cameraView.readyState >= 2) {
            this.canvas.width = this.elements.cameraView.videoWidth;
            this.canvas.height = this.elements.cameraView.videoHeight;
            this.ctx.drawImage(this.elements.cameraView, 0, 0, this.canvas.width, this.canvas.height);
            const dataURL = this.canvas.toDataURL('image/jpeg', this.quality);
            if (this.socket && this.socket.connected) {
                this.socket.emit('video_frame', { image: dataURL, timestamp: Date.now() });
            }
        }
    }

    async setZoom(zoomLevel) {
        if (!this.videoTrack || !this.capabilities.zoom) return;
        try {
            await this.videoTrack.applyConstraints({ advanced: [{ zoom: zoomLevel }] });
            this.settings.zoom = zoomLevel;
            this.elements.zoomDisplay.textContent = `${zoomLevel.toFixed(1)}x`;
        } catch (error) {
            console.error('Zoom not supported:', error);
        }
    }

    async toggleTorch() {
        if (!this.videoTrack || !this.capabilities.torch) return;
        try {
            this.settings.torch = !this.settings.torch;
            await this.videoTrack.applyConstraints({ advanced: [{ torch: this.settings.torch }] });
            this.elements.torchBtn.classList.toggle('active', this.settings.torch);
            this.elements.torchText.textContent = this.settings.torch ? 'Flash On' : 'Flash Off';
            this.showToast(`Flash ${this.settings.torch ? 'On' : 'Off'}`);
        } catch (error) {
            console.error('Torch not supported:', error);
            this.showToast('Flash control not supported');
        }
    }

    setFrameRate(fps) {
        this.frameRate = parseInt(fps);
        this.stopStreaming();
        this.startStreaming();
        this.showToast(`Frame rate: ${fps} FPS`);
    }

    setQuality(qualityLevel) {
        const qualityMap = { 'low': 0.6, 'medium': 0.8, 'high': 0.95 };
        this.quality = qualityMap[qualityLevel];
        this.showToast(`Quality: ${qualityLevel}`);
    }

    updateConnectionStatus(text, isConnected) {
        this.elements.connectionDot.className = `dot ${isConnected ? 'connected' : 'disconnected'}`;
        this.elements.connectionStatus.textContent = text;
    }

    updateResolutionDisplay() {
        const { videoWidth, videoHeight } = this.elements.cameraView;
        if (videoWidth && videoHeight) {
            this.elements.resolutionDisplay.textContent = `${videoWidth}×${videoHeight}`;
        }
    }

    showLoading(show) { this.elements.cameraLoading.style.display = show ? 'flex' : 'none'; }
    showError(message) {
        this.elements.errorText.textContent = message;
        this.elements.cameraError.style.display = 'flex';
    }
    hideError() { this.elements.cameraError.style.display = 'none'; }

    showToast(message) {
        this.elements.toastMessage.textContent = message;
        this.elements.notificationToast.classList.add('show');
        setTimeout(() => {
            this.elements.notificationToast.classList.remove('show');
        }, 2000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new InsightLensCamera();
    app.init();
});
