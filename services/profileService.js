const { supabase } = require('../config/database');

class ProfileService {
  // --- Profile ---
  static async getProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (error && error.code !== 'PGRST116') throw error; // Ignore "not found" error
      return data;
    } catch (error) {
      console.error('Error getting user profile:', error);
      throw error;
    }
  }

  static async upsertProfile(userId, profileData) {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .upsert({ id: userId, ...profileData }, { onConflict: 'id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error upserting user profile:', error);
      throw error;
    }
  }

  // --- Education ---
  static async getEducation(userId) {
    try {
      const { data, error } = await supabase
        .from('education')
        .select('*')
        .eq('user_id', userId);
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting education:', error);
      throw error;
    }
  }

  static async addEducation(userId, educationData) {
    try {
      const { data, error } = await supabase
        .from('education')
        .insert({ user_id: userId, ...educationData })
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error adding education:', error);
      throw error;
    }
  }

  static async updateEducation(educationId, userId, educationData) {
    try {
      const { data, error } = await supabase
        .from('education')
        .update(educationData)
        .eq('id', educationId)
        .eq('user_id', userId)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating education:', error);
      throw error;
    }
  }

  static async deleteEducation(educationId, userId) {
    try {
      const { error } = await supabase
        .from('education')
        .delete()
        .eq('id', educationId)
        .eq('user_id', userId);
      if (error) throw error;
    } catch (error) {
      console.error('Error deleting education:', error);
      throw error;
    }
  }

  // --- Skills ---
  static async getSkills(userId) {
    try {
      const { data, error } = await supabase
        .from('skills')
        .select('*')
        .eq('user_id', userId);
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting skills:', error);
      throw error;
    }
  }

  static async addSkill(userId, skillData) {
    try {
      const { data, error } = await supabase
        .from('skills')
        .insert({ user_id: userId, ...skillData })
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error adding skill:', error);
      throw error;
    }
  }

  static async deleteSkill(skillId, userId) {
    try {
      const { error } = await supabase
        .from('skills')
        .delete()
        .eq('id', skillId)
        .eq('user_id', userId);
      if (error) throw error;
    } catch (error) {
      console.error('Error deleting skill:', error);
      throw error;
    }
  }

  // --- Work Experience ---
  static async getWorkExperience(userId) {
    try {
      const { data, error } = await supabase
        .from('work_experience')
        .select('*')
        .eq('user_id', userId);
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting work experience:', error);
      throw error;
    }
  }

  static async addWorkExperience(userId, workData) {
    try {
      const { data, error } = await supabase
        .from('work_experience')
        .insert({ user_id: userId, ...workData })
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error adding work experience:', error);
      throw error;
    }
  }
  
  static async updateWorkExperience(workId, userId, workData) {
    try {
      const { data, error } = await supabase
        .from('work_experience')
        .update(workData)
        .eq('id', workId)
        .eq('user_id', userId)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating work experience:', error);
      throw error;
    }
  }

  static async deleteWorkExperience(workId, userId) {
    try {
      const { error } = await supabase
        .from('work_experience')
        .delete()
        .eq('id', workId)
        .eq('user_id', userId);
      if (error) throw error;
    } catch (error) {
      console.error('Error deleting work experience:', error);
      throw error;
    }
  }

  // --- Contact URLs ---
  static async getContactUrls(userId) {
    try {
      const { data, error } = await supabase
        .from('contact_urls')
        .select('*')
        .eq('user_id', userId);
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting contact URLs:', error);
      throw error;
    }
  }
  
  static async upsertContactUrl(userId, urlData) {
    try {
      const { data, error } = await supabase
        .from('contact_urls')
        .upsert({ user_id: userId, ...urlData }, { onConflict: ['user_id', 'platform'] })
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error upserting contact URL:', error);
      throw error;
    }
  }
}

module.exports = ProfileService;