import { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import BotControl from './BotControl';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3000' : '';

interface Stats {
  commands: number;
  timers: number;
  alerts: number;
  users: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ commands: 0, timers: 0, alerts: 0, users: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [commandsRes, timersRes, alertsRes, usersRes] = await Promise.all([
          fetch(`${API_BASE}/api/commands`, { credentials: 'include' }),
          fetch(`${API_BASE}/api/timers`, { credentials: 'include' }),
          fetch(`${API_BASE}/api/alerts`, { credentials: 'include' }),
          fetch(`${API_BASE}/api/points/users?limit=1`, { credentials: 'include' }),
        ]);

        const commands = commandsRes.ok ? await commandsRes.json() : [];
        const timers = timersRes.ok ? await timersRes.json() : [];
        const alerts = alertsRes.ok ? await alertsRes.json() : [];
        
        setStats({
          commands: Array.isArray(commands) ? commands.length : 0,
          timers: Array.isArray(timers) ? timers.length : 0,
          alerts: Array.isArray(alerts) ? alerts.length : 0,
          users: 0, // Would need a count endpoint
        });
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 mt-1">
          Welcome back, {user?.displayName || user?.username}!
        </p>
      </div>

      {/* Bot Control */}
      <BotControl />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Commands"
          value={stats.commands}
          icon="⌨️"
          loading={loading}
        />
        <StatCard
          title="Timers"
          value={stats.timers}
          icon="⏰"
          loading={loading}
        />
        <StatCard
          title="Alerts"
          value={stats.alerts}
          icon="🔔"
          loading={loading}
        />
        <StatCard
          title="Subscription"
          value={user?.subscriptionTier || 'Free'}
          icon="⭐"
          loading={false}
          isText
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-[#18181b] rounded-xl p-6 border border-[#2f2f35]">
        <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <QuickAction href="/commands" icon="⌨️" label="Add Command" />
          <QuickAction href="/timers" icon="⏰" label="Add Timer" />
          <QuickAction href="/alerts" icon="🔔" label="Configure Alerts" />
          <QuickAction href="/moderation" icon="🛡️" label="Moderation" />
        </div>
      </div>

      {/* Channel Info */}
      {user?.channelSlug && (
        <div className="bg-[#18181b] rounded-xl p-6 border border-[#2f2f35]">
          <h2 className="text-lg font-semibold text-white mb-4">Channel Info</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-gray-500 text-xs uppercase mb-1">Channel</p>
              <a
                href={`https://kick.com/${user.channelSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#53fc18] hover:underline"
              >
                kick.com/{user.channelSlug}
              </a>
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase mb-1">Alerts Overlay</p>
              <a
                href={`${API_BASE}/alerts/overlay`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#53fc18] hover:underline text-sm"
              >
                Open Overlay URL
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  loading,
  isText = false,
}: {
  title: string;
  value: number | string;
  icon: string;
  loading: boolean;
  isText?: boolean;
}) {
  return (
    <div className="bg-[#18181b] rounded-xl p-6 border border-[#2f2f35]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400 text-sm">{title}</span>
        <span className="text-2xl">{icon}</span>
      </div>
      {loading ? (
        <div className="h-8 w-16 bg-[#2f2f35] rounded animate-pulse"></div>
      ) : (
        <p className={`font-bold ${isText ? 'text-lg capitalize' : 'text-3xl'} text-white`}>
          {value}
        </p>
      )}
    </div>
  );
}

function QuickAction({
  href,
  icon,
  label,
}: {
  href: string;
  icon: string;
  label: string;
}) {
  return (
    <a
      href={href}
      className="flex flex-col items-center gap-2 p-4 bg-[#0e0e10] rounded-lg hover:bg-[#2f2f35] transition-colors"
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-gray-300 text-sm">{label}</span>
    </a>
  );
}
