const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

// Enhanced data structures for better state management
const rooms = {}; // { roomId: { participants: Set(names), connections: Set(socketIds) } }
const userSockets = {}; // { socketId: { roomId, name, connections: Set(connectedSocketIds) } }

io.on('connection', (socket) => {
    console.log('New connection:', socket.id);

    socket.on('joinRoom', (roomId, name) => {
        console.log(`${name} (${socket.id}) joining room ${roomId}`);
        
        socket.join(roomId);

        // Initialize room if it doesn't exist
        if (!rooms[roomId]) {
            rooms[roomId] = {
                participants: new Set(),
                connections: new Set()
            };
        }
        
        rooms[roomId].participants.add(name);
        rooms[roomId].connections.add(socket.id);

        // Initialize user socket data
        userSockets[socket.id] = {
            roomId,
            name,
            connections: new Set()
        };

        // Notify existing participants to initiate connections
        socket.to(roomId).emit('userJoined', `${name} joined the room`, socket.id);

        // Send current participants list
        io.to(roomId).emit('updateParticipants', Array.from(rooms[roomId].participants));

        // If there are other participants, request connections
        const otherParticipants = Array.from(rooms[roomId].connections)
            .filter(id => id !== socket.id);
            
        if (otherParticipants.length > 0) {
            console.log(`Requesting connections for ${socket.id} with:`, otherParticipants);
            otherParticipants.forEach(participantId => {
                socket.to(participantId).emit('requestConnection', {
                    from: socket.id
                });
            });
        }
    });

    // Enhanced WebRTC signaling with logging and error handling
    socket.on('offer', ({ offer, to, from }) => {
        console.log(`Offer from ${from} to ${to}`);
        if (userSockets[to]) {
            socket.to(to).emit('offer', { offer, from });
            
            // Track connection attempt
            userSockets[from].connections.add(to);
            userSockets[to].connections.add(from);
        } else {
            console.warn(`Attempted to send offer to non-existent user: ${to}`);
        }
    });

    socket.on('answer', ({ answer, to, from }) => {
        console.log(`Answer from ${from} to ${to}`);
        if (userSockets[to]) {
            socket.to(to).emit('answer', { answer, from });
        } else {
            console.warn(`Attempted to send answer to non-existent user: ${to}`);
        }
    });

    socket.on('ice-candidate', ({ candidate, to, from }) => {
        console.log(`ICE candidate from ${from} to ${to}`);
        if (userSockets[to]) {
            socket.to(to).emit('ice-candidate', { candidate, from });
        } else {
            console.warn(`Attempted to send ICE candidate to non-existent user: ${to}`);
        }
    });

    socket.on('sendMessage', (roomId, message) => {
        console.log(`Message in room ${roomId}:`, message);
        io.to(roomId).emit('receiveMessage', message);
    });

    // Enhanced disconnect handling
    socket.on('disconnect', () => {
        const user = userSockets[socket.id];
        if (user) {
            console.log(`${user.name} (${socket.id}) disconnecting from room ${user.roomId}`);
            
            const room = rooms[user.roomId];
            if (room) {
                // Remove from room participants
                room.participants.delete(user.name);
                room.connections.delete(socket.id);

                // Notify other participants
                socket.to(user.roomId).emit('userLeft', `${user.name} left the room`, socket.id);
                
                // Update participants list
                if (room.participants.size > 0) {
                    io.to(user.roomId).emit('updateParticipants', Array.from(room.participants));
                } else {
                    delete rooms[user.roomId];
                }

                // Clean up connections
                user.connections.forEach(connectedSocketId => {
                    if (userSockets[connectedSocketId]) {
                        userSockets[connectedSocketId].connections.delete(socket.id);
                    }
                });
            }

            delete userSockets[socket.id];
        }
    });

    socket.on('requestConnection', (data) => {
        console.log(`Connection requested from ${data.from} to ${data.to}`);
        if (userSockets[data.to]) {
            socket.to(data.to).emit('requestConnection', {
                from: data.from
            });
        }
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});