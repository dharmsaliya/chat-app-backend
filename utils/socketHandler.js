// chat-app-backend/utils/socketHandler.js
const jwt = require('jsonwebtoken');
const { userSessions } = require('../middleware/auth');
const FriendService = require('../services/friendService');

/**
 * Authenticate socket connection using JWT
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
 * Handle new socket connection
 */
const handleConnection = (io) => {
  return async (socket) => {
    try {
      const userId = socket.userId;
      const room = `user_${userId}`;
      console.log(`User ${userId} connected with socket ${socket.id}`);

      // Each user joins their own room
      socket.join(room);

      // Mark user online
      FriendService.updateUserOnlineStatus(userId, true).catch(err => console.error(err));
      notifyFriendsStatusChange(io, userId, true).catch(err => console.error(err));

      // Deliver offline messages
      const offlineMessages = await FriendService.getOfflineMessages(userId);
      if (offlineMessages?.length) {
        console.log(`Delivering ${offlineMessages.length} offline messages to user ${userId}`);
        const idsToDelete = offlineMessages.map(m => m.id);

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
        });

        if (idsToDelete.length) {
          FriendService.deleteOfflineMessages(idsToDelete).catch(err => console.error(err));
        }
      }

      // Event listeners
      socket.on('send_message', (data) => handleSendMessage(io, socket, data));
      socket.on('update_message_status', (data) => handleMessageStatusUpdate(io, socket, data));
      socket.on('typing_start', (data) => handleTypingStart(io, socket, data));
      socket.on('typing_stop', (data) => handleTypingStop(io, socket, data));
      socket.on('friend_request_sent', (data) => handleFriendRequestNotification(io, socket, data));
      socket.on('disconnect', () => handleDisconnect(io, socket));

    } catch (err) {
      console.error('Connection handling error:', err);
      socket.disconnect();
    }
  };
};

/**
 * Send message handler
 */
const handleSendMessage = async (io, socket, data) => {
  const { receiverId, messageUuid, message, messageType, timestamp } = data || {};
  const senderId = socket.userId;

  try {
    if (!receiverId || !messageUuid || typeof message === 'undefined') {
      throw new Error('Missing required fields for send_message');
    }

    // 1) Friendship check
    const areFriends = await FriendService.areUsersFriends(senderId, receiverId);
    if (!areFriends) throw new Error('Message blocked: Users are not friends.');

    // 2) Create payload
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

    // 3) Emit to receiver’s room
    io.to(receiverRoom).emit('new_message', payload);

    // 4) Check if receiver is actually online
    const room = io.sockets.adapter.rooms.get(receiverRoom);
    const roomSize = room ? room.size : 0;

    if (roomSize === 0) {
      console.log(`[MSG] Receiver ${receiverId} offline. Storing message.`);
      await FriendService.storeOfflineMessage(senderId, receiverId, message, messageUuid, messageType);
    }

    // 5) Ack to sender
    socket.emit('message_sent', {
      messageUuid,
      status: 'sent',
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[MSG] Error in handleSendMessage:', err.message);
    socket.emit('message_error', { error: err.message, messageUuid });
  }
};

/**
 * Message status update handler
 */
const handleMessageStatusUpdate = async (io, socket, data) => {
  const { messageUuid, status, senderId } = data || {};
  const updatedBy = socket.userId;

  try {
    if (!messageUuid || !status || !senderId) {
      throw new Error('Missing required fields for status update');
    }

    io.to(`user_${senderId}`).emit('message_status_update', {
      messageUuid,
      status,
      updatedBy,
      timestamp: new Date().toISOString(),
    });

    // Optional: persist in DB
    try {
      await FriendService.updateMessageStatus(messageUuid, status, updatedBy);
    } catch (dbErr) {
      console.error('DB update for message status failed:', dbErr);
    }

  } catch (err) {
    console.error('Message status update error:', err);
    socket.emit('status_error', { error: err.message, messageUuid });
  }
};

/**
 * Typing indicators
 */
const handleTypingStart = async (io, socket, data) => {
  const { receiverId } = data || {};
  const senderId = socket.userId;

  try {
    if (!receiverId) throw new Error('Receiver ID required');
    const areFriends = await FriendService.areUsersFriends(senderId, receiverId);
    if (!areFriends) return;

    const receiverRoom = `user_${receiverId}`;
    const room = io.sockets.adapter.rooms.get(receiverRoom);
    if (room && room.size > 0) {
      io.to(receiverRoom).emit('user_typing', { userId: senderId, isTyping: true });
    }
  } catch (err) {
    console.error('Typing start error:', err);
  }
};

const handleTypingStop = async (io, socket, data) => {
  const { receiverId } = data || {};
  const senderId = socket.userId;

  try {
    if (!receiverId) throw new Error('Receiver ID required');
    const areFriends = await FriendService.areUsersFriends(senderId, receiverId);
    if (!areFriends) return;

    const receiverRoom = `user_${receiverId}`;
    const room = io.sockets.adapter.rooms.get(receiverRoom);
    if (room && room.size > 0) {
      io.to(receiverRoom).emit('user_typing', { userId: senderId, isTyping: false });
    }
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

    const receiverRoom = `user_${receiverId}`;
    const room = io.sockets.adapter.rooms.get(receiverRoom);

    if (room && room.size > 0) {
      io.to(receiverRoom).emit('friend_request_received', {
        requestId,
        senderId: socket.userId,
        timestamp: new Date().toISOString(),
      });
    } else {
      console.log(`[FRIEND REQUEST] Receiver ${receiverId} offline. Storing request.`);
      await FriendService.storeFriendRequestNotification(receiverId, requestId, socket.userId);
    }
  } catch (err) {
    console.error('Friend request notification error:', err);
  }
};

/**
 * Online/offline status notifications
 */
const notifyFriendsStatusChange = async (io, userId, isOnline) => {
  try {
    const friends = await FriendService.getUserFriends(userId);
    for (const friend of friends) {
      const friendRoom = `user_${friend.friendId}`;
      const room = io.sockets.adapter.rooms.get(friendRoom);
      if (room && room.size > 0) {
        io.to(friendRoom).emit('friend_status_update', {
          friendId: userId,
          isOnline,
          timestamp: new Date().toISOString(),
        });
      }
    }
  } catch (err) {
    console.error('Error notifying friends about status change:', err);
  }
};

/**
 * Disconnect handler
 */
const handleDisconnect = async (io, socket) => {
  const userId = socket.userId;
  if (userId) {
    console.log(`User ${userId} disconnected`);
    FriendService.updateUserOnlineStatus(userId, false).catch(err => console.error(err));
    notifyFriendsStatusChange(io, userId, false).catch(err => console.error(err));
  }
};

module.exports = {
  authenticateSocket,
  handleConnection,
};
