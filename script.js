const video = document.getElementById("camera");
let facingMode = "environment";
let currentStream = null;
let currentEffect = "fisheye";
let flashOn = false;

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
        };
    } catch (err) {
        alert("Camera error: " + err.message);
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
        chain = chain.sepia(0.7).vignette(0.4, 0.6).noise(0.15);
    } else if (currentEffect === "comic") {
        chain = chain.dotScreen(cx, cy, 0, 3).brightnessContrast(0.1, 0.6);
    } else if (currentEffect === "motion") {
        chain = chain.zoomBlur(cx, cy, 0.3).vibrance(0.8);
    }

    chain.update();
}

function draw() {
    if (!texture) {
        texture = glfxCanvas.texture(video);
    }
    texture.loadContentsOf(video);

    const cx = video.videoWidth / 2;
    const cy = video.videoHeight / 2;
    const radius = Math.min(video.videoWidth, video.videoHeight) / 1.5;

    let chain = glfxCanvas.draw(texture);

    applyEffect();

    // if (currentEffect === "fisheye") {
    //     chain = chain.bulgePinch(cx, cy, radius, 0.5).vignette(0.5, 0.5);
    // } else if (currentEffect === "fisheyebw") {
    //     chain = chain.bulgePinch(cx, cy, radius, 0.5).hueSaturation(0, -1).vignette(0.5, 0.5);
    // } else if (currentEffect === "swirl") {
    //     chain = chain.swirl(cx, cy, radius, 3).vignette(0.5, 0.5);
    // } else if (currentEffect === "bw") {
    //     chain = chain.hueSaturation(0, -1);
    // }
    // "none" = raw feed

    chain.update();

    if (!isFrozen) requestAnimationFrame(draw);
}

function draw() {
    if (!texture) texture = glfxCanvas.texture(video);
    texture.loadContentsOf(video);
    applyEffect();                          // ← one line
    if (!isFrozen) requestAnimationFrame(draw);
}

const effectToggle = document.getElementById("effectToggle");
const effectMenu = document.getElementById("effectMenu");

// Tap the toggle to reveal/hide the menu
effectToggle.addEventListener("click", () => {
    effectMenu.classList.toggle("hidden");
});

// Pick an effect
document.querySelectorAll(".effect-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        currentEffect = btn.dataset.effect;

        // Update active highlight
        document.querySelectorAll(".effect-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        // Update the toggle label to show the choice, and collapse the menu
        effectToggle.textContent = btn.textContent + " ▾";
        effectMenu.classList.add("hidden");
    });
});

// Landing page → tap to enter camera
document.getElementById("landing").addEventListener("click", () => {
    document.getElementById("landing").classList.add("hidden");
    startCamera();
});

// --- Shutter + review flow ---

document.getElementById("shutter").addEventListener("click", takePhoto);
document.getElementById("discard").addEventListener("click", discard);
document.getElementById("save").addEventListener("click", savePhoto);
document.getElementById("share").addEventListener("click", sharePhoto);
document.getElementById("flip").addEventListener("click", flipCamera);

document.getElementById("flash").addEventListener("click", toggleFlash);

async function toggleFlash() {
    if (!currentStream) return;
    const track = currentStream.getVideoTracks()[0];
    const capabilities = track.getCapabilities ? track.getCapabilities() : {};

    // Only works if the device exposes a torch
    if (!capabilities.torch) {
        showToast("Flash not available on this camera");
        return;
    }

    flashOn = !flashOn;
    try {
        await track.applyConstraints({
            advanced: [{ torch: flashOn }]
        });
        // Update the button look
        // Show slash when off, hide when on
        document.getElementById("flashSlash").style.display = flashOn ? "none" : "block";
    } catch (err) {
        showToast("Flash failed");
    }
}

// Tap-to-focus: show ring where tapped, attempt to refocus
glfxCanvas.addEventListener("click", (e) => {
    const ring = document.getElementById("focusRing");

    // Position the ring where the finger/cursor tapped
    ring.style.left = e.clientX + "px";
    ring.style.top = e.clientY + "px";

    // Animate it in, then out
    ring.classList.remove("hidden");
    ring.classList.add("show");
    setTimeout(() => {
        ring.classList.remove("show");
    }, 400);

    // Best-effort actual refocus (works on some devices, not iPhone Safari)
    tryRefocus();
});

async function tryRefocus() {
    if (!currentStream) return;
    const track = currentStream.getVideoTracks()[0];
    const capabilities = track.getCapabilities ? track.getCapabilities() : {};

    if (capabilities.focusMode && capabilities.focusMode.includes("single-shot")) {
        try {
            await track.applyConstraints({
                advanced: [{ focusMode: "single-shot" }]
            });
        } catch (err) {
            // Device won't allow it — the ring still shows, just no refocus
        }
    }
}

function takePhoto() {
    isFrozen = true;

    // Re-render so the buffer is full, then capture
    texture.loadContentsOf(video);

    const cx = video.videoWidth / 2;
    const cy = video.videoHeight / 2;
    const radius = Math.min(video.videoWidth, video.videoHeight) / 1.5;

    let chain = glfxCanvas.draw(texture);

    applyEffect();

    // if (currentEffect === "fisheye") {
    //     chain = chain.bulgePinch(cx, cy, radius, 0.5).vignette(0.5, 0.5);
    // } else if (currentEffect === "fisheyebw") {
    //     chain = chain.bulgePinch(cx, cy, radius, 0.5).hueSaturation(0, -1).vignette(0.5, 0.5);
    // } else if (currentEffect === "swirl") {
    //     chain = chain.swirl(cx, cy, radius, 3).vignette(0.5, 0.5);
    // } else if (currentEffect === "bw") {
    //     chain = chain.hueSaturation(0, -1);
    // }

    chain.update();

    glfxCanvas.toBlob((blob) => { capturedBlob = blob; }, "image/png");

    document.getElementById("shutter").classList.add("hidden");
    document.getElementById("flip").classList.add("hidden");
    document.getElementById("review").classList.remove("hidden");
    document.getElementById("effectRail").classList.add("hidden");
    document.getElementById("flash").classList.add("hidden");
}

function discard() {
    isFrozen = false;
    capturedBlob = null;
    document.getElementById("shutter").classList.remove("hidden");
    document.getElementById("flip").classList.remove("hidden");
    document.getElementById("review").classList.add("hidden");
    document.getElementById("effectRail").classList.remove("hidden");
    document.getElementById("flash").classList.remove("hidden");
    draw();
}

function flipCamera() {
    facingMode = (facingMode === "environment") ? "user" : "environment";
    startCamera();
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
