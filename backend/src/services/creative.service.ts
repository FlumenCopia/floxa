import { Moodboard } from '../models/moodboard.model.js';
import { Concept } from '../models/concept.model.js';
import { Deliverable } from '../models/deliverable.model.js';

export async function getProjectMoodboards(projectId: string) {
  return Moodboard.find({ projectId }).sort({ createdAt: -1 });
}

export async function getProjectConcepts(projectId: string) {
  return Concept.find({ projectId }).sort({ createdAt: -1 });
}

export async function getProjectDeliverables(projectId: string) {
  return Deliverable.find({ projectId }).sort({ createdAt: -1 });
}
