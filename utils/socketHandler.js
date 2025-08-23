// chat-app-backend/utils/socketHandler.js
const jwt = require('jsonwebtoken');
const { userSessions } = require('../middleware/auth');
const FriendService = require('../services/friendService');

/**
 * Socket authentication middleware
 * - Verifies JWT from socket.handshake.auth.token
 * - Ensures session is still active (userSessions)
 * - Attaches userId, sessionId to socket
 */
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication token required'));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { userId, sessionId } = decoded;

    if (!userSessions.has(userId) || !userSessions.get(userId).has(sessionId)) {
      return next(new Error('Session has been invalidated'));
    }

    socket.userId = userId;
    socket.sessionId = sessionId;
    next();
  } catch (err) {
    console.error('Socket authentication error:', err);
    next(new Error('Authentication failed'));
  }
};

/**
 * Helper: returns current size of a room (number of sockets currently joined)
 */
const getRoomSize = (io, roomName) => {
  const room = io.sockets.adapter.rooms.get(roomName);
  return room ? room.size : 0;
};

/**
 * Handle new socket connection
 * - Joins personal room (user_<userId>)
 * - Updates DB online status
 * - Delivers & clears offline messages
 * - Wires up all event listeners
 */
const handleConnection = (io) => {
  return async (socket) => {
    try {
      const userId = socket.userId;
      const room = `user_${userId}`;
      console.log(`User ${userId} connected with socket ${socket.id}`);

      // Join personal room immediately (core of the fix)
      socket.join(room);

      // Mark online (async fire-and-forget)
      FriendService.updateUserOnlineStatus(userId, true)
        .catch(err => console.error('Failed to update online status:', err));

      // Deliver any offline messages waiting for this user
      try {
        const offlineMessages = await FriendService.getOfflineMessages(userId);
        if (offlineMessages?.length) {
          console.log(`Delivering ${offlineMessages.length} offline messages to user ${userId}`);
          const idsToDelete = [];

          offlineMessages.forEach(m => {
            io.to(room).emit('new_message', {
              messageUuid: m.message_uuid,
              senderId: m.sender_id,
              receiverId: m.receiver_id,
              message: m.message_content,
              messageType: m.message_type || 'text',
              timestamp: m.timestamp,
              status: 'delivered',
            });
            idsToDelete.push(m.id);
          });

          // Remove them now that we've delivered
          if (idsToDelete.length) {
            FriendService.deleteOfflineMessages(idsToDelete)
              .catch(err => console.error('Failed to delete offline messages:', err));
          }
        }
      } catch (err) {
        console.error('Failed to fetch/deliver offline messages:', err);
      }

      // Notify friends this user is online
      notifyFriendsStatusChange(io, userId, true)
        .catch(err => console.error('Failed to notify friends of status change:', err));

      // Event: send message
      socket.on('send_message', (data) => handleSendMessage(io, socket, data));

      // Event: message status updates (delivered/read)
      socket.on('update_message_status', (data) => handleMessageStatusUpdate(io, socket, data));

      // Typing indicators
      socket.on('typing_start', (data) => handleTypingStart(io, socket, data));
      socket.on('typing_stop',  (data) => handleTypingStop(io, socket, data));

      // Friend request notifications
      socket.on('friend_request_sent', (data) => handleFriendRequestNotification(io, socket, data));

      // Disconnect
      socket.on('disconnect', () => handleDisconnect(io, socket));

    } catch (err) {
      console.error('Connection handling error:', err);
      socket.disconnect();
    }
  };
};

/**
 * Send message handler
 * - Validates friendship
 * - Emits directly to receiver's room
 * - Stores as "offline" ONLY if receiver currently has no sockets in their room
 * - Confirms to sender
 */
const handleSendMessage = async (io, socket, data) => {
  const { receiverId, messageUuid, message, messageType, timestamp } = data || {};
  const senderId = socket.userId;

  console.log(`[MSG] Received 'send_message' from ${senderId} to ${receiverId}.`);

  try {
    if (!receiverId || !messageUuid || typeof message === 'undefined') {
      throw new Error('Missing required fields (receiverId, messageUuid, message)');
    }

    // 1) Friendship check
    const areFriends = await FriendService.areUsersFriends(senderId, receiverId);
    if (!areFriends) throw new Error('Message blocked: Users are not friends.');
    console.log(`[MSG] Friendship validated for ${senderId} → ${receiverId}.`);

    // 2) Core fix: emit to receiver's personal room (no dependence on in-memory maps)
    const receiverRoom = `user_${receiverId}`;
    const payload = {
      messageUuid,
      senderId,
      receiverId,
      message,
      messageType: messageType || 'text',
      timestamp,
      status: 'delivered',
    };
    io.to(receiverRoom).emit('new_message', payload);
    console.log(`[MSG] Emitted to room ${receiverRoom}.`);

    // 3) Offline fallback: if no socket currently in the room, store offline
    const roomSize = getRoomSize(io, receiverRoom);
    if (roomSize === 0) {
      console.log(`[MSG] Room ${receiverRoom} empty. Storing offline message.`);
      await FriendService.storeOfflineMessage(senderId, receiverId, message, messageUuid, messageType);
    }

    // 4) Ack back to sender
    socket.emit('message_sent', {
      messageUuid,
      status: 'sent',
      timestamp: new Date().toISOString(),
    });
    console.log(`[MSG] Sent 'message_sent' to ${senderId}.`);

  } catch (err) {
    console.error('[MSG] Error in handleSendMessage:', err.message);
    socket.emit('message_error', { error: err.message, messageUuid });
  }
};

