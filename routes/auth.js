const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

// Per-user session management (ADDED)
const userSessions = new Map(); // userId -> Set of session identifiers

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Generate unique session ID (ADDED)
const generateSessionId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

// Helper function to generate JWT token (MODIFIED)
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

// Helper function to validate email
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// @route   POST /api/auth/signup
// @desc    Register new user
// @access  Public
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Validation
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email, password, and name'
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Sign up with Supabase
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name
        }
      }
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    // Check if user exists (ADDED)
    if (!data?.user) {
      return res.status(400).json({
        success: false,
        message: 'User signup incomplete, email confirmation may be required'
      });
    }

    // Generate JWT token
    const token = generateToken(data.user.id, data.user.email);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata.name,
        emailConfirmed: data.user.email_confirmed_at ? true : false
      }
    });

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
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    // Generate JWT token
    const token = generateToken(data.user.id, data.user.email);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata.name,
        emailConfirmed: data.user.email_confirmed_at ? true : false
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout current session only (MODIFIED)
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
// @desc    Verify JWT token and get user info (MODIFIED)
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

    // Check if this session is still active (ADDED)
    if (!userSessions.has(userId) || !userSessions.get(userId).has(sessionId)) {
      return res.status(401).json({
        success: false,
        message: 'Session has been invalidated. Please login again.'
      });
    }

    // If you want to fetch additional user data from Supabase (optional)
    // You would use the userId from the decoded token, not pass the JWT to Supabase
    const { data: user, error } = await supabase
      .from('auth.users') // or your custom users table
      .select('*')
      .eq('id', decoded.userId)
      .single();

    // For basic verification, you can just return the JWT claims
    res.json({
      success: true,
      user: {
        id: decoded.userId,
        email: decoded.email,
        // If you fetched from Supabase and want to include more data:
        // name: user?.user_metadata?.name || 'Unknown',
        // emailConfirmed: user?.email_confirmed_at ? true : false
      }
    });

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
