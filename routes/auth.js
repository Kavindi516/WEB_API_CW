const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { User } = require('../models');
const { errorBody, sendError } = require('../utils/errors');
const { signUserToken } = require('../utils/tokens');
const { validateLogin } = require('../validation/schemas');

// POST /auth/login — exchange username+password for a user token
router.post('/login', validateLogin, async (req, res) => {
  try {
    const { username, password } = req.valid.body;
    const user = await User.findOne({ username });

    if (!user) {
      return res.status(401).json(errorBody('INVALID_CREDENTIALS', 'Invalid credentials'));
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json(errorBody('INVALID_CREDENTIALS', 'Invalid credentials'));
    }

    res.json({ token: signUserToken(user) });
  } catch (err) {
    sendError(res, err, 'LOGIN_FAILED', 'Login failed');
  }
});

module.exports = router;
