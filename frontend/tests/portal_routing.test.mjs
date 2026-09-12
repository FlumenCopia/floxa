import test from 'node:test';
import assert from 'node:assert';

// Contract replicas matching ClientPortal.jsx helper logic
function isClientProfileComplete(savedProfile) {
  if (!savedProfile) {
    return false;
  }

  if (savedProfile.isCompleted || savedProfile.is_completed) {
    return true;
  }

  return Boolean(
    savedProfile.clientYearStart ||
    savedProfile.year_started ||
    savedProfile.yearStarted ||
    (typeof savedProfile.clientLocation === "string" && savedProfile.clientLocation.trim()) ||
    (typeof savedProfile.location === "string" && savedProfile.location.trim()) ||
    (typeof savedProfile.clientPhone === "string" && savedProfile.clientPhone.trim()) ||
    (typeof savedProfile.phone === "string" && savedProfile.phone.trim()) ||
    (typeof savedProfile.clientWebsite === "string" && savedProfile.clientWebsite.trim()) ||
    (typeof savedProfile.website === "string" && savedProfile.website.trim())
  );
}

function getBackendResumeScreen(savedProfile, savedDiscovery, project) {
  const normalizedStatus = String(project?.status || "").toLowerCase();
  const progressPct = Number(project?.completionPct ?? project?.progress ?? 0);

  // 1. Has the client already submitted discovery and reached dashboard?
  const isDiscoverySubmitted = Boolean(
    savedDiscovery?.isSubmitted ||
    savedDiscovery?.is_submitted ||
    savedDiscovery?.submitted_at ||
    savedDiscovery?.submittedAt ||
    ["discovery_complete", "concepts_in_progress", "agreement_pending", "final_paid", "delivered"].includes(normalizedStatus) ||
    progressPct >= 48
  );

  if (isDiscoverySubmitted) {
    return "dashboard";
  }

  // 2. First-time client or incomplete profile: must submit profile first
  if (!isClientProfileComplete(savedProfile)) {
    return "profile";
  }

  // 3. Profile submitted, but discovery not submitted yet
  if (savedDiscovery?.isComplete || savedDiscovery?.is_complete) {
    return "review";
  }

  return "discovery";
}

function resolveSessionScreen(nextScreen, stored) {
  const isDiscoverySubmitted = nextScreen === "dashboard";
  return stored &&
    !["splash", "login"].includes(stored) &&
    (isDiscoverySubmitted || stored !== "dashboard") &&
    (nextScreen !== "profile" || stored === "profile")
      ? stored
      : nextScreen;
}

test('Client Portal Routing & Onboarding Separation Contract', async (t) => {
  await t.test('1. First-time client with null profile and null discovery routes strictly to profile', () => {
    const project = { id: 'kitchen-1', status: 'created', progress: 5 };
    const destination = getBackendResumeScreen(null, null, project);
    assert.strictEqual(destination, 'profile');
  });

  await t.test('2. First-time client with partial consultant-created profile routes to profile', () => {
    const project = { id: 'kitchen-1', status: 'created', progress: 5 };
    const savedProfile = {
      client_name: 'John',
      company_name: 'Kitchen Co',
      industry: 'Culinary',
      year_started: null,
      location: '',
      phone: '',
      email: 'john@kitchen.com',
      website: '',
      is_completed: false,
    };
    const destination = getBackendResumeScreen(savedProfile, null, project);
    assert.strictEqual(destination, 'profile');
  });

  await t.test('3. Client with completed profile but unsubmitted discovery routes to discovery questionnaire', () => {
    const project = { id: 'proj-2', status: 'created', progress: 15 };
    const savedProfile = {
      is_completed: true,
      client_name: 'John',
      company_name: 'Kitchen Co',
      phone: '+1 555-0199',
      location: 'New York',
    };
    const savedDiscovery = {
      is_submitted: false,
      is_complete: false,
      draft: { whatDo: 'Kitchen remodel' },
    };
    const destination = getBackendResumeScreen(savedProfile, savedDiscovery, project);
    assert.strictEqual(destination, 'discovery');
  });

  await t.test('4. Client with completed profile and full discovery draft ready for review routes to review', () => {
    const project = { id: 'proj-3', status: 'created', progress: 25 };
    const savedProfile = { is_completed: true };
    const savedDiscovery = {
      is_submitted: false,
      is_complete: true,
    };
    const destination = getBackendResumeScreen(savedProfile, savedDiscovery, project);
    assert.strictEqual(destination, 'review');
  });

  await t.test('5. Returning client with submitted discovery routes directly to dashboard', () => {
    const project = { id: 'proj-4', status: 'discovery', progress: 35 };
    const savedProfile = { is_completed: true };
    const savedDiscovery = {
      is_submitted: true,
      submitted_at: '2026-09-12T10:00:00.000Z',
    };
    const destination = getBackendResumeScreen(savedProfile, savedDiscovery, project);
    assert.strictEqual(destination, 'dashboard');
  });

  await t.test('6. Returning client past discovery (progress >= 48) routes to dashboard', () => {
    const project = { id: 'taigun', status: 'discovery', progress: 65 };
    const destination = getBackendResumeScreen(null, null, project);
    assert.strictEqual(destination, 'dashboard');
  });

  await t.test('7. Returning client with status "discovery_complete" or "delivered" routes to dashboard', () => {
    const deliveredProject = { id: 'akhil', status: 'delivered', progress: 100 };
    assert.strictEqual(getBackendResumeScreen(null, null, deliveredProject), 'dashboard');

    const completedProject = { id: 'comp', status: 'discovery_complete', progress: 40 };
    assert.strictEqual(getBackendResumeScreen(null, null, completedProject), 'dashboard');
  });

  await t.test('8. Session resolution blocks stale dashboard storage from skipping incomplete profile', () => {
    const nextScreen = 'profile';
    const staleStored = 'dashboard';
    const resolved = resolveSessionScreen(nextScreen, staleStored);
    assert.strictEqual(resolved, 'profile');
  });

  await t.test('9. Session resolution blocks stale dashboard storage from skipping incomplete discovery', () => {
    const nextScreen = 'discovery';
    const staleStored = 'dashboard';
    const resolved = resolveSessionScreen(nextScreen, staleStored);
    assert.strictEqual(resolved, 'discovery');
  });

  await t.test('10. Session resolution allows dashboard storage when discovery is submitted', () => {
    const nextScreen = 'dashboard';
    const validStored = 'dashboard';
    const resolved = resolveSessionScreen(nextScreen, validStored);
    assert.strictEqual(resolved, 'dashboard');
  });
});
