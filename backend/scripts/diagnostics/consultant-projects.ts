import { prisma } from '../../src/prisma/client.js';

async function main() {
  const consultants = await prisma.consultant.findMany({
    take: 5,
    include: {
      _count: {
        select: { projects: true }
      }
    }
  });

  for (const c of consultants) {
    console.log(`Consultant: ${c.email} (${c.name}) - ${c._count.projects} projects`);
  }
}

main().finally(() => prisma.$disconnect());
