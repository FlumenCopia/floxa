import type { IProject } from '../models/project.model.js';

export type ConsultantProjectPayload = IProject;
export type PortalProjectPayload = IProject;
export type ProjectPayload = IProject;

export interface PortalTokenInfo {
  token: string;
  projectId?: string;
  accessSalt?: string;
}
