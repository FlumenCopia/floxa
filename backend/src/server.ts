import http from 'http';
import { app } from './app.js';
import { ENV } from './config/env.js';
import { connectDatabase } from './config/database.js';
import { setupWebSocketServer } from './websocket/socketServer.js';

const server = http.createServer(app);

// Attach WebSocket server for real-time support channels and WebRTC
setupWebSocketServer(server);

async function startServer() {
  try {
    // Verify MongoDB connection via Mongoose
    await connectDatabase();

    server.listen(ENV.PORT, () => {
      console.log(`FLOXA Node.js Backend listening on port ${ENV.PORT}`);
      console.log(`WebSocket endpoints active on ws://localhost:${ENV.PORT}/ws/support/`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
