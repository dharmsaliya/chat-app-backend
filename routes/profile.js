const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const ProfileService = require('../services/profileService');
const { isValidURL } = require('../utils/validators');

const router = express.Router();

// --- Profile Routes ---
router.get('/', authMiddleware, async (req, res) => {
  try {
    const profile = await ProfileService.getProfile(req.user.id);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Profile not found' });
    }
    res.json({ success: true, profile });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

router.put('/', authMiddleware, async (req, res) => {
  const { age, location, headline, about_me } = req.body;
  try {
    const profile = await ProfileService.upsertProfile(req.user.id, { age, location, headline, about_me });
    res.json({ success: true, profile });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// --- Education Routes ---
router.post('/education', authMiddleware, async (req, res) => {
  try {
    const education = await ProfileService.addEducation(req.user.id, req.body);
    res.status(201).json({ success: true, education });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

router.put('/education/:id', authMiddleware, async (req, res) => {
  try {
    const education = await ProfileService.updateEducation(req.params.id, req.user.id, req.body);
    res.json({ success: true, education });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

router.delete('/education/:id', authMiddleware, async (req, res) => {
  try {
    await ProfileService.deleteEducation(req.params.id, req.user.id);
    res.json({ success: true, message: 'Education entry deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// --- Skill Routes ---
router.post('/skills', authMiddleware, async (req, res) => {
  const { title, level } = req.body;
  if (!title || !level) {
    return res.status(400).json({ success: false, message: 'Title and level are required' });
  }
  try {
    const skill = await ProfileService.addSkill(req.user.id, { title, level });
    res.status(201).json({ success: true, skill });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

router.delete('/skills/:id', authMiddleware, async (req, res) => {
  try {
    await ProfileService.deleteSkill(req.params.id, req.user.id);
    res.json({ success: true, message: 'Skill deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// --- Work Experience Routes ---
router.post('/work-experience', authMiddleware, async (req, res) => {
  try {
    const work = await ProfileService.addWorkExperience(req.user.id, req.body);
    res.status(201).json({ success: true, work });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

router.put('/work-experience/:id', authMiddleware, async (req, res) => {
    try {
      const work = await ProfileService.updateWorkExperience(req.params.id, req.user.id, req.body);
      res.json({ success: true, work });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server Error' });
    }
});

router.delete('/work-experience/:id', authMiddleware, async (req, res) => {
    try {
      await ProfileService.deleteWorkExperience(req.params.id, req.user.id);
      res.json({ success: true, message: 'Work experience deleted' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// --- Contact URL Routes ---
router.put('/contact-urls', authMiddleware, async (req, res) => {
  const { platform, url } = req.body;
  if (!platform || !url || !isValidURL(url)) {
    return res.status(400).json({ success: false, message: 'A valid platform and URL are required' });
  }
  try {
    const contactUrl = await ProfileService.upsertContactUrl(req.user.id, { platform, url });
    res.json({ success: true, contactUrl });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

module.exports = router;