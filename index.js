require('dotenv').config(); // load .env FIRST, before anything reads it
const connectDB = require('./db');

connectDB();