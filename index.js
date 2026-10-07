require('dotenv').config();
const connectDB = require('./db');

// fail fast: without these the API can't authenticate anyone or reach its data
for (const name of ['JWT_SECRET', 'MONGODB_URI']) {
  if (!process.env[name]) {
    console.error(`Missing required environment variable ${name}`);
    process.exit(1);
  }
}

const app = require('./app');

connectDB();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
