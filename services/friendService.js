const { supabase } = require('../config/database');

class FriendService {
  // Send friend request
  static async sendFriendRequest(senderId, receiverId, message = null) {
    try {
      // Check if users are already friends
      const areAlreadyFriends = await this.areUsersFriends(senderId, receiverId);
      if (areAlreadyFriends) {
        throw new Error('Users are already friends');
      }

      // Check if there's already a pending request
      const existingRequest = await this.getExistingFriendRequest(senderId, receiverId);
      if (existingRequest) {
        if (existingRequest.status === 'pending') {
          throw new Error('Friend request already sent');
        } else if (existingRequest.status === 'rejected') {
          // Update the rejected request to pending
          const { data, error } = await supabase
            .from('friend_requests')
            .update({
              status: 'pending',
              message: message,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingRequest.id)
            .select()
            .single();

          if (error) throw error;
          return data;
        }
      }

      // Create new friend request
      const { data, error } = await supabase
        .from('friend_requests')
        .insert([{
          sender_id: senderId,
          receiver_id: receiverId,
          message: message,
          status: 'pending'
        }])
        .select(`
          *,
          sender:sender_id(id, username, display_name),
          receiver:receiver_id(id, username, display_name)
        `)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error sending friend request:', error);
      throw error;
    }
  }

  // Get existing friend request between two users
  static async getExistingFriendRequest(userId1, userId2) {
    try {
      const { data, error } = await supabase
        .from('friend_requests')
        .select('*')
        .or(`and(sender_id.eq.${userId1},receiver_id.eq.${userId2}),and(sender_id.eq.${userId2},receiver_id.eq.${userId1})`)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error checking existing friend request:', error);
      return null;
    }
  }

  // Accept friend request
  static async acceptFriendRequest(requestId, userId) {
    try {
      const { data, error } = await supabase
        .from('friend_requests')
        .update({ status: 'accepted' })
        .eq('id', requestId)
        .eq('receiver_id', userId) // Only receiver can accept
        .eq('status', 'pending') // Only pending requests can be accepted
        .select(`
          *,
          sender:sender_id(id, username, display_name),
          receiver:receiver_id(id, username, display_name)
        `)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Friend request not found or already processed');

      return data;
    } catch (error) {
      console.error('Error accepting friend request:', error);
      throw error;
    }
  }

  // Reject friend request
  static async rejectFriendRequest(requestId, userId) {
    try {
      const { data, error } = await supabase
        .from('friend_requests')
        .update({ status: 'rejected' })
        .eq('id', requestId)
        .eq('receiver_id', userId) // Only receiver can reject
        .eq('status', 'pending') // Only pending requests can be rejected
        .select(`
          *,
          sender:sender_id(id, username, display_name)
        `)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Friend request not found or already processed');

      return data;
    } catch (error) {
      console.error('Error rejecting friend request:', error);
      throw error;
    }
  }

  // Cancel friend request (by sender)
  static async cancelFriendRequest(requestId, userId) {
    try {
      const { data, error } = await supabase
        .from('friend_requests')
        .update({ status: 'cancelled' })
        .eq('id', requestId)
        .eq('sender_id', userId) // Only sender can cancel
        .eq('status', 'pending') // Only pending requests can be cancelled
        .select(`
          *,
          receiver:receiver_id(id, username, display_name)
        `)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Friend request not found or already processed');

      return data;
    } catch (error) {
      console.error('Error cancelling friend request:', error);
      throw error;
    }
  }

  // Get pending friend requests received by user
  static async getReceivedFriendRequests(userId) {
    try {
      const { data, error } = await supabase
        .from('friend_requests')
        .select(`
          *,
          sender:sender_id(id, username, display_name, created_at)
        `)
        .eq('receiver_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching received friend requests:', error);
      throw error;
    }
  }

  // Get pending friend requests sent by user
  static async getSentFriendRequests(userId) {
    try {
      const { data, error } = await supabase
        .from('friend_requests')
        .select(`
          *,
          receiver:receiver_id(id, username, display_name, created_at)
        `)
        .eq('sender_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching sent friend requests:', error);
      throw error;
    }
  }

  // Check if two users are friends
  // static async areUsersFriends(userId1, userId2) {
  //   try {
  //     const { data, error } = await supabase
  //       .from('friendships')
  //       .select('id')
  //       .eq('user1_id', Math.min(userId1, userId2))
  //       .eq('user2_id', Math.max(userId1, userId2))
  //       .single();

  //     if (error && error.code !== 'PGRST116') {
  //       throw error;
  //     }

  //     return !!data;
  //   } catch (error) {
  //     console.error('Error checking friendship:', error);
  //     return false;
  //   }
  // }

  /** 
* Checks if two users are friends. 
* This corrected version avoids the UUID vs. String type issue by using a proper .or() 
query 
* instead of relying on Math.min/max. 
*/
  /**
 * Checks if two users are friends.
 * This is the definitive fix that respects the database's CHECK constraint
 * by searching for the friendship in both possible directions within a single query.
 */
  static async areUsersFriends(userId1, userId2) {
    try {
      const { data, error } = await supabase
        .from('friendships')
        .select('id')
        .or(and(`user1_id.eq.${ userId1 }, user2_id.eq.${ userId2 }), and(user1_id.eq.${ userId2 }, user2_id.eq.${ userId1 }`))
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 means "not found"
        throw error;
      }

      // If data is not null, a friendship was found.
      return !!data;
    } catch (error) {
      console.error('Error checking friendship:', error);
      return false;
    }
  }


