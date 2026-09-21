require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const {
  Province, District, GridSubstation,
  SolarInstallation, GenerationReading, User,
} = require('./models');

// sri lanka provinces + codes
const PROVINCES = [
  ['Western', 'WP'], ['Central', 'CP'], ['Southern', 'SP'], ['Northern', 'NP'],
  ['Eastern', 'EP'], ['North Western', 'NWP'], ['North Central', 'NCP'],
  ['Uva', 'UVA'], ['Sabaragamuwa', 'SAB'],
];

// Real districts nested under the correct province (this is what makes the data FK-consistent)
const DISTRICTS = {
  'Western':      ['Colombo', 'Gampaha', 'Kalutara'],
  'Central':      ['Kandy', 'Matale', 'Nuwara Eliya'],
  'Southern':     ['Galle', 'Matara', 'Hambantota'],
  'Northern':     ['Jaffna', 'Kilinochchi', 'Mannar', 'Vavuniya', 'Mullaitivu'],
  'Eastern':      ['Batticaloa', 'Ampara', 'Trincomalee'],
  'North Western':['Kurunegala', 'Puttalam'],
  'North Central':['Anuradhapura', 'Polonnaruwa'],
  'Uva':          ['Badulla', 'Monaragala'],
  'Sabaragamuwa': ['Ratnapura', 'Kegalle'],
};

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

// The day/night curve: 0 at night, rising to a peak at midday, back to 0 at dusk
function solarFactor(hour) {
  if (hour < 6 || hour > 18) return 0;
  return Math.sin(((hour - 6) / 12) * Math.PI);
}

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected. Clearing any old data...');

  // clear everything so we don't end up with duplicates if this gets run twice
  await Promise.all([
    Province.deleteMany({}), District.deleteMany({}), GridSubstation.deleteMany({}),
    SolarInstallation.deleteMany({}), GenerationReading.deleteMany({}), User.deleteMany({}),
  ]);

  // 1. Provinces
  const provinceDocs = await Province.insertMany(
    PROVINCES.map(([name, code]) => ({ name, code }))
  );
  const provinceByName = Object.fromEntries(provinceDocs.map((p) => [p.name, p]));
  console.log(`Seeded ${provinceDocs.length} provinces`);

  // 2. Districts (each one needs its parent province's _id attached)
  let di = 0;
  const districtsData = [];
  for (const [pname, dlist] of Object.entries(DISTRICTS)) {
    for (const dname of dlist) {
      di++;
      districtsData.push({
        name: dname,
        code: `DIST-${String(di).padStart(2, '0')}`,
        province: provinceByName[pname]._id,
      });
    }
  }
  const districtDocs = await District.insertMany(districtsData);
  console.log(`Seeded ${districtDocs.length} districts`);

  // 3. Grid substations (30, spread across districts)
  const substationsData = [];
  for (let i = 0; i < 30; i++) {
    substationsData.push({
      name: `Substation ${i + 1}`,
      code: `SUB-${String(i + 1).padStart(2, '0')}`,
      district: districtDocs[i % districtDocs.length]._id,
    });
  }
  const substations = await GridSubstation.insertMany(substationsData);
  console.log(`Seeded ${substations.length} substations`);

  // 4. Solar installations (220), each with its own device API key
  const installationsData = [];
  const keyByMeter = {};
  for (let i = 0; i < 220; i++) {
    const meterId = `MTR-${String(i + 1).padStart(4, '0')}`;
    const apiKey = crypto.randomBytes(24).toString('hex'); // the device's secret
    keyByMeter[meterId] = apiKey;
    installationsData.push({
      meterId,
      capacityKw: +(3 + Math.random() * 7).toFixed(1),      // 3–10 kW rooftop
      latitude:  +(5.9 + Math.random() * 3.5).toFixed(5),   // rough Sri Lanka bounds
      longitude: +(79.6 + Math.random() * 2.2).toFixed(5),
      substation: substations[Math.floor(Math.random() * substations.length)]._id,
      apiKeyHash: sha256(apiKey),                           // NEVER store the raw key, only the hash
    });
  }
  const installations = await SolarInstallation.insertMany(installationsData);
  console.log(`Seeded ${installations.length} installations`);

  // dump the plaintext keys somewhere I can use them to test the POST /readings route later
  // this file should NOT be committed - added to gitignore
  const credentials = installations.map((inst) => ({
    meterId: inst.meterId,
    installationId: inst._id,
    apiKey: keyByMeter[inst.meterId],
  }));
  fs.writeFileSync('seed-credentials.json', JSON.stringify(credentials, null, 2));
  console.log('Wrote device API keys to seed-credentials.json');

  // 5. Generation readings: one week, every 15 minutes, per installation
  const FIFTEEN_MIN = 15 * 60 * 1000;
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  let totalReadings = 0;

  for (let idx = 0; idx < installations.length; idx++) {
    const inst = installations[idx];
    const docs = [];
    let cumulative = +(Math.random() * 1000).toFixed(2); // meter's starting lifetime total

    for (let t = start.getTime(); t <= end.getTime(); t += FIFTEEN_MIN) {
      const d = new Date(t);
      const hour = d.getHours() + d.getMinutes() / 60;
      const factor = solarFactor(hour);

      // add a bit of randomness so it's not a perfectly smooth curve
      const power = Math.max(0, +(inst.capacityKw * factor * (0.85 + Math.random() * 0.3)).toFixed(3));
      cumulative += power * 0.25; // 15 min = quarter hour
      docs.push({
        installation: inst._id,
        timestamp: d,
        powerKw: power,
        energyKwh: +cumulative.toFixed(2),
        voltage: power > 0 ? +(230 + (Math.random() * 6 - 3)).toFixed(1) : 0,
      });
    }
    await GenerationReading.insertMany(docs);
    totalReadings += docs.length;
    if ((idx + 1) % 25 === 0) {
      console.log(`  ...readings done for ${idx + 1}/${installations.length} installations`);
    }
  }
  console.log(`Seeded ${totalReadings} readings`);

  // 6. A few SLSEA users to test read-scoping later (all share the password "Password123")
  const pw = bcrypt.hashSync('Password123', 10);
  await User.insertMany([
    { username: 'national', passwordHash: pw, role: 'NATIONAL' },
    { username: 'western_user', passwordHash: pw, role: 'PROVINCIAL', province: provinceByName['Western']._id },
    { username: 'colombo_user', passwordHash: pw, role: 'DISTRICT',
      district: districtDocs.find((d) => d.name === 'Colombo')._id },
  ]);
  console.log('Seeded 3 users (password: Password123)');

  console.log('\nSeeding complete.');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});