const video = document.getElementById("camera");
let facingMode = "environment";
let currentStream = null;
let currentEffect = "fisheye";
let flashOn = false;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let currentZoom = 1;
let audioStream = null;

let glfxCanvas;
try {
    glfxCanvas = fx.canvas();
} catch (e) {
    alert("Sorry, your browser doesn't support WebGL: " + e);
}

document.body.appendChild(glfxCanvas);

let texture;
let isFrozen = false;
let capturedBlob = null;

async function startCamera() {
    try {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: facingMode }
        });
        currentStream = stream;
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play();
            texture = null;
            isFrozen = false;
            draw();
            warmUpMic();   // start the mic early so it's ready when recording
        };
    } catch (err) {
        alert("Camera error: " + err.message);
    }
}

async function warmUpMic() {
    if (audioStream) return;  // already have it
    try {
        audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                autoGainControl: false,
                noiseSuppression: false,
                echoCancellation: false
            }
        });
    } catch (err) {
        // No mic permission — recording will be video-only
    }
}

function applyEffect() {
    const cx = video.videoWidth / 2;
    const cy = video.videoHeight / 2;
    const radius = Math.min(video.videoWidth, video.videoHeight) / 1.5;

    let chain = glfxCanvas.draw(texture);

    if (currentEffect === "fisheye") {
        chain = chain.bulgePinch(cx, cy, radius, 0.5).vignette(0.5, 0.5);
    } else if (currentEffect === "fisheyebw") {
        chain = chain.bulgePinch(cx, cy, radius, 0.5).hueSaturation(0, -1).vignette(0.5, 0.5);
    } else if (currentEffect === "swirl") {
        chain = chain.swirl(cx, cy, radius, 3).vignette(0.5, 0.5);
    } else if (currentEffect === "bw") {
        chain = chain.hueSaturation(0, -1);
    } else if (currentEffect === "punch") {
        chain = chain.vibrance(1.0).brightnessContrast(0.05, 0.8);
    } else if (currentEffect === "film") {
        chain = chain
            .hueSaturation(0.02, 0.02)
            .brightnessContrast(-0.03, 0.15)
            .vignette(0.35, 0.5)
            .noise(0.08);
    } else if (currentEffect === "halftone") {
        chain = chain.colorHalftone(cx, cy, 0.75, 8).brightnessContrast(0.05, 0.8);
    } else if (currentEffect === "comic") {
        chain = chain.dotScreen(cx, cy, 0, 3).brightnessContrast(0.1, 0.6);
    } else if (currentEffect === "motion") {
        chain = chain.zoomBlur(cx, cy, 0.3).vibrance(0.8);
    }

    chain.update();
}

function draw() {
    if (!texture) texture = glfxCanvas.texture(video);
    texture.loadContentsOf(video);
    applyEffect();
    if (!isFrozen) requestAnimationFrame(draw);
}

const effectToggle = document.getElementById("effectToggle");
const effectMenu = document.getElementById("effectMenu");

effectToggle.addEventListener("click", () => {
    effectMenu.classList.toggle("hidden");
});

document.querySelectorAll(".effect-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        currentEffect = btn.dataset.effect;
        document.querySelectorAll(".effect-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        effectToggle.textContent = btn.textContent + " ▾";
        effectMenu.classList.add("hidden");
    });
});

// Landing page → tap to enter camera
document.getElementById("landing").addEventListener("click", () => {
    document.getElementById("landing").classList.add("hidden");
    startCamera();
});

// --- Buttons ---
document.getElementById("shutter").addEventListener("click", takePhoto);
document.getElementById("discard").addEventListener("click", discard);
document.getElementById("save").addEventListener("click", savePhoto);
document.getElementById("share").addEventListener("click", sharePhoto);
document.getElementById("flip").addEventListener("click", flipCamera);
document.getElementById("flash").addEventListener("click", toggleFlash);
document.getElementById("record").addEventListener("click", toggleRecord);

// Pinch-to-zoom (hardware zoom, falls back silently if unsupported)
let pinchStartDist = 0;
let pinchStartZoom = 1;

glfxCanvas.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) {
        pinchStartDist = getPinchDistance(e.touches);
        pinchStartZoom = currentZoom;
    }
}, { passive: false });

glfxCanvas.addEventListener("touchmove", (e) => {
    if (e.touches.length === 2) {
        e.preventDefault();  // stop the page from zooming
        const dist = getPinchDistance(e.touches);
        const scale = dist / pinchStartDist;
        setZoom(pinchStartZoom * scale);
    }
}, { passive: false });

function getPinchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

