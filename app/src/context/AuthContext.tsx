import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, initApiBaseUrl } from '../services/api';
import { storage } from '../services/storage';
import { socketService } from '../services/socket';
import { registerForPushNotificationsAsync } from '../services/notifications';
import { AuthState, ConsultantUser, ClientProjectUser, UserRole } from '../types';

interface AuthContextType extends AuthState {
  loginConsultant: (email: string, password: string) => Promise<void>;
  loginClient: (portalToken: string, clientEmail?: string, portalPassword?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updatedUser: any) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    role: null,
    user: null,
    token: null,
    portalToken: null,
  });

  // Restore session on app launch
  useEffect(() => {
    async function restoreSession() {
      try {
        await initApiBaseUrl();
        const role = (await storage.getItem(storage.KEYS.USER_ROLE)) as UserRole | null;
        const accessToken = await storage.getItem(storage.KEYS.ACCESS_TOKEN);
        const portalToken = await storage.getItem(storage.KEYS.PORTAL_TOKEN);
        const profileStr = await storage.getItem(storage.KEYS.USER_PROFILE);

        if (role === 'consultant' && accessToken) {
          let user: ConsultantUser | null = null;
          if (profileStr) {
            try {
              user = JSON.parse(profileStr);
            } catch {}
          }
          setState({
            isAuthenticated: true,
            isLoading: false,
            role: 'consultant',
            user,
            token: accessToken,
            portalToken: null,
          });
          socketService.connect();
          registerForPushNotificationsAsync('consultant').catch(() => {});
          return;
        }

        if (role === 'client' && portalToken) {
          let clientUser: ClientProjectUser | null = null;
          if (profileStr) {
            try {
              clientUser = JSON.parse(profileStr);
            } catch {}
          }
          setState({
            isAuthenticated: true,
            isLoading: false,
            role: 'client',
            user: clientUser,
            token: null,
            portalToken,
          });
          socketService.connect();
          registerForPushNotificationsAsync('client', portalToken).catch(() => {});
          return;
        }

        setState((prev) => ({ ...prev, isLoading: false }));
      } catch {
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    }

    restoreSession();
  }, []);

  const loginConsultant = async (email: string, password: string) => {
    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      const response = await api.post('/auth/login/', {
        email: email.trim().toLowerCase(),
        password,
      });

      const { access, refresh, consultant } = response.data;

      await storage.setItem(storage.KEYS.ACCESS_TOKEN, access);
      if (refresh) await storage.setItem(storage.KEYS.REFRESH_TOKEN, refresh);
      await storage.setItem(storage.KEYS.USER_ROLE, 'consultant');
      await storage.setItem(storage.KEYS.USER_PROFILE, JSON.stringify(consultant));

      setState({
        isAuthenticated: true,
        isLoading: false,
        role: 'consultant',
        user: consultant,
        token: access,
        portalToken: null,
      });

      socketService.connect();
      registerForPushNotificationsAsync('consultant').catch(() => {});
    } catch (err: any) {
      setState((prev) => ({ ...prev, isLoading: false }));
      const msg = err.response?.data?.detail || err.message || 'Login failed';
      throw new Error(msg);
    }
  };

  const loginClient = async (portalTokenInput: string, clientEmail?: string, portalPassword?: string) => {
    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      const cleanToken = portalTokenInput.trim().replace(/^.*\/client\//i, '').replace(/\/+$/, '');
      let portalAccessToken: string | null = await storage.getItem(storage.KEYS.PORTAL_ACCESS_TOKEN);

      if (clientEmail && portalPassword) {
        const verifyRes = await api.post(`/client-portal/${cleanToken}/verify-password/`, {
          email: clientEmail.trim().toLowerCase(),
          password: portalPassword,
        });
        if (verifyRes.data?.access_token) {
          portalAccessToken = String(verifyRes.data.access_token);
          await storage.setItem(storage.KEYS.PORTAL_ACCESS_TOKEN, portalAccessToken);
        }
      }

      const headers: Record<string, string> = { 'x-client-portal-token': cleanToken };
      if (portalAccessToken) {
        headers['x-portal-access-token'] = portalAccessToken;
      }

      const response = await api.get(`/client-portal/${cleanToken}/`, { headers });

      const project = response.data;
      const clientUser: ClientProjectUser = {
        id: project.id || project._id,
        projectId: project.id || project._id,
        portalToken: cleanToken,
        clientName: project.client?.name || project.company_name || 'Client',
        projectTitle: project.title || 'Brand Project',
        companyName: project.company_name || '',
        consultantName: project.consultant?.name || 'Assigned Consultant',
      };

      await storage.setItem(storage.KEYS.PORTAL_TOKEN, cleanToken);
      await storage.setItem(storage.KEYS.USER_ROLE, 'client');
      await storage.setItem(storage.KEYS.USER_PROFILE, JSON.stringify(clientUser));

      setState({
        isAuthenticated: true,
        isLoading: false,
        role: 'client',
        user: clientUser,
        token: null,
        portalToken: cleanToken,
      });

      socketService.connect();
      registerForPushNotificationsAsync('client', cleanToken).catch(() => {});
    } catch (err: any) {
      setState((prev) => ({ ...prev, isLoading: false }));
      const detail = err.response?.data?.detail || 'Invalid portal token or project not found';
      const wrapped: any = new Error(detail);
      if (err.response?.status === 403 && String(detail).toLowerCase().includes('password')) {
        wrapped.requiresPortalPassword = true;
      }
      throw wrapped;
    }
  };

  const updateUser = async (updatedUser: any) => {
    setState((prev) => ({
      ...prev,
      user: {
        ...(prev.user || {}),
        ...updatedUser,
      },
    }));
    try {
      const merged = {
        ...(state.user || {}),
        ...updatedUser,
      };
      await storage.setItem(storage.KEYS.USER_PROFILE, JSON.stringify(merged));
    } catch {}
  };

  const logout = async () => {
    socketService.disconnect();
    try {
      if (state.role === 'consultant') {
        await api.post('/auth/logout/').catch(() => {});
      }
    } finally {
      await storage.removeItem(storage.KEYS.ACCESS_TOKEN);
      await storage.removeItem(storage.KEYS.REFRESH_TOKEN);
      await storage.removeItem(storage.KEYS.USER_ROLE);
      await storage.removeItem(storage.KEYS.PORTAL_TOKEN);
      await storage.removeItem(storage.KEYS.PORTAL_ACCESS_TOKEN);
      await storage.removeItem(storage.KEYS.USER_PROFILE);

      setState({
        isAuthenticated: false,
        isLoading: false,
        role: null,
        user: null,
        token: null,
        portalToken: null,
      });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        loginConsultant,
        loginClient,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

