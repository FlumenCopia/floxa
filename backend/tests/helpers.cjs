'use strict';

const http = require('http');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const WebSocket = require('ws');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { app } = require('../dist/app.js');
const { setupWebSocketServer } = require('../dist/websocket/socketServer.js');
const { ENV } = require('../dist/config/env.js');
const { signPortalAccessToken } = require('../dist/utils/crypto.js');
const models = require('../dist/models/index.js');

const JWT_SECRET = ENV.JWT_ACCESS_SECRET || process.env.JWT_ACCESS_SECRET || 'floxa_jwt_access_secret_2026';

let serverInstance = null;
let serverPort = null;

async function startTestServer() {
  if (serverInstance && serverPort) {
    return {
      server: serverInstance,
      port: serverPort,
      baseUrl: `http://127.0.0.1:${serverPort}`,
      wsUrl: `ws://127.0.0.1:${serverPort}`,
    };
  }

  const server = http.createServer(app);
  setupWebSocketServer(server);

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      serverInstance = server;
      resolve();
    });
  });

  return {
    server: serverInstance,
    port: serverPort,
    baseUrl: `http://127.0.0.1:${serverPort}`,
    wsUrl: `ws://127.0.0.1:${serverPort}`,
  };
}

async function closeTestServer() {
  if (serverInstance) {
    await new Promise((resolve) => serverInstance.close(resolve));
    serverInstance = null;
    serverPort = null;
  }
}

async function connectTestDatabase() {
  if (mongoose.connection.readyState !== 1) {
    const dbUrl = ENV.DATABASE_URL || process.env.DATABASE_URL || 'mongodb://127.0.0.1:27018/floxa_db?replicaSet=rs0';
    await mongoose.connect(dbUrl, {
      serverSelectionTimeoutMS: 5000,
    });
  }
  return mongoose.connection;
}

async function disconnectTestDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

function createTestToken(userId, email, options = {}) {
  const expiresIn = options.expiresIn || '1h';
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn });
}

function createTestPortalToken(portalSecret) {
  return signPortalAccessToken(portalSecret);
}

function buildMultipart(fields = {}, files = []) {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const buffers = [];

  for (const [key, val] of Object.entries(fields)) {
    buffers.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`));
  }

  for (const f of files) {
    buffers.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${f.name}"; filename="${f.filename}"\r\nContent-Type: ${f.contentType}\r\n\r\n`
      )
    );
    buffers.push(f.buffer);
    buffers.push(Buffer.from('\r\n'));
  }

  buffers.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.concat(buffers),
  };
}

function cleanupTestFiles(filePaths = []) {
  for (const fp of filePaths) {
    try {
      if (fp && fs.existsSync(fp)) {
        fs.unlinkSync(fp);
      }
    } catch (_) {
      // Ignored during test cleanup
    }
  }
}

async function createTestFixtures() {
  const rand = Math.random().toString(36).substring(2, 8);
  const consultant = await models.Consultant.create({
    email: `test_c_${rand}@floxa.local`,
    name: `Test Consultant ${rand}`,
    password: 'dummy_hashed_password',
  });

  const client = await models.Client.create({
    name: `Test Client ${rand}`,
    email: `test_cl_${rand}@floxa.local`,
    companyName: `Acme Corp ${rand}`,
    sector: 'Technology',
  });

  const project = await models.Project.create({
    title: `Test Project ${rand}`,
    companyName: client.companyName,
    sector: client.sector,
    status: 'discovery',
    consultantId: consultant._id,
    clientId: client._id,
    portalToken: `portal_sec_${rand}_${Date.now()}`,
    progress: 10,
  });

  const agreement = await models.ProjectAgreement.create({
    projectId: project._id,
    status: 'draft',
  });

  return {
    consultant,
    client,
    project,
    agreement,
    async cleanup() {
      try {
        await models.ProjectAgreement.deleteOne({ _id: agreement._id });
        await models.Project.deleteOne({ _id: project._id });
        await models.Client.deleteOne({ _id: client._id });
        await models.Consultant.deleteOne({ _id: consultant._id });
      } catch (_) {}
    },
  };
}

module.exports = {
  startTestServer,
  closeTestServer,
  connectTestDatabase,
  disconnectTestDatabase,
  createTestToken,
  createTestPortalToken,
  createTestFixtures,
  buildMultipart,
  cleanupTestFiles,
  models,
  JWT_SECRET,
  ENV,
  WebSocket,
};
