import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3000' : '';

interface Overview {
  isLive: boolean;
  currentStream: {
    title: string;
    category: string;
    viewers: number;
    startedAt: string;
  } | null;
  followerCount: number;
  totalStreams: number;
  totalStreamTime: number;
  totalMessages: number;
  avgPeakViewers: number;
}

interface StreamSession {
  id: number;
  title: string;
  category: string;
  duration: number;
  peakViewers: number;
  totalMessages: number;
  uniqueChatters: number;
  startedAt: string;
  endedAt: string;
}

interface CategoryStats {
  category: string;
  streamCount: number;
  avgViewers: number;
  totalMessages: number;
}

interface Follower {
  username: string;
  followedAt: string;
}

export default function Statistics() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [streams, setStreams] = useState<StreamSession[]>([]);
  const [categories, setCategories] = useState<CategoryStats[]>([]);
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [overviewRes, streamsRes, categoriesRes, followersRes] = await Promise.all([
          fetch(`${API_BASE}/api/statistics/overview`, { credentials: 'include' }),
          fetch(`${API_BASE}/api/statistics/streams?limit=5`, { credentials: 'include' }),
          fetch(`${API_BASE}/api/statistics/categories`, { credentials: 'include' }),
          fetch(`${API_BASE}/api/statistics/followers?limit=10`, { credentials: 'include' }),
        ]);

        if (!overviewRes.ok) throw new Error('Failed to fetch overview');
        
        const overviewData = await overviewRes.json();
        const streamsData = streamsRes.ok ? await streamsRes.json() : [];
        const categoriesData = categoriesRes.ok ? await categoriesRes.json() : [];
        const followersData = followersRes.ok ? await followersRes.json() : [];

        setOverview(overviewData);
        setStreams(Array.isArray(streamsData) ? streamsData : []);
        setCategories(Array.isArray(categoriesData) ? categoriesData : []);
        setFollowers(Array.isArray(followersData) ? followersData : []);
      } catch (err) {
        console.error('Failed to fetch statistics:', err);
        setError(err instanceof Error ? err.message : 'Failed to load statistics');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTimeAgo = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateStr);
  };

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Statistics</h1>
          <p className="text-gray-400 mt-1">Stream analytics and follower insights</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
          <p className="text-red-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-400 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Statistics</h1>
        <p className="text-gray-400 mt-1">Stream analytics and follower insights</p>
      </div>

      {/* Live Status Banner */}
      {overview?.isLive && overview.currentStream && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
            <span className="text-red-400 font-semibold">LIVE</span>
          </div>
          <div className="flex-1">
            <p className="text-white font-medium">{overview.currentStream.title}</p>
            <p className="text-gray-400 text-sm">{overview.currentStream.category}</p>
          </div>
          <div className="text-right">
            <p className="text-white font-bold">{overview.currentStream.viewers.toLocaleString()}</p>
            <p className="text-gray-400 text-sm">viewers</p>
          </div>
        </div>
      )}

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Followers"
          value={overview?.followerCount ?? 0}
          icon="👥"
          loading={loading}
        />
        <StatCard
          title="Total Streams"
          value={overview?.totalStreams ?? 0}
          icon="📺"
          loading={loading}
        />
        <StatCard
          title="Stream Time"
          value={overview ? formatDuration(overview.totalStreamTime) : '0h'}
          icon="⏱️"
          loading={loading}
          isText
        />
        <StatCard
          title="Avg Peak Viewers"
          value={overview?.avgPeakViewers ?? 0}
          icon="📈"
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Followers */}
        <div className="bg-[#18181b] rounded-xl border border-[#2f2f35]">
          <div className="p-4 border-b border-[#2f2f35]">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span>👥</span>
              Recent Followers
            </h2>
          </div>
          <div className="p-4">
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-[#2f2f35] rounded-full animate-pulse"></div>
                    <div className="flex-1">
                      <div className="h-4 w-24 bg-[#2f2f35] rounded animate-pulse"></div>
                    </div>
                    <div className="h-3 w-16 bg-[#2f2f35] rounded animate-pulse"></div>
                  </div>
                ))}
              </div>
            ) : followers.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No followers data available</p>
            ) : (
              <div className="space-y-3">
                {followers.map((follower, index) => (
                  <div key={index} className="flex items-center gap-3 py-2 border-b border-[#2f2f35] last:border-0">
                    <div className="w-8 h-8 bg-[#53fc18] rounded-full flex items-center justify-center text-black font-bold text-sm">
                      {follower.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-medium">{follower.username}</p>
                    </div>
                    <p className="text-gray-500 text-sm">{formatTimeAgo(follower.followedAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Category Performance */}
        <div className="bg-[#18181b] rounded-xl border border-[#2f2f35]">
          <div className="p-4 border-b border-[#2f2f35]">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span>🎮</span>
              Category Performance
            </h2>
          </div>
          <div className="p-4">
            {loading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="p-3 bg-[#0e0e10] rounded-lg">
                    <div className="h-4 w-32 bg-[#2f2f35] rounded animate-pulse mb-2"></div>
                    <div className="h-3 w-48 bg-[#2f2f35] rounded animate-pulse"></div>
                  </div>
                ))}
              </div>
            ) : categories.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No category data available</p>
            ) : (
              <div className="space-y-3">
                {categories.map((cat, index) => (
                  <div key={index} className="p-3 bg-[#0e0e10] rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-white font-medium">{cat.category || 'Unknown'}</p>
                      <span className="text-[#53fc18] text-sm font-medium">
                        {cat.streamCount} stream{cat.streamCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex gap-4 text-sm text-gray-400">
                      <span>📊 {Math.round(cat.avgViewers)} avg viewers</span>
                      <span>💬 {cat.totalMessages.toLocaleString()} messages</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Streams */}
      <div className="bg-[#18181b] rounded-xl border border-[#2f2f35]">
        <div className="p-4 border-b border-[#2f2f35]">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <span>📺</span>
            Recent Streams
          </h2>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-4 space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 bg-[#0e0e10] rounded-lg animate-pulse"></div>
              ))}
            </div>
          ) : streams.length === 0 ? (
            <p className="text-gray-500 text-center py-12">No streams recorded yet</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#2f2f35]">
                  <th className="text-left p-4 text-gray-400 text-sm font-medium">Stream</th>
                  <th className="text-left p-4 text-gray-400 text-sm font-medium">Date</th>
                  <th className="text-center p-4 text-gray-400 text-sm font-medium">Duration</th>
                  <th className="text-center p-4 text-gray-400 text-sm font-medium">Peak Viewers</th>
                  <th className="text-center p-4 text-gray-400 text-sm font-medium">Messages</th>
                  <th className="text-center p-4 text-gray-400 text-sm font-medium">Chatters</th>
                </tr>
              </thead>
              <tbody>
                {streams.map((stream) => (
                  <tr key={stream.id} className="border-b border-[#2f2f35] last:border-0 hover:bg-[#0e0e10] transition-colors">
                    <td className="p-4">
                      <p className="text-white font-medium truncate max-w-xs">{stream.title || 'Untitled Stream'}</p>
                      <p className="text-gray-500 text-sm">{stream.category || 'No category'}</p>
                    </td>
                    <td className="p-4 text-gray-400 text-sm whitespace-nowrap">
                      {formatDate(stream.startedAt)}
                    </td>
                    <td className="p-4 text-center">
                      <span className="text-white font-medium">{formatDuration(stream.duration)}</span>
                    </td>
                    <td className="p-4 text-center">
                      <span className="text-[#53fc18] font-bold">{stream.peakViewers.toLocaleString()}</span>
                    </td>
                    <td className="p-4 text-center">
                      <span className="text-white">{stream.totalMessages.toLocaleString()}</span>
                    </td>
                    <td className="p-4 text-center">
                      <span className="text-white">{stream.uniqueChatters.toLocaleString()}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Total Messages Card */}
      <div className="bg-[#18181b] rounded-xl p-6 border border-[#2f2f35]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-sm">Total Chat Messages (All Time)</p>
            {loading ? (
              <div className="h-10 w-32 bg-[#2f2f35] rounded animate-pulse mt-2"></div>
            ) : (
              <p className="text-4xl font-bold text-white mt-2">
                {(overview?.totalMessages ?? 0).toLocaleString()}
              </p>
            )}
          </div>
          <span className="text-5xl">💬</span>
        </div>
      </div>
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
        <p className={`font-bold ${isText ? 'text-lg' : 'text-3xl'} text-white`}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
      )}
    </div>
  );
}
