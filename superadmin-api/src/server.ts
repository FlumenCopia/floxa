import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { connectDatabase } from './config/database.js';
import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
const isProduction = process.env.NODE_ENV === 'production';
const rawOrigins = (process.env.CORS_ORIGIN || process.env.ADMIN_APP_URL || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const allowedOrigins = isProduction
  ? (rawOrigins.length > 0 ? rawOrigins : ['http://localhost:3001', 'http://localhost:3002'])
  : Array.from(new Set([...rawOrigins, 'http://localhost:3001', 'http://127.0.0.1:3001', 'http://localhost:3002', 'http://127.0.0.1:3002']));

// Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (such as curl, server-to-server, or local scripts)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'floxa-superadmin-api', port: PORT });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[SuperAdmin API Error]:', err);
  res.status(err.status || 500).json({
    detail: err.message || 'An unexpected error occurred in SuperAdmin API.',
  });
});

async function start() {
  await connectDatabase();
  app.listen(PORT, () => {
    console.log(`[SuperAdmin API] Listening on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('[SuperAdmin API] Fatal Startup Error:', err);
  process.exit(1);
});

export default app;
