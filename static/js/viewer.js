class InsightLensViewer {
    constructor() {
        this.socket = null;
        this.elements = {};
        this.transform = { scale: 1, x: 0, y: 0 };
        this.isDragging = false;
        this.panMode = false;
        this.dragStart = { x: 0, y: 0 };
        this.frameCount = 0;
        this.startTime = Date.now();
        this.isFrozen = false;
        this.isHudVisible = true;
    }

    init() {
        this.elements = {
            viewerContainer: document.getElementById('viewer-container'),
            liveStream: document.getElementById('live-stream'),
            setupOverlay: document.getElementById('setup-overlay'),
            errorModal: document.getElementById('error-modal'),
            statusBar: document.getElementById('status-bar'),
            viewerControls: document.getElementById('viewer-controls'),
            shortcutsLegend: document.getElementById('shortcuts-legend'),
            copyUrlBtn: document.getElementById('copy-url-btn'),
            cameraUrl: document.getElementById('camera-url'),
            setupStatus: document.getElementById('setup-status'),
            connectionIndicator: document.getElementById('connection-indicator'),
            // MODIFIED: Added connectionText element
            connectionText: document.getElementById('connection-text'),
            fpsCounter: document.getElementById('fps-counter'),
            zoomInBtn: document.getElementById('zoom-in-btn'),
            zoomOutBtn: document.getElementById('zoom-out-btn'),
            zoomLevel: document.getElementById('zoom-level'),
            freezeBtn: document.getElementById('freeze-btn'),
            panBtn: document.getElementById('pan-btn'),
            resetViewBtn: document.getElementById('reset-view-btn'),
            hudToggleBtn: document.getElementById('hud-toggle-btn'),
            fullscreenBtn: document.getElementById('fullscreen-btn'),
            errorMessage: document.getElementById('error-message'),
            retryBtn: document.getElementById('retry-btn'),
            closeErrorBtn: document.getElementById('close-error-btn'),
        };

        this.showOverlay('setup');
        this.setupEventListeners();
        this.setupSocketIO();
    }

    setupSocketIO() {
        this.socket = io({ transports: ['websocket'] });

        this.socket.on('connect', () => {
            this.updateConnectionStatus('Server Connected', true, 'Waiting for camera...');
            this.socket.emit('viewer_joined');
        });

        this.socket.on('disconnect', () => {
            this.updateConnectionStatus('Server Disconnected', false);
            this.showError('Lost connection to the server.');
        });

        const onCameraConnect = () => {
            this.updateConnectionStatus('Camera Connected', true);
            this.showOverlay(null);
        };

        this.socket.on('camera_connected', onCameraConnect);
        this.socket.on('camera_already_connected', onCameraConnect);

        this.socket.on('camera_disconnected', () => {
            this.updateConnectionStatus('Camera Disconnected', false, 'Waiting for camera...');
            this.showOverlay('setup');
            this.showError('The camera has disconnected.');
        });

        this.socket.on('new_frame', (data) => {
            if (!this.isFrozen) {
                this.elements.liveStream.src = data.image;
                this.updateFPS();
            }
        });
    }

    setupEventListeners() {
        this.elements.copyUrlBtn.addEventListener('click', () => this.copyToClipboard());
        this.elements.freezeBtn.addEventListener('click', () => this.toggleFreeze());
        this.elements.panBtn.addEventListener('click', () => this.togglePanMode());
        this.elements.resetViewBtn.addEventListener('click', () => this.resetView());
        this.elements.hudToggleBtn.addEventListener('click', () => this.toggleHud());
        this.elements.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
        this.elements.zoomInBtn.addEventListener('click', () => this.zoom(1.2));
        this.elements.zoomOutBtn.addEventListener('click', () => this.zoom(0.8));
        this.elements.retryBtn.addEventListener('click', () => window.location.reload());
        this.elements.closeErrorBtn.addEventListener('click', () => this.hideError());

        const container = this.elements.viewerContainer;
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomFactor = e.deltaY > 0 ? 0.95 : 1.05;
            this.zoom(zoomFactor, e.clientX, e.clientY);
        });

        container.addEventListener('mousedown', (e) => {
            if (e.button === 0 && this.panMode) {
                this.isDragging = true;
                this.dragStart = { x: e.clientX - this.transform.x, y: e.clientY - this.transform.y };
                container.style.cursor = 'grabbing';
                e.preventDefault();
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                this.transform.x = e.clientX - this.dragStart.x;
                this.transform.y = e.clientY - this.dragStart.y;
                this.updateTransform();
            }
        });

        document.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                container.style.cursor = 'grab';
            }
        });

        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }

    showOverlay(overlayId) {
        ['setup', 'error'].forEach(id => {
            const el = this.elements[`${id}${id === 'error' ? 'Modal' : 'Overlay'}`];
            if (id === overlayId) {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        });

        if (overlayId === null) {
            this.elements.statusBar.classList.remove('hidden');
            this.elements.viewerControls.classList.remove('hidden');
            this.elements.shortcutsLegend.classList.remove('hidden');
        } else {
            this.elements.statusBar.classList.add('hidden');
            this.elements.viewerControls.classList.add('hidden');
            this.elements.shortcutsLegend.classList.add('hidden');
        }
    }

    updateConnectionStatus(text, isConnected, setupText = '') {
        this.elements.connectionIndicator.className = `indicator ${isConnected ? 'connected' : 'disconnected'}`;
        // MODIFIED: Target the correct element by its new ID
        this.elements.connectionText.textContent = text;
        if (setupText) {
            this.elements.setupStatus.innerHTML = `<span class="spinner"></span>${setupText}`;
        }
    }

    updateFPS() {
        this.frameCount++;
        const elapsed = (Date.now() - this.startTime) / 1000;
        if (elapsed >= 1) {
            this.elements.fpsCounter.textContent = Math.round(this.frameCount / elapsed);
            this.frameCount = 0;
            this.startTime = Date.now();
        }
    }

    updateTransform() {
        this.elements.liveStream.style.transform = `translate(${this.transform.x}px, ${this.transform.y}px) scale(${this.transform.scale})`;
    }

    zoom(factor, centerX = null, centerY = null) {
        const containerRect = this.elements.viewerContainer.getBoundingClientRect();
        const pivotX = centerX !== null ? centerX - containerRect.left : containerRect.width / 2;
        const pivotY = centerY !== null ? centerY - containerRect.top : containerRect.height / 2;

        const oldScale = this.transform.scale;
        this.transform.scale = Math.max(0.5, Math.min(10, this.transform.scale * factor));

        this.transform.x = pivotX - (pivotX - this.transform.x) * (this.transform.scale / oldScale);
        this.transform.y = pivotY - (pivotY - this.transform.y) * (this.transform.scale / oldScale);

        this.updateTransform();
        this.elements.zoomLevel.textContent = `${Math.round(this.transform.scale * 100)}%`;
    }

    resetView() {
        this.transform = { scale: 1, x: 0, y: 0 };
        this.updateTransform();
        this.elements.zoomLevel.textContent = '100%';
    }

    toggleFreeze() {
        this.isFrozen = !this.isFrozen;
        this.elements.freezeBtn.innerHTML = this.isFrozen ? '▶️' : '⏸️';
        this.elements.freezeBtn.title = this.isFrozen ? 'Resume Stream' : 'Freeze Frame';
        this.elements.freezeBtn.classList.toggle('active', this.isFrozen);
    }

    togglePanMode() {
        this.panMode = !this.panMode;
        this.elements.panBtn.classList.toggle('active', this.panMode);
        this.elements.viewerContainer.style.cursor = this.panMode ? 'grab' : 'default';
    }

    toggleHud() {
        this.isHudVisible = !this.isHudVisible;
        this.elements.statusBar.classList.toggle('opacity-0', !this.isHudVisible);
        this.elements.viewerControls.classList.toggle('opacity-0', !this.isHudVisible);
        this.elements.shortcutsLegend.classList.toggle('opacity-0', !this.isHudVisible);
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }

    handleKeyboard(e) {
        if (this.elements.setupOverlay.classList.contains('hidden')) {
            if (this.panMode && e.key.startsWith('Arrow')) {
                e.preventDefault();
                const panAmount = 10 / this.transform.scale;
                switch (e.key) {
                    case 'ArrowUp': this.transform.y += panAmount; break;
                    case 'ArrowDown': this.transform.y -= panAmount; break;
                    case 'ArrowLeft': this.transform.x += panAmount; break;
                    case 'ArrowRight': this.transform.x -= panAmount; break;
                }
                this.updateTransform();
                return;
            }

            switch (e.key) {
                case '+': case '=': this.zoom(1.2); break;
                case '-': this.zoom(0.8); break;
                case '0': this.resetView(); break;
                case 'p': case 'P': this.togglePanMode(); break;
                case 'h': case 'H': this.toggleHud(); break;
                case 'f': case 'F': e.preventDefault(); this.toggleFullscreen(); break;
                case ' ': e.preventDefault(); this.toggleFreeze(); break;
            }
        }
    }

    copyToClipboard() {
        navigator.clipboard.writeText(this.elements.cameraUrl.textContent);
    }

    showError(message) {
        this.elements.errorMessage.textContent = message;
        this.showOverlay('error');
    }

    hideError() {
        this.showOverlay('setup');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new InsightLensViewer();
    app.init();
});
