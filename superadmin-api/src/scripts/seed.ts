import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { SuperAdmin } from '../models/superadmin.model.js';
import { Consultant } from '../models/consultant.model.js';
import { Project } from '../models/project.model.js';
import { Client } from '../models/client.model.js';

dotenv.config();

async function seed() {
  console.log('--- Starting FLOXA Standalone SuperAdmin Seed ---');
  await connectDatabase();

  const adminEmail = process.env.SUPERADMIN_EMAIL || 'admin@floxa.com';
  const adminPassword = process.env.SUPERADMIN_PASSWORD || 'Password@123';
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  // 1. Seed SuperAdmin
  let admin = await SuperAdmin.findOne({ email: adminEmail });
  if (!admin) {
    admin = await SuperAdmin.create({
      email: adminEmail,
      password: passwordHash,
      name: 'FLOXA Platform SuperAdmin',
      role: 'superadmin',
      isActive: true,
    });
    console.log(`[+] Created SuperAdmin Account: ${adminEmail}`);
  } else {
    admin.password = passwordHash;
    admin.isActive = true;
    await admin.save();
    console.log(`[*] Updated existing SuperAdmin: ${adminEmail}`);
  }

  console.log('\n--- SuperAdmin Seed Finished Successfully (Real Data Mode) ---');
  console.log(`SuperAdmin Portal Credentials:`);
  console.log(`  Login URL: http://localhost:3001/login`);
  console.log(`  Email:     ${adminEmail}`);
  console.log(`  Password:  ${adminPassword}\n`);

  await disconnectDatabase();
}

seed().catch((err) => {
  console.error('[Seed Error]:', err);
  process.exit(1);
});