async function setZoom(zoom) {
    if (!currentStream) return;
    const track = currentStream.getVideoTracks()[0];
    const capabilities = track.getCapabilities ? track.getCapabilities() : {};

    // Only if the device exposes zoom
    if (!capabilities.zoom) return;

    // Clamp to what the device allows
    const min = capabilities.zoom.min;
    const max = capabilities.zoom.max;
    currentZoom = Math.max(min, Math.min(zoom, max));

    try {
        await track.applyConstraints({ advanced: [{ zoom: currentZoom }] });
    } catch (err) {
        // Device won't allow it — silently ignore
    }
}

async function toggleFlash() {
    if (!currentStream) return;
    const track = currentStream.getVideoTracks()[0];
    const capabilities = track.getCapabilities ? track.getCapabilities() : {};
    if (!capabilities.torch) {
        showToast("Flash not available on this camera");
        return;
    }
    flashOn = !flashOn;
    try {
        await track.applyConstraints({ advanced: [{ torch: flashOn }] });
        document.getElementById("flashSlash").style.display = flashOn ? "none" : "block";
    } catch (err) {
        showToast("Flash failed");
    }
}

// Tap-to-focus
glfxCanvas.addEventListener("click", (e) => {
    const ring = document.getElementById("focusRing");
    ring.style.left = e.clientX + "px";
    ring.style.top = e.clientY + "px";
    ring.classList.remove("hidden");
    ring.classList.add("show");
    setTimeout(() => ring.classList.remove("show"), 400);
    tryRefocus();
});

async function tryRefocus() {
    if (!currentStream) return;
    const track = currentStream.getVideoTracks()[0];
    const capabilities = track.getCapabilities ? track.getCapabilities() : {};
    if (capabilities.focusMode && capabilities.focusMode.includes("single-shot")) {
        try {
            await track.applyConstraints({ advanced: [{ focusMode: "single-shot" }] });
        } catch (err) { /* device won't allow */ }
    }
}

function takePhoto() {
    isFrozen = true;
    texture.loadContentsOf(video);
    applyEffect();
    glfxCanvas.toBlob((blob) => { capturedBlob = blob; }, "image/png");

    document.getElementById("shutter").classList.add("hidden");
    document.getElementById("flip").classList.add("hidden");
    document.getElementById("review").classList.remove("hidden");
    document.getElementById("effectRail").classList.add("hidden");
    document.getElementById("flash").classList.add("hidden");
    document.getElementById("record").classList.add("hidden");
}

function discard() {
    isFrozen = false;
    capturedBlob = null;
    document.getElementById("shutter").classList.remove("hidden");
    document.getElementById("flip").classList.remove("hidden");
    document.getElementById("review").classList.add("hidden");
    document.getElementById("effectRail").classList.remove("hidden");
    document.getElementById("flash").classList.remove("hidden");
    document.getElementById("record").classList.remove("hidden");
    draw();
}

function flipCamera() {
    facingMode = (facingMode === "environment") ? "user" : "environment";
    startCamera();
}

function toggleRecord() {
    if (!isRecording) {
        startRecording();
    } else {
        stopRecording();
    }
}

async function startRecording() {
    // Get the canvas video stream (your effect)
    const canvasStream = glfxCanvas.captureStream(30);

    // Try to get microphone audio and add it in
    // Use the already-warmed mic (from warmUpMic)
    let combinedStream = canvasStream;
    if (audioStream) {
        combinedStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...audioStream.getAudioTracks()
        ]);
    } else {
        showToast("Recording without audio");
    }

    let mimeType = "video/mp4";
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "video/webm";
    if (!MediaRecorder.isTypeSupported(mimeType)) {
        showToast("Recording not supported on this device");
        return;
    }

    recordedChunks = [];
    mediaRecorder = new MediaRecorder(combinedStream, { mimeType });
    mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: mimeType });
        shareVideo(blob, mimeType);
    };
    mediaRecorder.start();
    isRecording = true;
    document.getElementById("record").classList.add("recording");
}

function stopRecording() {
    isRecording = false;
    document.getElementById("record").classList.remove("recording");
    setTimeout(() => {
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
            mediaRecorder.stop();
        }
    }, 100);
}

async function shareVideo(blob, mimeType) {
    const ext = mimeType.includes("mp4") ? "mp4" : "webm";
    const file = new File([blob], "wawa-cam." + ext, { type: mimeType });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file] });
            showToast("Shared");
        } catch (err) { /* cancelled */ }
    } else {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "wawa-cam." + ext;
        link.click();
        showToast("Saved");
    }
}

async function savePhoto() {
    if (!capturedBlob) return;
    const file = new File([capturedBlob], "fun-camera.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file] });
            showToast("Shared");
        } catch (err) { /* cancelled */ }
    } else {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(capturedBlob);
        link.download = "fun-camera-" + Date.now() + ".png";
        link.click();
        showToast("Saved");
    }
}

function sharePhoto() {
    savePhoto();
}

function showToast(msg) {
    const toast = document.getElementById("toast");
    toast.textContent = msg;
    toast.classList.remove("hidden");
    setTimeout(() => toast.classList.add("hidden"), 1600);
}