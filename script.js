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
    databaseURL: "https://screenshareapp-2a85f-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const streamRef = db.ref('stream');
const viewersRef = db.ref('viewers');

let localStream = null;
let peerConnection = null;
const config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
    ],
    iceTransportPolicy: 'all', // Force use of all available ICE transports
    iceCandidatePoolSize: 10 // Pre-gather candidates
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
        console.log('Start Screen Share clicked');
        alert('Starting screen share process');

        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
            console.log('Existing stream stopped');
        }
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
            console.log('Existing peer connection closed');
        }

        console.log('Requesting screen share permission');
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });
        console.log('Screen share stream obtained');
        alert('Screen share stream obtained');

        const videoElement = document.getElementById('admin-preview');
        videoElement.srcObject = localStream;
        console.log('Preview video set');

        await streamRef.remove();
        console.log('Firebase stream data reset');

        peerConnection = new RTCPeerConnection(config);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        console.log('Tracks added to peer connection');

        // Set ICE candidate handler *before* creating offer
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('Admin ICE candidate generated: ', event.candidate);
                streamRef.child('iceCandidates').push(event.candidate)
                    .then(() => console.log('Admin ICE candidate sent to Firebase'))
                    .catch(err => {
                        console.error('Error sending admin ICE candidate: ', err);
                        alert('Error sending ICE candidate: ' + err.message);
                    });
            } else {
                console.log('Admin ICE gathering complete');
            }
        };

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        console.log('Offer created and set: ', offer);

        await streamRef.set({
            offer: {
                type: offer.type,
                sdp: offer.sdp
            }
        });
        console.log('Offer sent to Firebase');
        alert('Offer sent to Firebase');

        // Monitor ICE gathering state
        peerConnection.onicegatheringstatechange = () => {
            console.log('Admin ICE gathering state: ', peerConnection.iceGatheringState);
            if (peerConnection.iceGatheringState === 'complete') {
                console.log('Admin ICE gathering finished');
            }
        };

        // Timeout to check if ICE gathering is stuck
        setTimeout(() => {
            if (peerConnection.iceGatheringState !== 'complete') {
                console.log('Admin ICE gathering timeout - still in state: ', peerConnection.iceGatheringState);
                alert('ICE gathering taking too long - check network or servers');
            }
        }, 10000); // 10 seconds

        streamRef.on('child_added', async (snapshot) => {
            const data = snapshot.val();
            if (data.answer && peerConnection) {
                try {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                    console.log('Answer received and set: ', data.answer);
                    alert('Answer received and set');
                } catch (err) {
                    alert('Error setting remote description: ' + err);
                    console.error('Error setting answer: ', err);
                }
            }
        });

        streamRef.child('viewerIceCandidates').on('child_added', async (snapshot) => {
            if (peerConnection) {
                const candidate = new RTCIceCandidate(snapshot.val());
                await peerConnection.addIceCandidate(candidate)
                    .then(() => console.log('Viewer ICE candidate added: ', candidate))
                    .catch(err => {
                        console.error('Error adding viewer ICE candidate: ', err);
                        alert('Error adding viewer ICE candidate: ' + err.message);
                    });
            }
        });

        peerConnection.onconnectionstatechange = () => {
            console.log('Admin connection state: ', peerConnection.connectionState);
            if (peerConnection.connectionState === 'connected') {
                console.log('Admin successfully connected to viewer');
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

    // Set ICE candidate handler *before* setting remote description
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('Viewer ICE candidate generated: ', event.candidate);
            streamRef.child('viewerIceCandidates').push(event.candidate)
                .then(() => console.log('Viewer ICE candidate sent to Firebase'))
                .catch(err => {
                    console.error('Error sending viewer ICE candidate: ', err);
                    alert('Error sending viewer ICE candidate: ' + err.message);
                });
        } else {
            console.log('Viewer ICE gathering complete');
        }
    };

    streamRef.on('value', async (snapshot) => {
        const data = snapshot.val();
        if (data && data.offer && !peerConnection.currentRemoteDescription) {
            try {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
                console.log('Viewer set remote description: ', data.offer);
                alert('Viewer set remote description');
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                console.log('Viewer answer created: ', answer);

                await streamRef.child('answer').set({
                    type: answer.type,
                    sdp: answer.sdp
                });
                console.log('Answer sent to Firebase');
                alert('Answer sent to Firebase');
            } catch (err) {
                alert('Error in viewer setup: ' + err);
                console.error('Viewer setup error:', err);
            }
        }
    });

    streamRef.child('iceCandidates').on('child_added', async (snapshot) => {
        if (peerConnection) {
            const candidate = new RTCIceCandidate(snapshot.val());
            await peerConnection.addIceCandidate(candidate)
                .then(() => console.log('Admin ICE candidate added: ', candidate))
                .catch(err => {
                    console.error('Error adding admin ICE candidate: ', err);
                    alert('Error adding admin ICE candidate: ' + err.message);
                });
        }
    });

    // Monitor ICE gathering state
    peerConnection.onicegatheringstatechange = () => {
        console.log('Viewer ICE gathering state: ', peerConnection.iceGatheringState);
        if (peerConnection.iceGatheringState === 'complete') {
            console.log('Viewer ICE gathering finished');
        }
    };

    // Timeout to check if ICE gathering is stuck
    setTimeout(() => {
        if (peerConnection.iceGatheringState !== 'complete') {
            console.log('Viewer ICE gathering timeout - still in state: ', peerConnection.iceGatheringState);
            alert('Viewer ICE gathering taking too long - check network or servers');
        }
    }, 10000); // 10 seconds

    peerConnection.onconnectionstatechange = () => {
        console.log('Viewer connection state: ', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
            console.log('Viewer successfully connected to admin');
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
        console.error('Viewer count error:', err);
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
