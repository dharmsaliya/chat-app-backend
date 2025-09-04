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
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } catch (error) {
      console.error('Error getting user profile:', error);
      throw error;
    }
  }

  static async upsertProfile(userId, profileData) {
    try {
      const { headline, about_me } = profileData; // Destructure to ensure only valid fields are sent
      const { data, error } = await supabase
        .from('user_profiles')
        .upsert({ id: userId, headline, about_me }, { onConflict: 'id' })
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
  static async addEducation(userId, educationData) {
    try {
      // THE FIX: Be explicit about the columns to prevent schema errors.
      const { institution, degree, field_of_study, start_date, end_date } = educationData;
      const { data, error } = await supabase
        .from('education')
        .insert({ user_id: userId, institution, degree, field_of_study, start_date, end_date })
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
      const { institution, degree, field_of_study, start_date, end_date } = educationData;
      const { data, error } = await supabase
        .from('education')
        .update({ institution, degree, field_of_study, start_date, end_date })
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
      const { error } = await supabase.from('education').delete().eq('id', educationId).eq('user_id', userId);
      if (error) throw error;
    } catch (error) {
      console.error('Error deleting education:', error);
      throw error;
    }
  }

  // --- Skills ---
  static async addSkill(userId, skillData) {
    try {
      // THE FIX: Be explicit about the columns.
      const { title, level } = skillData;
      const { data, error } = await supabase
        .from('skills')
        .insert({ user_id: userId, title, level }) // Level will now be lowercase from Flutter
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
      const { error } = await supabase.from('skills').delete().eq('id', skillId).eq('user_id', userId);
      if (error) throw error;
    } catch (error) {
      console.error('Error deleting skill:', error);
      throw error;
    }
  }

  // --- Work Experience ---
  static async addWorkExperience(userId, workData) {
    try {
      // THE FIX: Be explicit about the columns to prevent schema errors.
      const { company, title, start_date, end_date, description } = workData;
      const { data, error } = await supabase
        .from('work_experience')
        .insert({ user_id: userId, company, title, start_date, end_date, description })
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
      const { company, title, start_date, end_date, description } = workData;
      const { data, error } = await supabase
        .from('work_experience')
        .update({ company, title, start_date, end_date, description })
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
      const { error } = await supabase.from('work_experience').delete().eq('id', workId).eq('user_id', userId);
      if (error) throw error;
    } catch (error) {
      console.error('Error deleting work experience:', error);
      throw error;
    }
  }

  // --- Contact URLs ---
  static async upsertContactUrl(userId, urlData) {
    try {
      const { platform, url } = urlData;
      const { data, error } = await supabase
        .from('contact_urls')
        .upsert({ user_id: userId, platform, url }, { onConflict: ['user_id', 'platform'] })
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
