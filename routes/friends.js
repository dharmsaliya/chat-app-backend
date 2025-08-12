const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const FriendService = require('../services/friendService');

const router = express.Router();

// @route   POST /api/friends/request
// @desc    Send friend request
// @access  Private
router.post('/request', authMiddleware, async (req, res) => {
  try {
    const { receiverId, message } = req.body;
    
    if (!receiverId) {
      return res.status(400).json({
        success: false,
        message: 'Receiver ID is required'
      });
    }

    if (receiverId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot send friend request to yourself'
      });
    }

    const friendRequest = await FriendService.sendFriendRequest(
      req.user.id, 
      receiverId, 
      message?.trim() || null
    );

    res.status(201).json({
      success: true,
      message: 'Friend request sent successfully',
      request: {
        id: friendRequest.id,
        receiverId: friendRequest.receiver_id,
        receiverUsername: friendRequest.receiver.username,
        receiverDisplayName: friendRequest.receiver.display_name,
        message: friendRequest.message,
        status: friendRequest.status,
        createdAt: friendRequest.created_at
      }
    });

  } catch (error) {
    console.error('Send friend request error:', error);
    
    if (error.message === 'Users are already friends') {
      return res.status(400).json({
        success: false,
        message: 'You are already friends with this user'
      });
    }
    
    if (error.message === 'Friend request already sent') {
      return res.status(400).json({
        success: false,
        message: 'Friend request already sent to this user'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to send friend request'
    });
  }
});

// @route   POST /api/friends/accept/:requestId
// @desc    Accept friend request
// @access  Private
router.post('/accept/:requestId', authMiddleware, async (req, res) => {
  try {
    const { requestId } = req.params;
    
    if (!requestId) {
      return res.status(400).json({
        success: false,
        message: 'Request ID is required'
      });
    }

    const friendRequest = await FriendService.acceptFriendRequest(requestId, req.user.id);

    res.json({
      success: true,
      message: 'Friend request accepted successfully',
      friendship: {
        friendId: friendRequest.sender.id,
        friendUsername: friendRequest.sender.username,
        friendDisplayName: friendRequest.sender.display_name,
        acceptedAt: friendRequest.updated_at
      }
    });

  } catch (error) {
    console.error('Accept friend request error:', error);
    
    if (error.message === 'Friend request not found or already processed') {
      return res.status(404).json({
        success: false,
        message: 'Friend request not found or already processed'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to accept friend request'
    });
  }
});

// @route   POST /api/friends/reject/:requestId
// @desc    Reject friend request
// @access  Private
router.post('/reject/:requestId', authMiddleware, async (req, res) => {
  try {
    const { requestId } = req.params;
    
    if (!requestId) {
      return res.status(400).json({
        success: false,
        message: 'Request ID is required'
      });
    }

    const friendRequest = await FriendService.rejectFriendRequest(requestId, req.user.id);

    res.json({
      success: true,
      message: 'Friend request rejected successfully',
      rejectedRequest: {
        id: friendRequest.id,
        senderId: friendRequest.sender.id,
        senderUsername: friendRequest.sender.username,
        rejectedAt: friendRequest.updated_at
      }
    });

  } catch (error) {
    console.error('Reject friend request error:', error);
    
    if (error.message === 'Friend request not found or already processed') {
      return res.status(404).json({
        success: false,
        message: 'Friend request not found or already processed'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to reject friend request'
    });
  }
});

// @route   POST /api/friends/cancel/:requestId
// @desc    Cancel sent friend request
// @access  Private
router.post('/cancel/:requestId', authMiddleware, async (req, res) => {
  try {
    const { requestId } = req.params;
    
    if (!requestId) {
      return res.status(400).json({
        success: false,
        message: 'Request ID is required'
      });
    }

    const friendRequest = await FriendService.cancelFriendRequest(requestId, req.user.id);

    res.json({
      success: true,
      message: 'Friend request cancelled successfully',
      cancelledRequest: {
        id: friendRequest.id,
        receiverId: friendRequest.receiver.id,
        receiverUsername: friendRequest.receiver.username,
        cancelledAt: friendRequest.updated_at
      }
    });

  } catch (error) {
    console.error('Cancel friend request error:', error);
    
    if (error.message === 'Friend request not found or already processed') {
      return res.status(404).json({
        success: false,
        message: 'Friend request not found or already processed'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to cancel friend request'
    });
  }
});

// @route   GET /api/friends/requests/received
// @desc    Get received friend requests
// @access  Private
router.get('/requests/received', authMiddleware, async (req, res) => {
  try {
    const requests = await FriendService.getReceivedFriendRequests(req.user.id);

    res.json({
      success: true,
      requests: requests.map(request => ({
        id: request.id,
        senderId: request.sender.id,
        senderUsername: request.sender.username,
        senderDisplayName: request.sender.display_name,
        message: request.message,
        createdAt: request.created_at
      })),
      count: requests.length
    });

  } catch (error) {
    console.error('Get received friend requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch received friend requests'
    });
  }
});

// @route   GET /api/friends/requests/sent
// @desc    Get sent friend requests
// @access  Private
router.get('/requests/sent', authMiddleware, async (req, res) => {
  try {
    const requests = await FriendService.getSentFriendRequests(req.user.id);

    res.json({
      success: true,
      requests: requests.map(request => ({
        id: request.id,
        receiverId: request.receiver.id,
        receiverUsername: request.receiver.username,
        receiverDisplayName: request.receiver.display_name,
        message: request.message,
        createdAt: request.created_at
      })),
      count: requests.length
    });

  } catch (error) {
    console.error('Get sent friend requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sent friend requests'
    });
  }
});

// @route   GET /api/friends
// @desc    Get user's friends list
// @access  Private
router.get('/', authMiddleware, async (req, res) => {
  try {
    const friends = await FriendService.getUserFriends(req.user.id);

    res.json({
      success: true,
      friends: friends,
      count: friends.length
    });

  } catch (error) {
    console.error('Get friends list error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch friends list'
    });
  }
});

