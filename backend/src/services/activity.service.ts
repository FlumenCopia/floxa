import { ClientSession } from 'mongoose';
import { ProjectActivity, type IProjectActivity, type ActorType } from '../models/activity.model.js';

export interface LogActivityParams {
  projectId: string;
  consultantId: string;
  actorType: ActorType;
  action: string;
  description: string;
  metadata?: Record<string, any>;
  visibleToClient?: boolean;
  clientIsRead?: boolean;
}

export async function logProjectActivity(
  params: LogActivityParams,
  session?: ClientSession
): Promise<IProjectActivity> {
  const docData = {
    projectId: params.projectId,
    consultantId: params.consultantId,
    actorType: params.actorType,
    action: params.action,
    description: params.description,
    metadata: JSON.stringify(params.metadata || {}),
    visibleToClient: params.visibleToClient ?? false,
    clientIsRead: params.clientIsRead ?? false,
    createdAt: new Date(),
  };

  if (session) {
    const created = await ProjectActivity.create([docData], { session });
    return created[0];
  }

  return ProjectActivity.create(docData);
}
