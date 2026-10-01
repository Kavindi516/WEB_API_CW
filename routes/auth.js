const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');

// POST /auth/login — exchange username+password for a token
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // the token carries exactly what we need to scope their reads later
    const token = jwt.sign(
      { userId: user._id, role: user.role, province: user.province, district: user.district },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;