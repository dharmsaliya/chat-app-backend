const jwt = require('jsonwebtoken');
const { supabase } = require('../config/database');
const UserService = require('../services/userService');

// Per-user session management
const userSessions = new Map(); // userId -> Set of session identifiers

const authMiddleware = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { userId, email, sessionId } = decoded;

    // Check if this session is still active
    if (!userSessions.has(userId) || !userSessions.get(userId).has(sessionId)) {
      return res.status(401).json({
        success: false,
        message: 'Session has been invalidated. Please login again.'
      });
    }

    // Get user profile from our users table
    try {
      const userProfile = await UserService.getUserProfile(userId);
      
      // Add user info to request object
      req.user = {
        id: userProfile.id,
        email: userProfile.email,
        username: userProfile.username,
        displayName: userProfile.display_name,
        qrCodeData: userProfile.qr_code_data
      };
    } catch (error) {
      // If user profile doesn't exist in our users table, 
      // they might be using an old token from before the update
      req.user = {
        id: userId,
        email: email,
        username: null,
        displayName: null,
        qrCodeData: null
      };
    }

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    // Handle specific JWT errors
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired'
      });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

// Export session management functions for use in auth routes
module.exports = {
  authMiddleware,
  userSessions
};