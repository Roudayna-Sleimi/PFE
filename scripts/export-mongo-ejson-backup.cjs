const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('../backend/node_modules/mongoose');
const { EJSON } = require('../backend/node_modules/bson');

const backendEnvPath = path.resolve(__dirname, '..', 'backend', '.env');
dotenv.config({ path: backendEnvPath });

const outputRoot = path.resolve(__dirname, '..', 'handover-usine', 'backup', 'ejson');

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const main = async () => {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error(`MONGO_URI manquant dans ${backendEnvPath}`);
  }

  ensureDir(outputRoot);

  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();

  const exported = [];

  for (const collection of collections) {
    const collectionName = collection.name;
    const docs = await db.collection(collectionName).find({}).toArray();
    const targetPath = path.join(outputRoot, `${collectionName}.ejson`);
    fs.writeFileSync(targetPath, EJSON.stringify(docs, null, 2));
    exported.push({ collection: collectionName, count: docs.length, file: path.basename(targetPath) });
  }

  const metadata = {
    exportedAt: new Date().toISOString(),
    mongoUri,
    collections: exported,
  };

  fs.writeFileSync(
    path.join(outputRoot, 'metadata.json'),
    JSON.stringify(metadata, null, 2),
  );

  console.log(`Backup exporte dans ${outputRoot}`);
  for (const item of exported) {
    console.log(`- ${item.collection}: ${item.count}`);
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
