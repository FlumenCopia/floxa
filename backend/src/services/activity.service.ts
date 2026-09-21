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
  isRead?: boolean;
}

export type ActivityNotificationListener = (activity: IProjectActivity) => void | Promise<void>;
const activityListeners: ActivityNotificationListener[] = [];

export function onActivityCreated(listener: ActivityNotificationListener): () => void {
  activityListeners.push(listener);
  return () => {
    const idx = activityListeners.indexOf(listener);
    if (idx >= 0) activityListeners.splice(idx, 1);
  };
}

function notifyActivityListeners(activity: IProjectActivity) {
  for (const listener of activityListeners) {
    try {
      const res = listener(activity);
      if (res && typeof (res as any).catch === 'function') {
        (res as Promise<void>).catch((err) => console.error('[ActivityService] Error in activity listener:', err));
      }
    } catch (err) {
      console.error('[ActivityService] Error in activity listener:', err);
    }
  }
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
    clientIsRead: params.clientIsRead !== undefined ? params.clientIsRead : (params.actorType === 'client'),
    isRead: params.isRead !== undefined ? params.isRead : (params.actorType === 'consultant'),
    createdAt: new Date(),
  };

  let result: IProjectActivity;
  if (session) {
    const created = await ProjectActivity.create([docData], { session });
    result = created[0];
  } else {
    result = await ProjectActivity.create(docData);
  }

  setImmediate(() => {
    notifyActivityListeners(result);
  });

  return result;
}

