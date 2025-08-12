const jwt = require('jsonwebtoken');
const { userSessions } = require('../middleware/auth');
const FriendService = require('../services/friendService');

// Store online users and their socket connections
const onlineUsers = new Map(); // userId -> { socketId, userInfo }
const userSockets = new Map(); // socketId -> userId

// Socket authentication middleware
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { userId, sessionId } = decoded;

    // Check if session is still active
    if (!userSessions.has(userId) || !userSessions.get(userId).has(sessionId)) {
      return next(new Error('Session has been invalidated'));
    }

    // Attach user info to socket
    socket.userId = userId;
    socket.sessionId = sessionId;
    
    next();
  } catch (error) {
    console.error('Socket authentication error:', error);
    next(new Error('Authentication failed'));
  }
};

// Handle socket connection
const handleConnection = (io) => {
  return async (socket) => {
    try {
      const userId = socket.userId;
      console.log(`User ${userId} connected with socket ${socket.id}`);

      // Store user's socket connection
      onlineUsers.set(userId, {
        socketId: socket.id,
        connectedAt: new Date().toISOString()
      });
      userSockets.set(socket.id, userId);

      // Update user's online status in database
      await FriendService.updateUserOnlineStatus(userId, true);

      // Join user to their personal room
      socket.join(`user_${userId}`);

      // Notify friends that user is online
      await notifyFriendsStatusChange(io, userId, true);

      // Handle direct message
      socket.on('send_message', async (data) => {
        try {
          await handleSendMessage(io, socket, data);
        } catch (error) {
          console.error('Send message error:', error);
          socket.emit('message_error', {
            error: 'Failed to send message',
            messageUuid: data.messageUuid
          });
        }
      });

      // Handle message status updates (delivered, read)
      socket.on('update_message_status', async (data) => {
        try {
          await handleMessageStatusUpdate(io, socket, data);
        } catch (error) {
          console.error('Message status update error:', error);
        }
      });

      // Handle typing indicator
      socket.on('typing_start', async (data) => {
        try {
          await handleTypingStart(io, socket, data);
        } catch (error) {
          console.error('Typing start error:', error);
        }
      });

      socket.on('typing_stop', async (data) => {
        try {
          await handleTypingStop(io, socket, data);
        } catch (error) {
          console.error('Typing stop error:', error);
        }
      });

      // Handle friend request notifications
      socket.on('friend_request_sent', async (data) => {
        try {
          await handleFriendRequestNotification(io, socket, data);
        } catch (error) {
          console.error('Friend request notification error:', error);
        }
      });

      // Handle disconnect
      socket.on('disconnect', async () => {
        try {
          await handleDisconnect(io, socket);
        } catch (error) {
          console.error('Disconnect handling error:', error);
        }
      });

    } catch (error) {
      console.error('Connection handling error:', error);
      socket.disconnect();
    }
  };
};

// Handle sending a message
const handleSendMessage = async (io, socket, data) => {
  const { receiverId, messageUuid, message, messageType, timestamp } = data;
  const senderId = socket.userId;

  // Validate required fields
  if (!receiverId || !messageUuid || !message || !timestamp) {
    throw new Error('Missing required message fields');
  }

  // Check if users are friends
  const areFriends = await FriendService.areUsersFriends(senderId, receiverId);
  if (!areFriends) {
    throw new Error('You can only send messages to friends');
  }

  // Track message status as sent
  await FriendService.trackMessageStatus(messageUuid, senderId, receiverId, 'sent');

  // Prepare message data
  const messageData = {
    messageUuid,
    senderId,
    receiverId,
    message,
    messageType: messageType || 'text',
    timestamp,
    status: 'sent'
  };

  // Check if receiver is online
  const receiverSocketInfo = onlineUsers.get(receiverId);
  
  if (receiverSocketInfo) {
    // Receiver is online - send message immediately
    io.to(`user_${receiverId}`).emit('new_message', messageData);
    
    // Update status to delivered
    await FriendService.updateMessageStatus(messageUuid, 'delivered');
    
    // Notify sender that message was delivered
    socket.emit('message_status_update', {
      messageUuid,
      status: 'delivered',
      timestamp: new Date().toISOString()
    });
  }

  // Confirm message was sent
  socket.emit('message_sent', {
    messageUuid,
    status: 'sent',
    timestamp: new Date().toISOString()
  });
};

