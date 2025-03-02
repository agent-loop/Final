// Firebase Configuration (for viewer count only)
const firebaseConfig = {
    apiKey: "AIzaSyDPxnvaYapJ4BO2h7PoKw435amJ6i-qYOc",
    authDomain: "screenshareapp-2a85f.firebaseapp.com",
    projectId: "screenshareapp-2a85f",
    storageBucket: "screenshareapp-2a85f.firebasestorage.app",
    messagingSenderId: "252523208229",
    appId: "1:252523208229:web:15b6e19a8c597b6edd69cc",
    measurementId: "G-1Y9EBEKM9E",
    databaseURL: "https://screenshareapp-2a85f-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const viewersRef = db.ref('viewers');

let localStream = null;
let peerConnection = null;
const config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
    ],
    iceTransportPolicy: 'all',
    iceCandidatePoolSize: 10
};

// WebSocket connection (public echo server for testing, replace with production server)
const socket = new WebSocket('wss://echo.websocket.org');

socket.onopen = () => console.log('WebSocket connected');
socket.onerror = (err) => console.error('WebSocket error:', err);
socket.onclose = () => console.log('WebSocket closed');

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
        console.log('Start Screen Share clicked');
        alert('Starting screen share process');

        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }

        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });
        console.log('Screen share stream obtained');
        alert('Screen share stream obtained');

        const videoElement = document.getElementById('admin-preview');
        videoElement.srcObject = localStream;

        peerConnection = new RTCPeerConnection(config);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        console.log('Tracks added to peer connection');

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('Admin ICE candidate: ', event.candidate);
                socket.send(JSON.stringify({
                    type: 'icecandidate',
                    candidate: event.candidate,
                    role: 'admin'
                }));
            } else {
                console.log('Admin ICE gathering complete');
            }
        };

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        console.log('Offer created: ', offer);
        socket.send(JSON.stringify({
            type: 'offer',
            offer: offer,
            role: 'admin'
        }));

        socket.onmessage = async (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'answer' && peerConnection) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                console.log('Answer received: ', data.answer);
                alert('Answer received');
            } else if (data.type === 'icecandidate' && peerConnection) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                console.log('Viewer ICE candidate added: ', data.candidate);
            }
        };

        peerConnection.onconnectionstatechange = () => {
            console.log('Admin connection state: ', peerConnection.connectionState);
            if (peerConnection.connectionState === 'connected') {
                console.log('Admin connected to viewer');
            }
        };

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
        console.log('Viewer received stream track: ', event.streams[0]);
        alert('Viewer received stream track');
    };

    const viewerId = viewersRef.push().key;
    viewersRef.child(viewerId).set({ connected: true })
        .then(() => console.log('Viewer registered in Firebase'))
        .catch(err => alert('Error registering viewer: ' + err));
    viewersRef.child(viewerId).onDisconnect().remove();

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('Viewer ICE candidate: ', event.candidate);
            socket.send(JSON.stringify({
                type: 'icecandidate',
                candidate: event.candidate,
                role: 'viewer'
            }));
        } else {
            console.log('Viewer ICE gathering complete');
        }
    };

    socket.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'offer' && !peerConnection.currentRemoteDescription) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            console.log('Offer received: ', data.offer);
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            console.log('Answer created: ', answer);
            socket.send(JSON.stringify({
                type: 'answer',
                answer: answer,
                role: 'viewer'
            }));
            alert('Answer sent');
        } else if (data.type === 'icecandidate' && peerConnection) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            console.log('Admin ICE candidate added: ', data.candidate);
        }
    };

    peerConnection.onconnectionstatechange = () => {
        console.log('Viewer connection state: ', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
            console.log('Viewer connected to admin');
        }
    };
}

// Update Viewer Count for Admin
function updateViewerCount() {
    viewersRef.on('value', (snapshot) => {
        const viewerCount = snapshot.numChildren();
        document.getElementById('viewer-count').textContent = `Viewers: ${viewerCount}`;
        console.log('Viewer count updated to: ', viewerCount);
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
