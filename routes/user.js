const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const UserService = require('../services/userService');
const { parseQRData } = require('../utils/qrGenerator');
const { isValidName } = require('../utils/validators');

const router = express.Router();

// @route   GET /api/users/profile
// @desc    Get current user's profile
// @access  Private
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const userProfile = await UserService.getUserProfile(req.user.id);
    
    res.json({
      success: true,
      user: {
        id: userProfile.id,
        email: userProfile.email,
        username: userProfile.username,
        displayName: userProfile.display_name,
        qrCodeData: userProfile.qr_code_data,
        createdAt: userProfile.created_at,
        updatedAt: userProfile.updated_at
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user profile'
    });
  }
});

// @route   GET /api/users/username/:username
// @desc    Get user by username (for search or QR scan)
// @access  Private
router.get('/username/:username', authMiddleware, async (req, res) => {
  try {
    const { username } = req.params;
    
    if (!username || username.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Username is required'
      });
    }

    const user = await UserService.getUserByUsername(username.trim());
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Don't return sensitive information
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        qrCodeData: user.qr_code_data,
        createdAt: user.created_at
      }
    });

  } catch (error) {
    console.error('Get user by username error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user'
    });
  }
});

// @route   GET /api/users/search
// @desc    Search users by username
// @access  Private
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const { q: searchTerm, limit } = req.query;
    
    if (!searchTerm || searchTerm.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Search term is required'
      });
    }

    if (searchTerm.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search term must be at least 2 characters long'
      });
    }

    const searchLimit = Math.min(parseInt(limit) || 10, 20); // Max 20 results
    const users = await UserService.searchUsersByUsername(searchTerm.trim(), searchLimit);
    
    // Filter out current user from results
    const filteredUsers = users.filter(user => user.id !== req.user.id);

    res.json({
      success: true,
      users: filteredUsers.map(user => ({
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        createdAt: user.created_at
      })),
      count: filteredUsers.length
    });

  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search users'
    });
  }
});

// @route   POST /api/users/scan-qr
// @desc    Scan QR code and get user info
// @access  Private
router.post('/scan-qr', authMiddleware, async (req, res) => {
  try {
    const { qrData } = req.body;
    
    if (!qrData) {
      return res.status(400).json({
        success: false,
        message: 'QR code data is required'
      });
    }

    // Parse username from QR data
    const username = parseQRData(qrData);
    if (!username) {
      return res.status(400).json({
        success: false,
        message: 'Invalid QR code format'
      });
    }

    // Get user by username
    const user = await UserService.getUserByUsername(username);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if trying to scan own QR code
    if (user.id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot scan your own QR code'
      });
    }

    res.json({
      success: true,
      message: 'QR code scanned successfully',
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        qrCodeData: user.qr_code_data,
        createdAt: user.created_at
      }
    });

  } catch (error) {
    console.error('QR scan error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process QR code'
    });
  }
});

// @route   PUT /api/users/profile
// @desc    Update user profile (display name only for now)
// @access  Private
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { displayName } = req.body;
    
    if (!displayName) {
      return res.status(400).json({
        success: false,
        message: 'Display name is required'
      });
    }

    if (!isValidName(displayName)) {
      return res.status(400).json({
        success: false,
        message: 'Display name must be between 1 and 50 characters'
      });
    }

    const updatedProfile = await UserService.updateUserProfile(req.user.id, {
      display_name: displayName.trim()
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: updatedProfile.id,
        email: updatedProfile.email,
        username: updatedProfile.username,
        displayName: updatedProfile.display_name,
        qrCodeData: updatedProfile.qr_code_data,
        updatedAt: updatedProfile.updated_at
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
});

// @route   GET /api/users/check-username/:username
// @desc    Check if username is available (for real-time validation)
// @access  Public (but rate limited)
router.get('/check-username/:username', async (req, res) => {
  try {
    const { username } = req.params;
    
    if (!username || username.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Username is required'
      });
    }

    const { isValidUsername, isReservedUsername } = require('../utils/validators');

    if (!isValidUsername(username)) {
      return res.json({
        success: true,
        available: false,
        message: 'Username must be 3-20 characters long and contain only letters, numbers, and underscores'
      });
    }

    if (isReservedUsername(username)) {
      return res.json({
        success: true,
        available: false,
        message: 'This username is reserved'
      });
    }

    const isUsernameTaken = await UserService.isUsernameTaken(username);
    
    res.json({
      success: true,
      available: !isUsernameTaken,
      message: isUsernameTaken ? 'Username is already taken' : 'Username is available'
    });

  } catch (error) {
    console.error('Check username error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check username availability'
    });
  }
});

// @route   GET /api/users/profile/:userId
// @desc    Get a user's profile by ID
// @access  Private
router.get('/profile/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    // In a production app, you might add a check here to ensure
    // the requester and the requested user are friends.

    const userProfile = await UserService.getUserProfile(userId);
    
    if (!userProfile) {
        return res.status(404).json({ success: false, message: 'User profile not found' });
    }

    // Note: The service layer returns the full profile, which is what we need.
    res.json({
      success: true,
      user: userProfile
    });

  } catch (error) {
    console.error('Get profile by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user profile'
    });
  }
});

module.exports = router;