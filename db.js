const mongoose = require('mongoose');

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB Atlas');
  } catch (err) {
    console.error('Could not connect:', err.message);
    process.exit(1); // stop the app if the database is unreachable
  }
}

module.exports = connectDB;