/**
 * Message status update handler (delivered/read)
 * - Forwards to original sender's room
 */
const handleMessageStatusUpdate = async (io, socket, data) => {
  const { messageUuid, status, senderId } = data;
  const updatedBy = socket.userId;

  // --- [STEP 2: SERVER RECEIVES] ---
  console.log(`[STATUS] Received 'update_message_status' from user ${updatedBy}`);
  console.log(`[STATUS] Details: message ${messageUuid} is now '${status}'. Original sender: ${senderId}`);
  // ---------------------------------

  try {
    if (!messageUuid || !status || !senderId) {
      throw new Error('Missing required fields for status update');
    }

    // --- [STEP 3: SERVER RELAYS] ---
    const targetRoom = `user_${senderId}`;
    console.log(`[STATUS] Relaying update to room: ${targetRoom}`);
    // -------------------------------
    
    io.to(targetRoom).emit('message_status_update', {
      messageUuid,
      status,
      updatedBy,
    });

  } catch (error) {
    console.error('[STATUS] Error in handleMessageStatusUpdate:', error.message);
  }
};

/**
 * Typing start
 */
const handleTypingStart = async (io, socket, data) => {
  const { receiverId } = data || {};
  const senderId = socket.userId;

  try {
    if (!receiverId) throw new Error('Receiver ID required');
    const areFriends = await FriendService.areUsersFriends(senderId, receiverId);
    if (!areFriends) return;

    io.to(`user_${receiverId}`).emit('user_typing', { userId: senderId, isTyping: true });
  } catch (err) {
    console.error('Typing start error:', err);
  }
};

/**
 * Typing stop
 */
const handleTypingStop = async (io, socket, data) => {
  const { receiverId } = data || {};
  const senderId = socket.userId;

  try {
    if (!receiverId) throw new Error('Receiver ID required');
    const areFriends = await FriendService.areUsersFriends(senderId, receiverId);
    if (!areFriends) return;

    io.to(`user_${receiverId}`).emit('user_typing', { userId: senderId, isTyping: false });
  } catch (err) {
    console.error('Typing stop error:', err);
  }
};

/**
 * Friend request notification
 */
const handleFriendRequestNotification = async (io, socket, data) => {
  const { receiverId, requestId } = data || {};
  try {
    if (!receiverId || !requestId) throw new Error('Receiver ID and request ID required');

    io.to(`user_${receiverId}`).emit('friend_request_received', {
      requestId,
      senderId: socket.userId,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Friend request notification error:', err);
  }
};

/**
 * Notify friends of a user's online/offline status change
 */
const notifyFriendsStatusChange = async (io, userId, isOnline) => {
  try {
    const friends = await FriendService.getUserFriends(userId);
    friends.forEach(friend => {
      io.to(`user_${friend.friendId}`).emit('friend_status_update', {
        friendId: userId,
        isOnline,
        timestamp: new Date().toISOString(),
      });
    });
  } catch (err) {
    console.error('Error notifying friends about status change:', err);
  }
};

/**
 * Disconnect handler
 * - Marks offline in DB
 * - Notifies friends
 * (No in-memory maps to clean anymore)
 */
const handleDisconnect = async (io, socket) => {
  const userId = socket.userId;
  if (!userId) return;

  try {
    console.log(`User ${userId} disconnected`);

    // Mark offline (async)
    FriendService.updateUserOnlineStatus(userId, false)
      .catch(err => console.error('Failed to update online status:', err));

    // Notify friends
    notifyFriendsStatusChange(io, userId, false)
      .catch(err => console.error('Failed to notify friends of status change:', err));
  } catch (err) {
    console.error('Disconnect handling error:', err);
  }
};

module.exports = {
  authenticateSocket,
  handleConnection,
};