// @route   DELETE /api/friends/:friendId
// @desc    Remove friend
// @access  Private
router.delete('/:friendId', authMiddleware, async (req, res) => {
  try {
    const { friendId } = req.params;
    
    if (!friendId) {
      return res.status(400).json({
        success: false,
        message: 'Friend ID is required'
      });
    }

    if (friendId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot remove yourself'
      });
    }

    await FriendService.removeFriend(req.user.id, friendId);

    res.json({
      success: true,
      message: 'Friend removed successfully'
    });

  } catch (error) {
    console.error('Remove friend error:', error);
    
    if (error.message === 'Friendship not found') {
      return res.status(404).json({
        success: false,
        message: 'Friendship not found'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to remove friend'
    });
  }
});

// @route   GET /api/friends/status/:userId
// @desc    Get friendship status with another user
// @access  Private
router.get('/status/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot check friendship status with yourself'
      });
    }

    const status = await FriendService.getFriendshipStatus(req.user.id, userId);

    res.json({
      success: true,
      friendshipStatus: status
    });

  } catch (error) {
    console.error('Get friendship status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get friendship status'
    });
  }
});

// @route   POST /api/friends/message-status
// @desc    Track message status (sent/delivered/read)
// @access  Private
router.post('/message-status', authMiddleware, async (req, res) => {
  try {
    const { messageUuid, receiverId, status } = req.body;
    
    if (!messageUuid || !receiverId || !status) {
      return res.status(400).json({
        success: false,
        message: 'Message UUID, receiver ID, and status are required'
      });
    }

    const validStatuses = ['sent', 'delivered', 'read'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: sent, delivered, read'
      });
    }

    // Check if users are friends
    const areFriends = await FriendService.areUsersFriends(req.user.id, receiverId);
    if (!areFriends) {
      return res.status(403).json({
        success: false,
        message: 'You can only send messages to friends'
      });
    }

    const messageStatus = await FriendService.trackMessageStatus(
      messageUuid, 
      req.user.id, 
      receiverId, 
      status
    );

    res.json({
      success: true,
      messageStatus: {
        messageUuid: messageStatus.message_uuid,
        status: messageStatus.status,
        timestamp: messageStatus.timestamp
      }
    });

  } catch (error) {
    console.error('Track message status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track message status'
    });
  }
});

// @route   PUT /api/friends/message-status/:messageUuid
// @desc    Update message status (delivered/read)
// @access  Private
router.put('/message-status/:messageUuid', authMiddleware, async (req, res) => {
  try {
    const { messageUuid } = req.params;
    const { status } = req.body;
    
    if (!messageUuid || !status) {
      return res.status(400).json({
        success: false,
        message: 'Message UUID and status are required'
      });
    }

    const validStatuses = ['delivered', 'read'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Can only update to: delivered, read'
      });
    }

    const messageStatus = await FriendService.updateMessageStatus(messageUuid, status);

    res.json({
      success: true,
      messageStatus: {
        messageUuid: messageStatus.message_uuid,
        status: messageStatus.status,
        timestamp: messageStatus.timestamp
      }
    });

  } catch (error) {
    console.error('Update message status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update message status'
    });
  }
});

module.exports = router;