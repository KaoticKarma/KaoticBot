import type { Command, Timer, Alert, Counter, AuthStatus } from './types';

const API_BASE = '/api';

export interface BotStats {
  messagesProcessed: number;
  commandsExecuted: number;
  uptime: number;
}

export interface PointsUser {
  id: number;
  username: string;
  displayName: string;
  points: number;
  watchTime: number;
  messageCount: number;
  isSubscriber: boolean;
  isFollower: boolean;
  rank?: number;
}

export interface PointsConfig {
  pointsPerMessage: number;
  messageCooldownSeconds: number;
  pointsPerMinuteWatching: number;
  subMultiplier: number;
}

// ============================================
// TTS Types
// ============================================

export interface TTSSettings {
  id: number;
  enabled: boolean;
  defaultVoice: string;
  minUserLevel: string;
  pointsCost: number;
  cooldownSeconds: number;
  maxMessageLength: number;
  volume: number;
}

export interface TTSVoice {
  id: number;
  name: string;
  modelToken: string;
  enabled: boolean;
  sortOrder: number;
}

export interface TTSQueueItem {
  id: number;
  username: string;
  userId: number | null;
  message: string;
  voice: string;
  voiceName: string | null;
  status: 'pending' | 'processing' | 'ready' | 'playing' | 'completed' | 'failed';
  audioUrl: string | null;
  errorMessage: string | null;
  pointsSpent: number;
  createdAt: string;
  playedAt: string | null;
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include', // IMPORTANT: Send cookies with requests!
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  return response.json();
}

export const getAuthStatus = () => fetchApi<AuthStatus>('/auth/status');

export const getCommands = () => fetchApi<Command[]>('/commands');

export const createCommand = (command: Omit<Command, 'id' | 'usageCount'>) =>
  fetchApi<Command>('/commands', {
    method: 'POST',
    body: JSON.stringify(command),
  });

export const updateCommand = (id: number, command: Partial<Command>) =>
  fetchApi<Command>(`/commands/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(command),
  });

export const deleteCommand = (id: number) =>
  fetchApi<void>(`/commands/${id}`, { method: 'DELETE' });

export const getTimers = () => fetchApi<Timer[]>('/timers');

export const createTimer = (timer: Omit<Timer, 'id' | 'lastTriggered'>) =>
  fetchApi<Timer>('/timers', {
    method: 'POST',
    body: JSON.stringify(timer),
  });

export const updateTimer = (id: number, timer: Partial<Timer>) =>
  fetchApi<Timer>(`/timers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(timer),
  });

export const deleteTimer = (id: number) =>
  fetchApi<void>(`/timers/${id}`, { method: 'DELETE' });

export const getAlerts = () => fetchApi<Alert[]>('/alerts');

export const createAlert = (alert: Omit<Alert, 'id'>) =>
  fetchApi<Alert>('/alerts', {
    method: 'POST',
    body: JSON.stringify(alert),
  });

export const updateAlert = (id: number, alert: Partial<Alert>) =>
  fetchApi<Alert>(`/alerts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(alert),
  });

export const deleteAlert = (id: number) =>
  fetchApi<void>(`/alerts/${id}`, { method: 'DELETE' });

export const testAlert = (type: string, username?: string, amount?: number) =>
  fetchApi<void>('/alerts/test', {
    method: 'POST',
    body: JSON.stringify({ type, username, amount }),
  });

export const skipAlert = () =>
  fetchApi<void>('/alerts/skip', { method: 'POST' });

export const getAlertQueue = () =>
  fetchApi<{ current: any; queue: any[] }>('/alerts/queue');

export const getStats = () => fetchApi<BotStats>('/stats');

export const getCounters = () => fetchApi<Counter[]>('/counters');

export const setCounter = (name: string, value: number) =>
  fetchApi<void>('/counters', {
    method: 'POST',
    body: JSON.stringify({ name, value }),
  });

// ============================================
// Points API
// ============================================

export const getLeaderboard = (limit: number = 10) =>
  fetchApi<PointsUser[]>(`/points/leaderboard?limit=${limit}`);

export const getAllPointsUsers = (limit: number = 100, offset: number = 0) =>
  fetchApi<PointsUser[]>(`/points/users?limit=${limit}&offset=${offset}`);

export const getPointsUser = (id: number) =>
  fetchApi<PointsUser>(`/points/users/${id}`);

export const updateUserPoints = (id: number, points: number) =>
  fetchApi<{ success: boolean }>(`/points/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ points }),
  });

export const addUserPoints = (id: number, amount: number) =>
  fetchApi<{ success: boolean; newBalance: number }>(`/points/users/${id}/add`, {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });

export const removeUserPoints = (id: number, amount: number) =>
  fetchApi<{ success: boolean }>(`/points/users/${id}/remove`, {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });

export const getPointsConfig = () =>
  fetchApi<PointsConfig>('/points/config');

export const updatePointsConfig = (config: Partial<PointsConfig>) =>
  fetchApi<{ success: boolean; config: PointsConfig }>('/points/config', {
    method: 'PUT',
    body: JSON.stringify(config),
  });

// ============================================
// TTS API
// ============================================

export const getTTSSettings = () =>
  fetchApi<TTSSettings>('/tts/settings');

export const updateTTSSettings = (settings: Partial<TTSSettings>) =>
  fetchApi<{ success: boolean; settings: TTSSettings }>('/tts/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });

export const getTTSVoices = () =>
  fetchApi<TTSVoice[]>('/tts/voices');

export const getEnabledTTSVoices = () =>
  fetchApi<TTSVoice[]>('/tts/voices/enabled');

export const updateTTSVoice = (id: number, updates: Partial<TTSVoice>) =>
  fetchApi<{ success: boolean; voice: TTSVoice }>(`/tts/voices/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });

export const addTTSVoice = (name: string, modelToken: string) =>
  fetchApi<{ success: boolean; voice: TTSVoice }>('/tts/voices', {
    method: 'POST',
    body: JSON.stringify({ name, modelToken }),
  });

export const deleteTTSVoice = (id: number) =>
  fetchApi<{ success: boolean }>(`/tts/voices/${id}`, {
    method: 'DELETE',
  });

export const getTTSQueue = () =>
  fetchApi<{ queue: TTSQueueItem[]; current: TTSQueueItem | null }>('/tts/queue');

export const getTTSHistory = (limit: number = 50) =>
  fetchApi<TTSQueueItem[]>(`/tts/history?limit=${limit}`);

export const addToTTSQueue = (username: string, message: string, voice?: string) =>
  fetchApi<{ success: boolean; error?: string; queuePosition?: number }>('/tts/queue', {
    method: 'POST',
    body: JSON.stringify({ username, message, voice }),
  });

export const skipTTS = () =>
  fetchApi<{ success: boolean }>('/tts/skip', {
    method: 'POST',
  });

export const clearTTSQueue = () =>
  fetchApi<{ success: boolean }>('/tts/clear', {
    method: 'POST',
  });

export const removeFromTTSQueue = (id: number) =>
  fetchApi<{ success: boolean }>(`/tts/queue/${id}`, {
    method: 'DELETE',
  });

export const testTTS = (text: string, voice?: string) =>
  fetchApi<{ success: boolean; audioUrl?: string; error?: string }>('/tts/test', {
    method: 'POST',
    body: JSON.stringify({ text, voice }),
  });