// Handle message status updates
const handleMessageStatusUpdate = async (io, socket, data) => {
  const { messageUuid, status } = data;
  const userId = socket.userId;

  if (!messageUuid || !status) {
    throw new Error('Missing message UUID or status');
  }

  if (!['delivered', 'read'].includes(status)) {
    throw new Error('Invalid status');
  }

  // Update message status
  const messageStatus = await FriendService.updateMessageStatus(messageUuid, status);
  
  // Notify the sender about status update
  io.to(`user_${messageStatus.sender_id}`).emit('message_status_update', {
    messageUuid,
    status,
    timestamp: messageStatus.timestamp
  });
};

// Handle typing start
const handleTypingStart = async (io, socket, data) => {
  const { receiverId } = data;
  const senderId = socket.userId;

  if (!receiverId) {
    throw new Error('Receiver ID required');
  }

  // Check if users are friends
  const areFriends = await FriendService.areUsersFriends(senderId, receiverId);
  if (!areFriends) {
    return;
  }

  // Notify receiver that sender is typing
  io.to(`user_${receiverId}`).emit('user_typing', {
    userId: senderId,
    isTyping: true
  });
};

// Handle typing stop
const handleTypingStop = async (io, socket, data) => {
  const { receiverId } = data;
  const senderId = socket.userId;

  if (!receiverId) {
    throw new Error('Receiver ID required');
  }

  // Check if users are friends
  const areFriends = await FriendService.areUsersFriends(senderId, receiverId);
  if (!areFriends) {
    return;
  }

  // Notify receiver that sender stopped typing
  io.to(`user_${receiverId}`).emit('user_typing', {
    userId: senderId,
    isTyping: false
  });
};

// Handle friend request notification
const handleFriendRequestNotification = async (io, socket, data) => {
  const { receiverId, requestId } = data;

  if (!receiverId || !requestId) {
    throw new Error('Receiver ID and request ID required');
  }

  // Notify receiver about new friend request
  io.to(`user_${receiverId}`).emit('friend_request_received', {
    requestId,
    senderId: socket.userId,
    timestamp: new Date().toISOString()
  });
};

// Notify friends about user's online status change
const notifyFriendsStatusChange = async (io, userId, isOnline) => {
  try {
    const friends = await FriendService.getUserFriends(userId);
    
    friends.forEach(friend => {
      io.to(`user_${friend.friendId}`).emit('friend_status_update', {
        friendId: userId,
        isOnline,
        timestamp: new Date().toISOString()
      });
    });
  } catch (error) {
    console.error('Error notifying friends about status change:', error);
  }
};

// Handle disconnect
const handleDisconnect = async (io, socket) => {
  const userId = socket.userId;
  
  if (userId) {
    console.log(`User ${userId} disconnected`);
    
    // Remove from online users
    onlineUsers.delete(userId);
    userSockets.delete(socket.id);
    
    // Update user's online status in database
    await FriendService.updateUserOnlineStatus(userId, false);
    
    // Notify friends that user is offline
    await notifyFriendsStatusChange(io, userId, false);
  }
};

// Get online friends for a user
const getOnlineFriends = async (userId) => {
  try {
    const friends = await FriendService.getUserFriends(userId);
    const onlineFriends = friends.filter(friend => onlineUsers.has(friend.friendId));
    
    return onlineFriends.map(friend => ({
      friendId: friend.friendId,
      username: friend.username,
      displayName: friend.displayName,
      isOnline: true
    }));
  } catch (error) {
    console.error('Error getting online friends:', error);
    return [];
  }
};

// Utility function to get user's socket
const getUserSocket = (io, userId) => {
  const userInfo = onlineUsers.get(userId);
  if (userInfo) {
    return io.sockets.sockets.get(userInfo.socketId);
  }
  return null;
};

module.exports = {
  authenticateSocket,
  handleConnection,
  getOnlineFriends,
  getUserSocket,
  onlineUsers,
  userSockets
};