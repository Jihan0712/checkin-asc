// Simple Express server to receive check‑in data and store it in MongoDB
// Uses the connection string provided by the user.
// Run with: node server/checkinServer.js (ensure `express`, `multer`, `mongodb`, `cors` are installed)

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
app.use(cors());

// Multer config – store files in memory (we'll forward them to MongoDB GridFS or as base64)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// MongoDB connection – replace with your actual DB name if needed
const MONGODB_URI = 'mongodb+srv://christianrylelegaspi_db_user:afLyEiLFdbz6iZvV@checkin-asc.puumhfv.mongodb.net/';
const DB_NAME = 'checkinDB'; // you can change this
const COLLECTION = 'checkins';

let dbClient;
async function initDb() {
  const client = new MongoClient(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  await client.connect();
  console.log('✅ Connected to MongoDB');
  dbClient = client.db(DB_NAME);
}

// POST endpoint to receive check‑in data
app.post('/submit', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const { facing, name, latitude, longitude } = req.body;
    const doc = {
      _id: new ObjectId(),
      timestamp: new Date(),
      facing: facing || 'unknown',
      name: name || null,
      location: latitude && longitude ? { latitude: parseFloat(latitude), longitude: parseFloat(longitude) } : null,
      // Store the image as a Buffer (you may later move to GridFS for large files)
      image: req.file.buffer,
      mimeType: req.file.mimetype,
    };
    const collection = dbClient.collection(COLLECTION);
    await collection.insertOne(doc);
    res.status(200).json({ success: true, id: doc._id });
  } catch (e) {
    console.error('Error handling /submit:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Check‑in server listening on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });
