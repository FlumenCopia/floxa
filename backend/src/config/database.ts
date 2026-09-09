import mongoose from 'mongoose';
import { ENV } from './env.js';

let isConnected = false;

export async function connectDatabase(): Promise<typeof mongoose> {
  if (isConnected) {
    return mongoose;
  }

  try {
    mongoose.set('strictQuery', true);

    mongoose.connection.on('connected', () => {
      isConnected = true;
      console.log('Connected to MongoDB via Mongoose');
    });

    mongoose.connection.on('error', (err) => {
      console.error('Mongoose connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      console.warn('Mongoose disconnected from MongoDB');
    });

    const conn = await mongoose.connect(ENV.DATABASE_URL, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: true,
    });

    isConnected = true;
    return conn;
  } catch (error) {
    console.error('Failed to connect to MongoDB with Mongoose:', error);
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (!isConnected) return;
  try {
    await mongoose.disconnect();
    isConnected = false;
    console.log('Mongoose connection closed.');
  } catch (error) {
    console.error('Error closing Mongoose connection:', error);
  }
}
