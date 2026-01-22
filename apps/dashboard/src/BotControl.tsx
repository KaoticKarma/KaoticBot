import { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3000' : '';

interface BotStatus {
  enabled: boolean;
  status: string;
  channelSlug?: string;
  connectedAt?: string;
  messageCount?: number;
  lastError?: string;
  hasChannel: boolean;
}

export default function BotControl() {
  const { user } = useAuth();
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/bot/status`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch bot status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Poll status every 10 seconds
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const enableBot = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/bot/enable`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setStatus(data.status || { enabled: true, status: 'connected', hasChannel: true });
      } else {
        setError(data.error || 'Failed to enable bot');
      }
    } catch (err) {
      setError('Failed to enable bot');
    } finally {
      setActionLoading(false);
    }
  };

  const disableBot = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/bot/disable`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setStatus({ enabled: false, status: 'disconnected', hasChannel: status?.hasChannel || false });
      } else {
        setError(data.error || 'Failed to disable bot');
      }
    } catch (err) {
      setError('Failed to disable bot');
    } finally {
      setActionLoading(false);
    }
  };

  const sendTestMessage = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/bot/test-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: 'Test message from ChaosSquadBot! 🤖' }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Failed to send test message');
      }
    } catch (err) {
      setError('Failed to send test message');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-[#18181b] rounded-xl p-6 border border-[#2f2f35]">
        <div className="animate-pulse">
          <div className="h-6 w-32 bg-[#2f2f35] rounded mb-4"></div>
          <div className="h-20 bg-[#2f2f35] rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#18181b] rounded-xl p-6 border border-[#2f2f35]">
      <h2 className="text-lg font-semibold text-white mb-4">Bot Control</h2>

      {!status?.hasChannel && (
        <div className="mb-4 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <p className="text-yellow-400 text-sm">
            ⚠️ No channel found for your account. Make sure you have a Kick channel set up.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-4 mb-6">
        {/* Status indicator */}
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${
              status?.enabled
                ? 'bg-green-500 animate-pulse'
                : 'bg-gray-500'
            }`}
          />
          <span className="text-gray-300">
            {status?.enabled ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        {/* Channel info */}
        {status?.channelSlug && (
          <span className="text-gray-500 text-sm">
            • kick.com/{status.channelSlug}
          </span>
        )}
      </div>

      {/* Stats */}
      {status?.enabled && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-[#0e0e10] rounded-lg p-4">
            <p className="text-gray-500 text-xs uppercase mb-1">Messages Processed</p>
            <p className="text-2xl font-bold text-white">
              {status.messageCount?.toLocaleString() || 0}
            </p>
          </div>
          <div className="bg-[#0e0e10] rounded-lg p-4">
            <p className="text-gray-500 text-xs uppercase mb-1">Connected Since</p>
            <p className="text-sm text-white">
              {status.connectedAt
                ? new Date(status.connectedAt).toLocaleString()
                : '-'}
            </p>
          </div>
        </div>
      )}

      {/* Error display */}
      {status?.lastError && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-red-400 text-sm">{status.lastError}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {status?.enabled ? (
          <>
            <button
              onClick={disableBot}
              disabled={actionLoading}
              className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors disabled:opacity-50"
            >
              {actionLoading ? 'Disabling...' : 'Disable Bot'}
            </button>
            <button
              onClick={sendTestMessage}
              disabled={actionLoading}
              className="px-4 py-2 bg-[#2f2f35] hover:bg-[#3f3f45] text-gray-300 rounded-lg transition-colors disabled:opacity-50"
            >
              Send Test Message
            </button>
          </>
        ) : (
          <button
            onClick={enableBot}
            disabled={actionLoading || !status?.hasChannel}
            className="px-6 py-2 bg-[#53fc18] hover:bg-[#45d614] text-black font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {actionLoading ? 'Enabling...' : 'Enable Bot'}
          </button>
        )}

        <button
          onClick={fetchStatus}
          disabled={actionLoading}
          className="px-4 py-2 bg-[#2f2f35] hover:bg-[#3f3f45] text-gray-300 rounded-lg transition-colors disabled:opacity-50"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
