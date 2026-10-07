const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { errorBody, sendError } = require('../utils/errors');

// POST /auth/login — exchange username+password for a token
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user) {
      return res.status(401).json(errorBody('INVALID_CREDENTIALS', 'Invalid credentials'));
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json(errorBody('INVALID_CREDENTIALS', 'Invalid credentials'));
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role, province: user.province, district: user.district },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ token });
  } catch (err) {
    sendError(res, err, 'LOGIN_FAILED', 'Login failed');
  }
});

module.exports = router;