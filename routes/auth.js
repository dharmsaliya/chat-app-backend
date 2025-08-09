const express = require('express');
const jwt = require('jsonwebtoken');
const { supabase } = require('../config/database');
const { userSessions } = require('../middleware/auth');
const UserService = require('../services/userService');
const {
  isValidEmail,
  isValidUsername,
  isReservedUsername,
  isValidPassword,
  isValidName
} = require('../utils/validators');

const router = express.Router();

// Generate unique session ID
const generateSessionId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

// Helper function to generate JWT token
const generateToken = (userId, email) => {
  const sessionId = generateSessionId();
  const iat = Math.floor(Date.now() / 1000);
  
  // Track this session for the user
  if (!userSessions.has(userId)) {
    userSessions.set(userId, new Set());
  }
  userSessions.get(userId).add(sessionId);
  
  return jwt.sign(
    { userId, email, sessionId, iat },
    process.env.JWT_SECRET
  );
};

// @route   POST /api/auth/signup
// @desc    Register new user with username and QR
// @access  Public
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name, username } = req.body;
    console.log("Signup attempted...")

    // Validation
    if (!email || !password || !name || !username) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email, password, name, and username'
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    if (!isValidName(name)) {
      return res.status(400).json({
        success: false,
        message: 'Name must be between 1 and 50 characters'
      });
    }

    if (!isValidUsername(username)) {
      return res.status(400).json({
        success: false,
        message: 'Username must be 3-20 characters long and contain only letters, numbers, and underscores'
      });
    }

    if (isReservedUsername(username)) {
      return res.status(400).json({
        success: false,
        message: 'This username is reserved. Please choose another one.'
      });
    }

    // Check if username is already taken
    const isUsernameTaken = await UserService.isUsernameTaken(username);
    if (isUsernameTaken) {
      return res.status(400).json({
        success: false,
        message: 'Username is already taken'
      });
    }

    // Sign up with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name.trim()
        }
      }
    });

    if (authError) {
      return res.status(400).json({
        success: false,
        message: authError.message
      });
    }

    if (!authData?.user) {
      return res.status(400).json({
        success: false,
        message: 'User signup incomplete, email confirmation may be required'
      });
    }

    // Create user profile in our users table with QR data
    try {
      const userProfile = await UserService.createUserProfile(
        authData.user.id,
        email,
        username,
        name
      );

      // Generate JWT token
      const token = generateToken(authData.user.id, authData.user.email);

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        token,
        user: {
          id: userProfile.id,
          email: userProfile.email,
          username: userProfile.username,
          displayName: userProfile.display_name,
          qrCodeData: userProfile.qr_code_data,
          emailConfirmed: authData.user.email_confirmed_at ? true : false
        }
      });

    } catch (profileError) {
      // If profile creation fails, we should clean up the auth user
      // In a production app, you might want to implement this cleanup
      console.error('Profile creation failed:', profileError);
      
      return res.status(500).json({
        success: false,
        message: 'Failed to create user profile'
      });
    }

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log("Login attempted...")

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    // Sign in with Supabase
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      return res.status(400).json({
        success: false,
        message: authError.message
      });
    }

    // Get user profile from our users table
    try {
      const userProfile = await UserService.getUserProfile(authData.user.id);
      
      // Generate JWT token
      const token = generateToken(authData.user.id, authData.user.email);

      res.json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: userProfile.id,
          email: userProfile.email,
          username: userProfile.username,
          displayName: userProfile.display_name,
          qrCodeData: userProfile.qr_code_data,
          emailConfirmed: authData.user.email_confirmed_at ? true : false
        }
      });

    } catch (profileError) {
      // User exists in auth but not in our users table
      // This might happen for users created before the update
      console.error('User profile not found:', profileError);
      
      // Generate JWT token with limited data
      const token = generateToken(authData.user.id, authData.user.email);

      res.json({
        success: true,
        message: 'Login successful (profile migration needed)',
        token,
        user: {
          id: authData.user.id,
          email: authData.user.email,
          username: null,
          displayName: authData.user.user_metadata?.name || null,
          qrCodeData: null,
          emailConfirmed: authData.user.email_confirmed_at ? true : false,
          needsProfileSetup: true
        }
      });
    }

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout current session only
// @access  Private
router.post('/logout', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { userId, sessionId } = decoded;

    // Remove this specific session
    if (userSessions.has(userId)) {
      userSessions.get(userId).delete(sessionId);
      
      // Clean up empty user session set
      if (userSessions.get(userId).size === 0) {
        userSessions.delete(userId);
      }
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during logout'
    });
  }
});

// @route   GET /api/auth/verify
// @desc    Verify JWT token and get user info
// @access  Private
router.get('/verify', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    // Verify JWT token with your secret
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { userId, sessionId } = decoded;

    // Check if this session is still active
    if (!userSessions.has(userId) || !userSessions.get(userId).has(sessionId)) {
      return res.status(401).json({
        success: false,
        message: 'Session has been invalidated. Please login again.'
      });
    }

    // Get user profile
    try {
      const userProfile = await UserService.getUserProfile(userId);
      
      res.json({
        success: true,
        user: {
          id: userProfile.id,
          email: userProfile.email,
          username: userProfile.username,
          displayName: userProfile.display_name,
          qrCodeData: userProfile.qr_code_data
        }
      });
    } catch (error) {
      // User might not have a profile in users table
      res.json({
        success: true,
        user: {
          id: decoded.userId,
          email: decoded.email,
          username: null,
          displayName: null,
          qrCodeData: null,
          needsProfileSetup: true
        }
      });
    }

  } catch (error) {
    console.error('Token verification error:', error);
    
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
      message: 'Token verification failed'
    });
  }
});

module.exports = router;