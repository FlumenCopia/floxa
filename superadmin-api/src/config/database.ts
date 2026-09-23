import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || 'mongodb://127.0.0.1:27017/floxa_db';

let isConnected = false;

export async function connectDatabase() {
  if (isConnected) return mongoose;

  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(DATABASE_URL, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log('[SuperAdmin API] Connected to shared MongoDB database successfully.');
    return mongoose;
  } catch (error) {
    // If replica set connection fails locally, try standalone fallback without ?replicaSet=rs0
    if (DATABASE_URL.includes('replicaSet')) {
      try {
        const fallbackUrl = DATABASE_URL.split('?')[0];
        console.warn(`[SuperAdmin API] Retrying MongoDB connection without replicaSet: ${fallbackUrl}`);
        await mongoose.connect(fallbackUrl, { serverSelectionTimeoutMS: 5000 });
        isConnected = true;
        console.log('[SuperAdmin API] Connected to standalone MongoDB.');
        return mongoose;
      } catch (err2) {
        console.error('[SuperAdmin API] Standalone fallback connection failed:', err2);
      }
    }
    console.error('[SuperAdmin API] Failed to connect to MongoDB:', error);
    throw error;
  }
}

export async function disconnectDatabase() {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
  console.log('[SuperAdmin API] Disconnected from MongoDB.');
}
