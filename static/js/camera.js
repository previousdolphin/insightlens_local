class InsightLensCamera {
    constructor() {
        this.socket = null;
        this.mediaStream = null;
        this.videoTrack = null;
        this.isStreaming = false;
        this.streamInterval = null;
        this.frameRate = 15;
        this.quality = 0.8;
        this.capabilities = {};
        this.settings = { zoom: 1, torch: false, focusMode: 'continuous' };

        // Element cache
        this.elements = {};

        // Bind 'this' context for event handlers
        this.requestCameraAccess = this.requestCameraAccess.bind(this);
        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
        this.triggerFocus = this.triggerFocus.bind(this);
    }

    init() {
        this.cacheElements();
        this.setupEventListeners();
    }

    cacheElements() {
        this.elements.startOverlay = document.getElementById('start-overlay');
        this.elements.startBtn = document.getElementById('start-camera-btn');
        this.elements.cameraUiWrapper = document.getElementById('camera-ui-wrapper');
        this.elements.loadingOverlay = document.getElementById('camera-loading');
        this.elements.errorOverlay = document.getElementById('camera-error');
        this.elements.errorText = document.getElementById('error-text');
        this.elements.retryBtn = document.getElementById('retry-camera-btn');
        this.elements.video = document.getElementById('camera-view');
        this.elements.canvas = document.getElementById('frame-canvas');
        this.elements.ctx = this.elements.canvas.getContext('2d');
        // Add other elements as needed
    }

    setupEventListeners() {
        this.elements.startBtn.addEventListener('click', this.requestCameraAccess);
        this.elements.retryBtn.addEventListener('click', this.requestCameraAccess);

        document.getElementById('zoom-slider')?.addEventListener('input', (e) => this.setZoom(parseFloat(e.target.value)));
        document.getElementById('torch-btn')?.addEventListener('click', () => this.toggleTorch());
        document.getElementById('resolution-select')?.addEventListener('change', (e) => this.setQuality(e.target.value));
        document.getElementById('framerate-select')?.addEventListener('change', (e) => this.setFrameRate(parseInt(e.target.value)));
        this.elements.video.addEventListener('click', this.triggerFocus);
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }

    setupSocketIO() {
        if (this.socket) return; // Already connected

        const host = window.location.host;
        this.socket = io(`https://${host}`, { transports: ['websocket'] });

        this.socket.on('connect', () => {
            this.updateConnectionStatus('Connected', true);
            this.socket.emit('camera_joined', { capabilities: this.capabilities });
            this.startStreaming();
        });

        this.socket.on('disconnect', () => {
            this.updateConnectionStatus('Disconnected', false);
            this.stopStreaming();
        });
    }

    async requestCameraAccess() {
        this.show(this.elements.loadingOverlay);
        this.hide(this.elements.startOverlay);
        this.hide(this.elements.errorOverlay);

        const constraints = {
            video: {
                facingMode: 'environment',
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30 }
            },
            audio: false
        };

        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoTrack = this.mediaStream.getVideoTracks()[0];
            this.capabilities = this.videoTrack.getCapabilities();

            this.elements.video.srcObject = this.mediaStream;

            this.elements.video.onloadedmetadata = () => {
                this.hide(this.elements.loadingOverlay);
                this.show(this.elements.cameraUiWrapper); // Show the main camera UI
                this.updateResolutionDisplay();
                this.setupCameraControls();

                // CRITICAL: Connect to server AFTER getting permission
                this.setupSocketIO();
            };
        } catch (error) {
            this.hide(this.elements.loadingOverlay);
            this.show(this.elements.errorOverlay);
            this.elements.errorText.textContent = this.getCameraErrorMessage(error);
        }
    }

    getCameraErrorMessage(error) {
        if (error.name === 'NotAllowedError') return 'Permission denied. Please allow camera access in your browser settings.';
        if (error.name === 'NotFoundError') return 'No camera found on this device.';
        return `An unexpected error occurred: ${error.name}`;
    }

    startStreaming() {
        if (this.isStreaming) return;
        this.isStreaming = true;
        const intervalMs = 1000 / this.frameRate;
        this.streamInterval = setInterval(() => this.captureAndSendFrame(), intervalMs);
    }

    stopStreaming() {
        this.isStreaming = false;
        clearInterval(this.streamInterval);
    }

    captureAndSendFrame() {
        const video = this.elements.video;
        if (video.readyState < video.HAVE_CURRENT_DATA) return;

        this.elements.canvas.width = video.videoWidth;
        this.elements.canvas.height = video.videoHeight;
        this.elements.ctx.drawImage(video, 0, 0);

        const dataURL = this.elements.canvas.toDataURL('image/jpeg', this.quality);
        this.socket.emit('video_frame', { image: dataURL, timestamp: Date.now() });
    }

    handleVisibilityChange() {
        if (document.hidden) {
            this.stopStreaming();
        } else if (this.socket && this.socket.connected) {
            this.startStreaming();
        }
    }

    // --- UI and Control Methods ---

    show(element) { element?.classList.remove('hidden'); }
    hide(element) { element?.classList.add('hidden'); }

    updateConnectionStatus(text, isConnected) {
        document.getElementById('connection-dot').className = `dot ${isConnected ? 'connected' : 'disconnected'}`;
        document.getElementById('connection-status').textContent = text;
    }

    updateResolutionDisplay() {
        const { videoWidth, videoHeight } = this.elements.video;
        document.getElementById('resolution-display').textContent = `${videoWidth}x${videoHeight}`;
    }

    setupCameraControls() {
        // ... (Implement zoom, torch, etc. setup logic here if needed) ...
    }

    async setZoom(level) { /* ... Zoom logic ... */ }
    async toggleTorch() { /* ... Torch logic ... */ }

    async triggerFocus() {
        if (!this.videoTrack) return;
        const indicator = document.getElementById('focus-indicator');
        indicator.classList.add('active');
        try {
            await this.videoTrack.applyConstraints({ advanced: [{ focusMode: 'single-shot' }] });
            setTimeout(() => this.videoTrack.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }), 2000);
        } catch (e) { console.warn("Focus failed", e); }
        setTimeout(() => indicator.classList.remove('active'), 1000);
    }

    setFrameRate(fps) {
        this.frameRate = parseInt(fps, 10);
        this.stopStreaming();
        this.startStreaming();
    }

    setQuality(quality) {
        const qualityMap = { low: 0.5, medium: 0.75, high: 0.9 };
        this.quality = qualityMap[quality] || 0.75;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const cameraApp = new InsightLensCamera();
    cameraApp.init();
});
