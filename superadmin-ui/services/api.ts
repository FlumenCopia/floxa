const API_BASE_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:5002/api';

function getAuthHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('floxa_admin_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(endpoint: string, options: RequestInit = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeader(),
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
      localStorage.removeItem('floxa_admin_token');
      localStorage.removeItem('floxa_admin_user');
      window.location.href = '/login';
    }
    throw new Error(data.detail || data.message || `Request failed with status ${res.status}`);
  }

  return data;
}

export const adminApi = {
  // Auth
  async login(email: string, password: string) {
    const res = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (res.token && typeof window !== 'undefined') {
      localStorage.setItem('floxa_admin_token', res.token);
      localStorage.setItem('floxa_admin_user', JSON.stringify(res.admin));
    }
    return res;
  },

  async getMe() {
    return request('/auth/me');
  },

  async logout() {
    try {
      await request('/auth/logout', { method: 'POST' });
    } catch {}
    if (typeof window !== 'undefined') {
      localStorage.removeItem('floxa_admin_token');
      localStorage.removeItem('floxa_admin_user');
      window.location.href = '/login';
    }
  },

  // Metrics & System Health
  async getMetrics() {
    return request('/admin/metrics');
  },

  async getSystemStatus() {
    return request('/admin/system/status');
  },

  // Consultants
  async getConsultants(params: { search?: string; status?: string; plan?: string; page?: number; limit?: number } = {}) {
    const q = new URLSearchParams();
    if (params.search) q.append('search', params.search);
    if (params.status) q.append('status', params.status);
    if (params.plan) q.append('plan', params.plan);
    if (params.page) q.append('page', String(params.page));
    if (params.limit) q.append('limit', String(params.limit));

    const query = q.toString() ? `?${q.toString()}` : '';
    return request(`/admin/consultants${query}`);
  },

  async getConsultantDetails(id: string) {
    return request(`/admin/consultants/${id}/details`);
  },

  async updateConsultantStatus(id: string, isActive: boolean) {
    return request(`/admin/consultants/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    });
  },

  async updateConsultantPlan(id: string, plan: string, maxProjects?: number) {
    return request(`/admin/consultants/${id}/plan`, {
      method: 'PATCH',
      body: JSON.stringify({ plan, maxProjects }),
    });
  },

  async updateConsultantAiQuota(id: string, action: 'reset' | 'set-credits' | 'add-credits', credits?: number) {
    return request(`/admin/consultants/${id}/ai-quota`, {
      method: 'PATCH',
      body: JSON.stringify({ action, credits }),
    });
  },

  // Projects
  async getProjects(params: { search?: string; page?: number; limit?: number } = {}) {
    const q = new URLSearchParams();
    if (params.search) q.append('search', params.search);
    if (params.page) q.append('page', String(params.page));
    if (params.limit) q.append('limit', String(params.limit));

    const query = q.toString() ? `?${q.toString()}` : '';
    return request(`/admin/projects${query}`);
  },

  // Profile & Password (Phase 3)
  async getProfile() {
    return request('/admin/profile');
  },

  async updateProfile(name: string, email: string) {
    return request('/admin/profile', {
      method: 'PUT',
      body: JSON.stringify({ name, email }),
    });
  },

  async changePassword(currentPassword: string, newPassword: string) {
    return request('/admin/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  // Announcements (Phase 3)
  async getAnnouncement() {
    return request('/admin/announcement');
  },

  async updateAnnouncement(message: string, type: string, isActive: boolean) {
    return request('/admin/announcement', {
      method: 'PUT',
      body: JSON.stringify({ message, type, isActive }),
    });
  },

  // CSV Downloads (Phase 3)
  async downloadConsultantsCsv() {
    const token = typeof window !== 'undefined' ? localStorage.getItem('floxa_admin_token') || '' : '';
    const res = await fetch(`${API_BASE_URL}/admin/export/consultants.csv`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to download consultants CSV');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `floxa-consultants-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  async downloadProjectsCsv() {
    const token = typeof window !== 'undefined' ? localStorage.getItem('floxa_admin_token') || '' : '';
    const res = await fetch(`${API_BASE_URL}/admin/export/projects.csv`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to download projects CSV');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `floxa-projects-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  // Real API Keys & Integrations
  async getIntegrations() {
    return request('/admin/integrations');
  },

  async updateIntegrations(data: {
    geminiApiKey?: string;
    razorpayKeyId?: string;
    razorpayKeySecret?: string;
    smtpUser?: string;
    smtpHost?: string;
  }) {
    return request('/admin/integrations', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async testGemini(apiKey?: string) {
    return request('/admin/integrations/test-gemini', {
      method: 'POST',
      body: JSON.stringify({ apiKey }),
    });
  },

  // Data Governance
  async purgeDemoData() {
    return request('/admin/demo/purge', {
      method: 'POST',
    });
  },
};
