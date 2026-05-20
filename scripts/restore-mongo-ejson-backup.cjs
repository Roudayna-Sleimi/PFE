const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('../backend/node_modules/mongoose');
const { EJSON } = require('../backend/node_modules/bson');

const backendEnvPath = path.resolve(__dirname, '..', 'backend', '.env');
dotenv.config({ path: backendEnvPath });

const inputRoot = path.resolve(__dirname, '..', 'handover-usine', 'backup', 'ejson');

const main = async () => {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error(`MONGO_URI manquant dans ${backendEnvPath}`);
  }

  if (!fs.existsSync(inputRoot)) {
    throw new Error(`Backup introuvable: ${inputRoot}`);
  }

  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  const backupFiles = fs.readdirSync(inputRoot)
    .filter((file) => file.endsWith('.ejson'))
    .sort((a, b) => a.localeCompare(b));

  for (const file of backupFiles) {
    const collectionName = path.basename(file, '.ejson');
    const filePath = path.join(inputRoot, file);
    const payload = fs.readFileSync(filePath, 'utf8');
    const docs = EJSON.parse(payload);

    await db.collection(collectionName).deleteMany({});
    if (Array.isArray(docs) && docs.length > 0) {
      await db.collection(collectionName).insertMany(docs, { ordered: false });
    }

    console.log(`- ${collectionName}: ${Array.isArray(docs) ? docs.length : 0}`);
  }
};

main()
  .catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch {
      // ignore disconnect errors
    }
  });