  // Get user's friends list
  static async getUserFriends(userId) {
    try {
      const { data, error } = await supabase
        .from('friendships')
        .select(`
          *,
          user1:user1_id(id, username, display_name, is_online, last_seen),
          user2:user2_id(id, username, display_name, is_online, last_seen)
        `)
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Transform data to return friend info
      const friends = (data || []).map(friendship => {
        const friend = friendship.user1_id === userId ? friendship.user2 : friendship.user1;
        return {
          friendshipId: friendship.id,
          friendId: friend.id,
          username: friend.username,
          displayName: friend.display_name,
          isOnline: friend.is_online,
          lastSeen: friend.last_seen,
          friendsSince: friendship.created_at
        };
      });

      return friends;
    } catch (error) {
      console.error('Error fetching user friends:', error);
      throw error;
    }
  }

  // Remove friend (delete friendship)
  static async removeFriend(userId, friendId) {
    try {
      const { data, error } = await supabase
        .from('friendships')
        .delete()
        .eq('user1_id', Math.min(userId, friendId))
        .eq('user2_id', Math.max(userId, friendId))
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new Error('Friendship not found');

      return data;
    } catch (error) {
      console.error('Error removing friend:', error);
      throw error;
    }
  }

  // Update user online status
  static async updateUserOnlineStatus(userId, isOnline) {
    try {
      const updates = {
        is_online: isOnline,
        updated_at: new Date().toISOString()
      };

      if (!isOnline) {
        updates.last_seen = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating online status:', error);
      throw error;
    }
  }

  // Get friendship status between two users
  static async getFriendshipStatus(userId1, userId2) {
    try {
      // Check if they're friends
      const areFriends = await this.areUsersFriends(userId1, userId2);
      if (areFriends) {
        return { status: 'friends' };
      }

      // Check for existing friend request
      const existingRequest = await this.getExistingFriendRequest(userId1, userId2);
      if (existingRequest) {
        return {
          status: existingRequest.status,
          requestId: existingRequest.id,
          senderId: existingRequest.sender_id,
          receiverId: existingRequest.receiver_id,
          message: existingRequest.message,
          createdAt: existingRequest.created_at
        };
      }

      return { status: 'none' };
    } catch (error) {
      console.error('Error getting friendship status:', error);
      throw error;
    }
  }

  // Track message status
  static async trackMessageStatus(messageUuid, senderId, receiverId, status = 'sent') {
    try {
      const { data, error } = await supabase
        .from('message_status')
        .upsert([{
          message_uuid: messageUuid,
          sender_id: senderId,
          receiver_id: receiverId,
          status: status,
          timestamp: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error tracking message status:', error);
      throw error;
    }
  }

  // Update message status
  static async updateMessageStatus(messageUuid, status) {
    try {
      const { data, error } = await supabase
        .from('message_status')
        .update({
          status: status,
          timestamp: new Date().toISOString()
        })
        .eq('message_uuid', messageUuid)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating message status:', error);
      throw error;
    }
  }
}

module.exports = FriendService;