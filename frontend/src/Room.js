import React, { useEffect, useState, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import Navbar from './Navbar';
import { io } from 'socket.io-client';
import './App.css';

const Room = () => {
    const { roomId } = useParams();
    const location = useLocation();
    const name = new URLSearchParams(location.search).get('name');
    const navigate = useNavigate();
    const [participants, setParticipants] = useState([]);
    const [messages] = useState(['']);
    const messagesEndRef = useRef(null);
    const smallVideoRef = useRef(null);
    const screenVideoRef = useRef(null);
    const streamRef = useRef(null);
    const screenStreamRef = useRef(null);
    const microphoneAudioRef = useRef(null);
    const socketRef = useRef(null);
    const peerConnectionsRef = useRef({});
    const [isVideoEnabled, setIsVideoEnabled] = useState(true);
    const [isAudioEnabled, setIsAudioEnabled] = useState(true);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [remoteStreams, setRemoteStreams] = useState({});
    const [expandedVideoId, setExpandedVideoId] = useState(null);
    useEffect(() => {
        // Check if name exists to prevent adding message multiple times
        if (name && socketRef.current) {
            // Only add the welcome message once when the component first loads
            const welcomeMessage = `Welcome to the room, ${name}! Don't be shy, say hello!`;

            // Check if this exact message hasn't been added before
            const messagesWrapper = messagesEndRef.current;
            const existingMessages = messagesWrapper.querySelectorAll('.message__text__bot');
            const alreadyExists = Array.from(existingMessages).some(
                msg => msg.textContent === welcomeMessage
            );

            if (!existingMessages.length || !alreadyExists) {
                addBotMessage(welcomeMessage);
            }
        }
    }, [name]);

    // WebRTC configuration
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10
    };

    // Initialize peer connection for a new user

    const initializePeerConnection = (userId) => {
        if (peerConnectionsRef.current[userId]) {
            peerConnectionsRef.current[userId].close();
        }

        const peerConnection = new RTCPeerConnection(configuration);

        // Add local stream tracks to peer connection immediately if available
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => {
                console.log('Adding local track to peer connection:', track.kind);
                peerConnection.addTrack(track, streamRef.current);
            });
        }

        if (isScreenSharing && screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(track => {
                peerConnection.addTrack(track, screenStreamRef.current);
            });
        }

        // Handle ICE candidates with error handling
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                try {
                    socketRef.current.emit('ice-candidate', {
                        candidate: event.candidate,
                        to: userId,
                        from: socketRef.current.id
                    });
                } catch (error) {
                    console.error('Error sending ICE candidate:', error);
                }
            }
        };

        // Enhanced negotiation needed handling
        peerConnection.onnegotiationneeded = async () => {
            try {
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);

                socketRef.current.emit('offer', {
                    offer: peerConnection.localDescription,
                    to: userId,
                    from: socketRef.current.id
                });
            } catch (error) {
                console.error('Error during negotiation:', error);
            }
        };

        // Improved track handling with error checking
        peerConnection.ontrack = (event) => {
            console.log('Received remote track:', event.track.kind);

            if (!event.streams || !event.streams[0]) {
                console.error('No stream received with track');
                return;
            }

            const stream = event.streams[0];

            setRemoteStreams(prev => {
                const newStreams = { ...prev };

                if (!newStreams[userId]) {
                    newStreams[userId] = new MediaStream();
                }

                const existingTrack = newStreams[userId].getTracks().find(
                    t => t.kind === event.track.kind
                );

                if (existingTrack) {
                    newStreams[userId].removeTrack(existingTrack);
                }

                newStreams[userId].addTrack(event.track);
                return newStreams;
            });

            // Handle track ended
            event.track.onended = () => {
                setRemoteStreams(prev => {
                    const updated = { ...prev };
                    if (updated[userId]) {
                        const tracks = updated[userId].getTracks();
                        tracks.forEach(track => track.stop());
                        delete updated[userId];
                    }
                    return updated;
                });
            };
        };

        // Enhanced connection state monitoring
        peerConnection.onconnectionstatechange = () => {
            console.log(`Connection state changed to: ${peerConnection.connectionState}`);
            switch (peerConnection.connectionState) {
                case 'disconnected':
                case 'failed':
                case 'closed':
                    cleanupPeerConnection(userId);
                    break;
                default:
                    break;
            }
        };

        // ICE connection state monitoring
        peerConnection.oniceconnectionstatechange = () => {
            console.log(`ICE connection state: ${peerConnection.iceConnectionState}`);
            if (peerConnection.iceConnectionState === 'failed') {
                peerConnection.restartIce();
            }
        };

        peerConnectionsRef.current[userId] = peerConnection;
        return peerConnection;
    };

    const cleanupPeerConnection = (userId) => {
        if (peerConnectionsRef.current[userId]) {
            peerConnectionsRef.current[userId].close();
            delete peerConnectionsRef.current[userId];
        }

        setRemoteStreams(prev => {
            const updated = { ...prev };
            if (updated[userId]) {
                updated[userId].getTracks().forEach(track => track.stop());
                delete updated[userId];
            }
            return updated;
        });
    };

    // Socket connection effect
    useEffect(() => {
        socketRef.current = io('http://localhost:5000', {
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });
        const socket = socketRef.current;

        socket.emit('joinRoom', roomId, name);
        socket.on('updateParticipants', (updatedParticipants) => {
            setParticipants(updatedParticipants);
        });

        // Handle new user joining
        socket.on('userJoined', async (message, joinedUserId) => {
            addBotMessage(message);

            if (joinedUserId !== socket.id) {
                try {
                    const peerConnection = initializePeerConnection(joinedUserId);
                    const offer = await peerConnection.createOffer({
                        offerToReceiveAudio: true,
                        offerToReceiveVideo: true,
                        offerToReceiveScreen: true
                    });
                    await peerConnection.setLocalDescription(offer);

                    socket.emit('offer', {
                        offer,
                        to: joinedUserId,
                        from: socket.id,
                        isScreenSharing: isScreenSharing
                    });
                } catch (error) {
                    console.error('Error creating offer:', error);
                    cleanupPeerConnection(joinedUserId);
                }
            }
        });

        // Handle receiving offer
        socket.on('offer', async ({ offer, from }) => {
            try {
                const peerConnection = initializePeerConnection(from);
                await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);

                socket.emit('answer', {
                    answer,
                    to: from,
                    from: socket.id,
                    isScreenSharing: isScreenSharing,  // Send local screen sharing status
                    MediaStream// Pass along remote screen sharing status
                });
            } catch (error) {
                console.error('Error handling offer:', error);
                cleanupPeerConnection(from);
            }
        });
        // Handle receiving answer
        socket.on('answer', async ({ answer, from }) => {
            try {
                const peerConnection = peerConnectionsRef.current[from];
                if (peerConnection && peerConnection.signalingState !== 'stable') {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                }
            } catch (error) {
                console.error('Error handling answer:', error);
                cleanupPeerConnection(from);
            }
        });

        // Handle ICE candidates
        socket.on('ice-candidate', async ({ candidate, from }) => {
            try {
                const peerConnection = peerConnectionsRef.current[from];
                if (peerConnection && peerConnection.remoteDescription) {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                }
            } catch (error) {
                console.error('Error adding ICE candidate:', error);
            }
        });

        // Handle user disconnection
        socket.on('userLeft', (message, userId) => {
            addBotMessage(message);

            // Close and cleanup peer connection
            if (peerConnectionsRef.current[userId]) {
                peerConnectionsRef.current[userId].close();
                delete peerConnectionsRef.current[userId];
            }

            // Remove remote stream
            setRemoteStreams(prev => {
                const updated = { ...prev };
                delete updated[userId];
                return updated;
            });
        });

        socket.on('receiveMessage', (messageData) => {
            try {
                // Parse the message if it's a JSON string
                const parsedMessage = typeof messageData === 'string'
                    ? JSON.parse(messageData)
                    : messageData;

                // Check if it's a chat message
                if (parsedMessage.type === 'chat') {
                    addMessageToDom(parsedMessage.displayName, parsedMessage.message);
                }
            } catch (error) {
                console.error('Error parsing message:', error);
                addBotMessage('Error processing message');
            }
        });

        socket.on('requestConnection', async ({ from }) => {
            // Create peer connection and send offer
            const peerConnection = initializePeerConnection(from);
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);

            socket.emit('offer', {
                offer,
                to: from,
                from: socket.id,
                isScreenSharing
            });
        });

        // Cleanup on unmount
        return () => {
            Object.values(peerConnectionsRef.current).forEach(pc => {
                if (pc) {
                    pc.close();
                }
            });

            // Cleanup remote streams
            setRemoteStreams(prev => {
                Object.values(prev).forEach(stream => {
                    stream.getTracks().forEach(track => track.stop());
                });
                return {};
            });

            socket.disconnect();
        };
    }, [roomId, name]);

    // Media stream initialization effect
    useEffect(() => {
        let mounted = true;

        const initializeMedia = async () => {
            try {
                if (!streamRef.current) {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        video: {
                            width: { ideal: 1280 },
                            height: { ideal: 720 },
                            facingMode: 'user'
                        },
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true
                        }
                    });

                    if (mounted) {
                        streamRef.current = stream;
                        if (smallVideoRef.current) {
                            smallVideoRef.current.srcObject = stream;
                            smallVideoRef.current.srcObject = stream;
                        }

                        // Add tracks to all existing peer connections
                        Object.values(peerConnectionsRef.current).forEach(pc => {
                            stream.getTracks().forEach(track => {
                                pc.addTrack(track, stream);
                            });
                        });
                    }
                }
            } catch (error) {
                console.error('Error accessing media devices:', error);
            }
        };

        initializeMedia();

        return () => {
            mounted = false;
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    // Screen sharing effect
    useEffect(() => {
        if (smallVideoRef.current) {
            if (isScreenSharing && screenStreamRef.current) {
                smallVideoRef.current.srcObject = screenStreamRef.current;
            } else if (streamRef.current) {
                smallVideoRef.current.srcObject = streamRef.current;
            }
        }
    }, [isScreenSharing]);

    // Auto-scroll messages effect
    useEffect(() => {
        if (messagesEndRef.current) {
            const messagesWrapper = messagesEndRef.current;
            const lastMessage = messagesWrapper.lastChild;
            if (lastMessage) {
                lastMessage.scrollIntoView({ behavior: 'smooth' });
            }
        }
    }, [messages]);

    // Handle sending a message
    const sendMessage = (e) => {
        e.preventDefault();
        const messageInput = e.target.message;
        const message = messageInput.value.trim();

        if (message && socketRef.current) {
            // Prepare message in the format expected by server
            const messageData = JSON.stringify({
                type: 'chat',
                message: message,
                displayName: name
            });

            // Send message via socket
            socketRef.current.emit('sendMessage', roomId, messageData);

            // Add message to DOM
            // addMessageToDom(name, message);

            // Reset form
            messageInput.value = '';
        }
    };

    // Add a message to the DOM
    const addMessageToDom = (displayName, message) => {
        const messagesWrapper = messagesEndRef.current;

        const messageElement = document.createElement('div');
        messageElement.className = 'message__wrapper';
        messageElement.innerHTML = `
                    <div class="message__body">
                        <strong class="message__author">${displayName}</strong>
                        <p class="message__text">${message}</p>
                    </div>
                `;

        messagesWrapper.appendChild(messageElement);
    };

    // Add a bot message to the DOM
    const addBotMessage = (botMessage) => {
        const messagesWrapper = messagesEndRef.current;

        const messageElement = document.createElement('div');
        messageElement.className = 'message__wrapper';
        messageElement.innerHTML = `
                    <div class="message__body__bot">
                        <strong class="message__author__bot">🤖 Mumble Bot</strong>
                        <p class="message__text__bot">${botMessage}</p>
                    </div>
                `;

        messagesWrapper.appendChild(messageElement);
    };

    // Video and audio control methods
    const toggleVideo = () => {
        if (streamRef.current) {
            const videoTrack = streamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setIsVideoEnabled(videoTrack.enabled);
            }
        }
    };

    const toggleAudio = () => {
        if (isScreenSharing && microphoneAudioRef.current) {
            microphoneAudioRef.current.enabled = !microphoneAudioRef.current.enabled;
            setIsAudioEnabled(microphoneAudioRef.current.enabled);
        } else if (streamRef.current) {
            const audioTrack = streamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsAudioEnabled(audioTrack.enabled);
            }
        }
    };

    // Screen sharing methods
    const startScreenShare = async () => {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });

            const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const microphoneTrack = audioStream.getAudioTracks()[0];
            microphoneAudioRef.current = microphoneTrack;

            const mergedStream = new MediaStream();
            const screenVideoTrack = screenStream.getVideoTracks()[0];
            mergedStream.addTrack(screenVideoTrack);
            mergedStream.addTrack(microphoneTrack);

            screenStreamRef.current = mergedStream;
            if (screenVideoRef.current) {
                screenVideoRef.current.srcObject = mergedStream;
            }
            setIsScreenSharing(true);
            toggleAudio()
            screenVideoTrack.onended = () => stopScreenShare();

            // Notify and update all peer connections about screen share
            Object.keys(peerConnectionsRef.current).forEach(async (userId) => {
                const peerConnection = peerConnectionsRef.current[userId];
                if (peerConnection) {
                    // Add screen share tracks to existing peer connections
                    mergedStream.getTracks().forEach(track => {
                        peerConnection.addTrack(track, mergedStream);
                    });

                    // Renegotiate connection
                    const offer = await peerConnection.createOffer();
                    await peerConnection.setLocalDescription(offer);
                    socketRef.current.emit('offer', {
                        offer,
                        to: userId,
                        from: socketRef.current.id,
                        isScreenSharing: true
                    });
                }
            });

        } catch (error) {
            console.error('Error starting screen share:', error);
        }
    };

    const stopScreenShare = () => {
        if (screenStreamRef.current) {
            const tracks = screenStreamRef.current.getTracks();
            tracks.forEach((track) => track.stop());
            screenStreamRef.current = null;
        }
        setIsScreenSharing(false);
        toggleAudio();

        // Explicitly restore the original stream
        if (smallVideoRef.current) {
            smallVideoRef.current.srcObject = streamRef.current;
        }

        // Notify peers about stopping screen share
        Object.keys(peerConnectionsRef.current).forEach(async (userId) => {
            const peerConnection = peerConnectionsRef.current[userId];
            if (peerConnection) {
                // Remove screen share tracks
                peerConnection.getSenders().forEach(sender => {
                    if (sender.track && sender.track.kind === 'video') {
                        peerConnection.removeTrack(sender);
                    }
                });

                // Renegotiate connection
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);
                socketRef.current.emit('offer', {
                    offer,
                    to: userId,
                    from: socketRef.current.id,
                    isScreenSharing: false
                });
            }
        });
    };

    // Leave room method
    const handleLeave = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        navigate('/lobby');
    };

    // Render remote streams
    const renderRemoteStreams = () => {
        return Object.entries(remoteStreams).map(([userId, stream]) => {
            const isScreenShare = stream.getVideoTracks().some(track => track.label.includes('screen'));
            const isCurrentVideoExpanded = expandedVideoId === userId;
    
            return (
                <div key={userId} className={`relative ${isCurrentVideoExpanded ? "hidden" : ""}`}>
                    <video
                        autoPlay
                        playsInline
                        ref={el => {
                            if (el && el.srcObject !== stream) {
                                el.srcObject = stream;
                            }
                        }}
                        onClick={() => expandVideo(userId)} // Expand video on click
                        className="w-32 h-32 object-cover rounded-lg cursor-pointer"
                    />
                    <div className="absolute bottom-1 left-1 bg-black bg-opacity-50 text-white text-xs px-1 rounded">
                        {isScreenShare ? 'Screen Share' : `User: ${name}`}
                    </div>
                </div>
            );
        });
    };
    

    // Also update the local video expansion
    const localVideoExpanded = expandedVideoId === 'local';

    const expandVideo = (userId) => {
        setExpandedVideoId(prevId => prevId === userId ? null : userId);
    };

    const getStreamById = (userId) => {
        if (userId === 'local') {
            return smallVideoRef.current?.srcObject;
        }
        return remoteStreams[userId] || null;
    };
    

    // Update the return statement to include remote streams
    return (
        <>
            <Navbar />
            <main className="flex flex-wrap w-full mx-auto px-4 py-8 gap-4">
                {/* Participants Section */}
                <section className="flex-1 max-w-[20%] bg-white shadow-md rounded-lg p-4 min-w-[200px]">
                    <div className="flex justify-between items-center mb-4 border-b pb-4">
                        <p className="text-lg font-semibold">Participants ({participants.length})</p>
                    </div>
                    <div className="space-y-2 overflow-y-auto max-h-[60vh]">
                        {participants.map((participant, index) => (
                            <div key={index} className="flex items-center gap-2 p-2 border-b last:border-0">
                                <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
                                <p className="text-sm font-medium">{participant}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Stream Section */}
                <section className="flex-[2] max-w-[60%] max-h-[60%] bg-gray-100 shadow-md p-4 flex flex-wrap items-center min-w-[300px] border ">
                    <div className="h-80 w-full mb-10  flex items-center justify-center rounded-lg">
                        {/* Expanded Video Area */}
                        {expandedVideoId && (
                            <video
                                autoPlay
                                playsInline
                                ref={el => {
                                    if (el && el.srcObject !== getStreamById(expandedVideoId)) {
                                        el.srcObject = getStreamById(expandedVideoId); // Project the selected video
                                    }
                                }}
                                className="h-full w-auto object-contain rounded-lg"
                                muted={expandedVideoId === 'local'} // Mute local video if expanded
                            />
                        )}
                    </div>

                    <div className="flex flex-wrap justify-center gap-3 overflow-x-auto w-full mb-4">
                        {/* Local Video */}
                        <video
                            ref={smallVideoRef}
                            autoPlay
                            playsInline
                            muted
                            className={`${expandedVideoId === 'local' ? "hidden" : "w-32 h-32"} object-cover rounded-lg`}
                            onClick={() => expandVideo('local')}
                        />
                        {/* Remote Videos */}
                        {renderRemoteStreams()}
                    </div>


                    <div className="stream__actions flex gap-3">
                        <button
                            className={`p-3 rounded-full ${isVideoEnabled ? 'bg-blue-500' : 'bg-red-500'}`}
                            onClick={toggleVideo}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white">
                                <path d="M5 4h-3v-1h3v1zm10.93 0l.812 1.219c.743 1.115 1.987 1.781 3.328 1.781h1.93v13h-20v-13h3.93c1.341 0 2.585-.666 3.328-1.781l.812-1.219h5.86zm1.07-2h-8l-1.406 2.109c-.371.557-.995.891-1.664.891h-5.93v17h24v-17h-3.93c-.669 0-1.293-.334-1.664-.891l-1.406-2.109zm-11 8c0-.552-.447-1-1-1s-1 .448-1 1 .447 1 1 1 1-.448 1-1zm7 0c1.654 0 3 1.346 3 3s-1.346 3-3 3-3-1.346-3-3 1.346-3 3-3zm0-2c-2.761 0-5 2.239-5 5s2.239 5 5 5 5-2.239 5-5-2.239-5-5-5z" />
                            </svg>
                        </button>
                        <button
                            className={`p-3 rounded-full ${isAudioEnabled ? 'bg-blue-500' : 'bg-red-500'}`}
                            onClick={toggleAudio}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white">
                                <path d="M12 2c1.103 0 2 .897 2 2v7c0 1.103-.897 2-2 2s-2-.897-2-2v-7c0-1.103.897-2 2-2zm0-2c-2.209 0-4 1.791-4 4v7c0 2.209 1.791 4 4 4s4-1.791 4-4v-7c0-2.209-1.791-4-4-4zm8 9v2c0 4.418-3.582 8-8 8s-8-3.582-8-8v-2h2v2c0 3.309 2.691 6 6 6s6-2.691 6-6v-2h2zm-7 13v-2h-2v2h-4v2h10v-2h-4z" />
                            </svg>
                        </button>
                        <button className="p-3 rounded-full bg-blue-500" onClick={isScreenSharing ? stopScreenShare : startScreenShare}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white">
                                <path d="M0 1v17h24v-17h-24zm22 15h-20v-13h20v13zm-6.599 4l2.599 3h-12l2.599-3h6.802z" />
                            </svg>
                        </button>
                        <button
                            className="p-3 rounded-full bg-red-500"
                            onClick={handleLeave}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white">
                                <path d="M16 10v-5l8 7-8 7v-5h-8v-4h8zm-16-8v20h14v-2h-12v-16h12v-2h-14z" />
                            </svg>
                        </button>
                    </div>
                </section>

                {/* Messages Section */}
                <section className="messages flex-1 max-w-[20%] bg-white shadow-md rounded-lg p-4 min-w-[200px]">
                    <div className="flex justify-between items-center mb-4">
                        <p className="text-lg font-semibold">Chat</p>
                        <strong className="text-lg font-bold text-blue-600">{messages.length}</strong>
                    </div>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto" ref={messagesEndRef}>

                    </div>
                    <div className="mt-4">
                        <form
                            id="message__form"
                            onSubmit={sendMessage}
                            className="mt-4"
                        >
                            <textarea
                                name="message"
                                placeholder="Type a message..."
                                className="w-full p-2 border rounded-lg"
                            />
                            <button
                                type="submit"
                                className="mt-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                            >
                                Send
                            </button>
                        </form>
                    </div>
                </section>
            </main>
        </>
    );
};
export default Room;