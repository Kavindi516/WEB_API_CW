require('dotenv').config();
const express = require('express');
const connectDB = require('./db');

const app = express();
app.use(express.json()); // lets Express read JSON bodies later, for POST requests

connectDB();

// This is a simple "is it alive" route — good for checking deployment later too
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'SLSEA Solar Generation API' });
});

const provincesRouter = require('./routes/provinces');
app.use('/provinces', provincesRouter);

const districtsRouter = require('./routes/districts');
app.use('/districts', districtsRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});