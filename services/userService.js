const { supabase } = require('../config/database');
const { generateQRData } = require('../utils/qrGenerator');

class UserService {
  // Check if username is already taken
  static async isUsernameTaken(username) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id')
        .eq('username', username.toLowerCase())
        .single();
      
      if (error && error.code !== 'PGRST116') {
        // PGRST116 is "not found" error, which is what we want
        throw error;
      }
      
      return !!data; // Returns true if user exists
    } catch (error) {
      console.error('Error checking username availability:', error);
      throw new Error('Failed to check username availability');
    }
  }

  // Create user profile in users table
  static async createUserProfile(userId, email, username, name) {
    try {
      const qrCodeData = generateQRData(username);
      
      const { data, error } = await supabase
        .from('users')
        .insert([
          {
            id: userId,
            email: email.toLowerCase(),
            username: username.toLowerCase(),
            display_name: name.trim(),
            qr_code_data: qrCodeData,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ])
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error creating user profile:', error);
      throw new Error('Failed to create user profile');
    }
  }

  // Get user profile by ID
  static async getUserProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      throw new Error('Failed to fetch user profile');
    }
  }

  // Get user profile by username
  static async getUserByUsername(username) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, display_name, qr_code_data, created_at')
        .eq('username', username.toLowerCase())
        .single();

      if (error && error.code === 'PGRST116') {
        return null; // User not found
      }

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error fetching user by username:', error);
      throw new Error('Failed to fetch user');
    }
  }

  // Search users by username (for partial matching)
  static async searchUsersByUsername(searchTerm, limit = 10) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, display_name, created_at')
        .ilike('username', `%${searchTerm.toLowerCase()}%`)
        .limit(limit);

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error searching users:', error);
      throw new Error('Failed to search users');
    }
  }

  // Update user profile
  static async updateUserProfile(userId, updates) {
    try {
      const allowedUpdates = ['display_name'];
      const filteredUpdates = {};
      
      // Only allow certain fields to be updated
      Object.keys(updates).forEach(key => {
        if (allowedUpdates.includes(key)) {
          filteredUpdates[key] = updates[key];
        }
      });

      if (Object.keys(filteredUpdates).length === 0) {
        throw new Error('No valid fields to update');
      }

      filteredUpdates.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('users')
        .update(filteredUpdates)
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error updating user profile:', error);
      throw new Error('Failed to update user profile');
    }
  }
}

module.exports = UserService;