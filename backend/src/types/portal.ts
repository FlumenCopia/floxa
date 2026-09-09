import type { Prisma } from '@prisma/client';

export type ConsultantProjectPayload = Prisma.ProjectGetPayload<{
  include: {
    client: true;
    consultant: true;
  };
}>;

export type PortalProjectPayload = Prisma.ProjectGetPayload<{
  include: {
    client: true;
    consultant: true;
    clientProfile: true;
    discovery: true;
    brandDNA: true;
    moodboards: true;
    concepts: true;
    deliverables: true;
    projectAgreement: true;
    paymentMilestones: true;
  };
}>;

export type ProjectPayload = PortalProjectPayload | ConsultantProjectPayload;

export interface PortalTokenInfo {
  token: string;
  projectId?: string;
  accessSalt?: string;
}
