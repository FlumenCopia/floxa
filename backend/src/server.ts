import { checkAndEscalateDeadlines } from './services/deadlineMonitoring.service.js';
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

    // Delivery deadline and 3-flag escalation engine
    checkAndEscalateDeadlines().catch((e) => console.error('Deadline scan error:', e));
    setInterval(() => {
      checkAndEscalateDeadlines().catch((e) => console.error('Periodic deadline scan error:', e));
    }, 30 * 60 * 1000);

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
