import type { Request } from 'express';
import type { IConsultant } from '../models/consultant.model.js';
import type { ProjectPayload, PortalProjectPayload } from './portal.js';

export interface AuthenticatedRequest<
  P = Record<string, string>,
  ResBody = unknown,
  ReqBody = Record<string, unknown>,
  ReqQuery = Record<string, string | string[] | undefined>
> extends Request<P, ResBody, ReqBody, ReqQuery> {
  user?: IConsultant;
}

export interface PortalRequest<
  P = Record<string, string>,
  ResBody = unknown,
  ReqBody = Record<string, unknown>,
  ReqQuery = Record<string, string | string[] | undefined>
> extends Request<P, ResBody, ReqBody, ReqQuery> {
  project?: PortalProjectPayload;
  user?: IConsultant;
  isSupportMode?: boolean;
  isPortalClient?: boolean;
}

export interface PortalAccessRequest<
  P = Record<string, string>,
  ResBody = unknown,
  ReqBody = Record<string, unknown>,
  ReqQuery = Record<string, string | string[] | undefined>
> extends Request<P, ResBody, ReqBody, ReqQuery> {
  project?: PortalProjectPayload;
  user?: IConsultant;
  isSupportMode?: boolean;
  isPortalClient?: boolean;
}

export interface FileUploadRequest<
  P = Record<string, string>,
  ResBody = unknown,
  ReqBody = Record<string, unknown>,
  ReqQuery = Record<string, string | string[] | undefined>
> extends AuthenticatedRequest<P, ResBody, ReqBody, ReqQuery> {
  file?: Express.Multer.File;
}

export interface FilesUploadRequest<
  P = Record<string, string>,
  ResBody = unknown,
  ReqBody = Record<string, unknown>,
  ReqQuery = Record<string, string | string[] | undefined>
> extends AuthenticatedRequest<P, ResBody, ReqBody, ReqQuery> {
  files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
}
