// Ensure Firebase is loaded before running script
if (typeof firebase === 'undefined') {
    alert('Firebase SDK not loaded. Please check your internet connection or script tags.');
    throw new Error('Firebase not loaded');
}

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDPxnvaYapJ4BO2h7PoKw435amJ6i-qYOc",
    authDomain: "screenshareapp-2a85f.firebaseapp.com",
    projectId: "screenshareapp-2a85f",
    storageBucket: "screenshareapp-2a85f.firebasestorage.app",
    messagingSenderId: "252523208229",
    appId: "1:252523208229:web:15b6e19a8c597b6edd69cc",
    measurementId: "G-1Y9EBEKM9E",
    databaseURL: "https://screenshareapp-2a85f-default-rtdb.firebaseio.com/"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const streamRef = db.ref('stream');
const viewersRef = db.ref('viewers');

let localStream = null; // Initialize explicitly
let peerConnection = null;
const config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

// Role Selection
function selectRole(role) {
    document.getElementById('role-selection').style.display = 'none';
    if (role === 'admin') {
        document.getElementById('admin-login').style.display = 'block';
    } else {
        document.getElementById('viewer-stream').style.display = 'block';
        startViewer();
    }
}

// Admin Password Check
function checkPassword() {
    const password = document.getElementById('admin-password').value;
    if (password === 'loopster') {
        document.getElementById('admin-login').style.display = 'none';
        document.getElementById('admin-stream').style.display = 'block';
        updateViewerCount();
    } else {
        alert('Incorrect password');
    }
}

// Start Screen Share (Admin)
async function startScreenShare() {
    try {
        // Clean up existing stream and connection
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }

        // Get screen share stream
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });

        const videoElement = document.getElementById('admin-preview');
        videoElement.srcObject = localStream;

        // Initialize WebRTC
        peerConnection = new RTCPeerConnection(config);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        // Push offer to Firebase
        await streamRef.set({
            offer: {
                type: offer.type,
                sdp: offer.sdp
            }
        });

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                streamRef.child('iceCandidates').push(event.candidate).catch(err => alert('Error sending ICE candidate: ' + err));
            }
        };

        streamRef.on('child_added', async (snapshot) => {
            const data = snapshot.val();
            if (data.answer && peerConnection) {
                try {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                } catch (err) {
                    alert('Error setting remote description: ' + err);
                }
            }
        });

        streamRef.child('viewerIceCandidates').on('child_added', (snapshot) => {
            if (peerConnection) {
                const candidate = new RTCIceCandidate(snapshot.val());
                peerConnection.addIceCandidate(candidate).catch(err => alert('Error adding viewer ICE candidate: ' + err));
            }
        });

    } catch (err) {
        alert('Screen share failed: ' + err.message);
        console.error('Error sharing screen:', err);
    }
}

// Viewer Setup
function startViewer() {
    const videoElement = document.getElementById('viewer-video');
    if (peerConnection) peerConnection.close();
    peerConnection = new RTCPeerConnection(config);

    peerConnection.ontrack = (event) => {
        videoElement.srcObject = event.streams[0];
    };

    // Register viewer in Firebase
    const viewerId = viewersRef.push().key;
    viewersRef.child(viewerId).set({ connected: true }).catch(err => alert('Error registering viewer: ' + err));
    viewersRef.child(viewerId).onDisconnect().remove();

    streamRef.on('value', async (snapshot) => {
        const data = snapshot.val();
        if (data && data.offer && !peerConnection.currentRemoteDescription) {
            try {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);

                streamRef.child('answer').set({
                    type: answer.type,
                    sdp: answer.sdp
                }).catch(err => alert('Error sending answer: ' + err));
            } catch (err) {
                alert('Error in viewer setup: ' + err);
            }
        }
    });

    streamRef.child('iceCandidates').on('child_added', (snapshot) => {
        if (peerConnection) {
            const candidate = new RTCIceCandidate(snapshot.val());
            peerConnection.addIceCandidate(candidate).catch(err => alert('Error adding admin ICE candidate: ' + err));
        }
    });

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            streamRef.child('viewerIceCandidates').push(event.candidate).catch(err => alert('Error sending viewer ICE candidate: ' + err));
        }
    };
}

// Update Viewer Count for Admin
function updateViewerCount() {
    viewersRef.on('value', (snapshot) => {
        const viewerCount = snapshot.numChildren();
        document.getElementById('viewer-count').textContent = `Viewers: ${viewerCount}`;
    }, (err) => {
        alert('Error fetching viewer count: ' + err);
    });
}

// Fullscreen Toggle for Viewers
function toggleFullscreen() {
    const video = document.getElementById('viewer-video');
    if (!document.fullscreenElement) {
        video.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}
