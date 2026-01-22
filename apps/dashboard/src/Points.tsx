import { useState, useEffect } from 'react';
import { Trophy, Users, Settings, Search, Plus, Minus } from 'lucide-react';
import { getLeaderboard, getAllPointsUsers, updateUserPoints, getPointsConfig, updatePointsConfig, type PointsUser, type PointsConfig } from './apiClient';

type Tab = 'leaderboard' | 'users' | 'settings';

export default function Points() {
  const [activeTab, setActiveTab] = useState<Tab>('leaderboard');
  const [leaderboard, setLeaderboard] = useState<PointsUser[]>([]);
  const [users, setUsers] = useState<PointsUser[]>([]);
  const [config, setConfig] = useState<PointsConfig | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<number | null>(null);
  const [editPoints, setEditPoints] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [lb, u, c] = await Promise.all([
        getLeaderboard(10),
        getAllPointsUsers(100),
        getPointsConfig()
      ]);
      setLeaderboard(lb);
      setUsers(u);
      setConfig(c);
    } catch (err) {
      console.error('Failed to load points data:', err);
    }
    setLoading(false);
  };

  const handleSaveConfig = async () => {
    if (!config) return;
    try {
      await updatePointsConfig(config);
      alert('Settings saved!');
    } catch (err) {
      console.error('Failed to save config:', err);
      alert('Failed to save settings');
    }
  };

  const handleSetPoints = async (userId: number) => {
    const points = parseInt(editPoints, 10);
    if (isNaN(points)) return;
    
    try {
      await updateUserPoints(userId, points);
      setEditingUser(null);
      setEditPoints('');
      loadData();
    } catch (err) {
      console.error('Failed to update points:', err);
    }
  };

  const formatWatchTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.displayName.toLowerCase().includes(search.toLowerCase())
  );

  const tabs = [
    { id: 'leaderboard' as Tab, label: 'Leaderboard', icon: Trophy },
    { id: 'users' as Tab, label: 'Users', icon: Users },
    { id: 'settings' as Tab, label: 'Settings', icon: Settings },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">💰 Loyalty Points</h1>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-gray-800 p-1 rounded-lg w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
              activeTab === tab.id
                ? 'bg-[#53fc18] text-black'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-400">Loading...</div>
      ) : (
        <>
          {/* Leaderboard Tab */}
          {activeTab === 'leaderboard' && (
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-white mb-4">🏆 Top 10 Point Leaders</h2>
              <table className="w-full">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-700">
                    <th className="pb-3 w-16">Rank</th>
                    <th className="pb-3">User</th>
                    <th className="pb-3 text-right">Points</th>
                    <th className="pb-3 text-right">Watch Time</th>
                    <th className="pb-3 text-right">Messages</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((user, index) => (
                    <tr key={user.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                      <td className="py-3">
                        <span className={`
                          ${index === 0 ? 'text-yellow-400' : ''}
                          ${index === 1 ? 'text-gray-300' : ''}
                          ${index === 2 ? 'text-orange-400' : ''}
                          ${index > 2 ? 'text-gray-500' : ''}
                          font-bold
                        `}>
                          #{index + 1}
                        </span>
                      </td>
                      <td className="py-3">
                        <div>
                          <div className="text-white font-medium">{user.displayName}</div>
                          <div className="text-gray-500 text-sm">@{user.username}</div>
                        </div>
                      </td>
                      <td className="py-3 text-right">
                        <span className="text-[#53fc18] font-bold">{user.points.toLocaleString()}</span>
                      </td>
                      <td className="py-3 text-right text-gray-400">
                        {formatWatchTime(user.watchTime)}
                      </td>
                      <td className="py-3 text-right text-gray-400">
                        {user.messageCount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Users Tab */}
          {activeTab === 'users' && (
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:border-[#53fc18]"
                  />
                </div>
                <span className="text-gray-400">{filteredUsers.length} users</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-700">
                      <th className="pb-3">User</th>
                      <th className="pb-3 text-right">Points</th>
                      <th className="pb-3 text-right">Watch Time</th>
                      <th className="pb-3 text-right">Messages</th>
                      <th className="pb-3 text-center">Sub</th>
                      <th className="pb-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                        <td className="py-3">
                          <div>
                            <div className="text-white font-medium">{user.displayName}</div>
                            <div className="text-gray-500 text-sm">@{user.username}</div>
                          </div>
                        </td>
                        <td className="py-3 text-right">
                          {editingUser === user.id ? (
                            <input
                              type="number"
                              value={editPoints}
                              onChange={(e) => setEditPoints(e.target.value)}
                              className="w-24 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-right"
                              autoFocus
                            />
                          ) : (
                            <span className="text-[#53fc18] font-bold">{user.points.toLocaleString()}</span>
                          )}
                        </td>
                        <td className="py-3 text-right text-gray-400">
                          {formatWatchTime(user.watchTime)}
                        </td>
                        <td className="py-3 text-right text-gray-400">
                          {user.messageCount.toLocaleString()}
                        </td>
                        <td className="py-3 text-center">
                          {user.isSubscriber ? (
                            <span className="text-[#53fc18]">✓</span>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          {editingUser === user.id ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleSetPoints(user.id)}
                                className="px-2 py-1 bg-[#53fc18] text-black rounded text-sm"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => { setEditingUser(null); setEditPoints(''); }}
                                className="px-2 py-1 bg-gray-600 text-white rounded text-sm"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setEditingUser(user.id); setEditPoints(user.points.toString()); }}
                              className="text-gray-400 hover:text-white"
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && config && (
            <div className="bg-gray-800 rounded-lg p-6 max-w-xl">
              <h2 className="text-xl font-semibold text-white mb-6">⚙️ Points Settings</h2>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-gray-300 mb-2">Points per Message</label>
                  <input
                    type="number"
                    value={config.pointsPerMessage}
                    onChange={(e) => setConfig({ ...config, pointsPerMessage: parseInt(e.target.value, 10) || 0 })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#53fc18]"
                  />
                  <p className="text-gray-500 text-sm mt-1">Points awarded for each chat message</p>
                </div>

                <div>
                  <label className="block text-gray-300 mb-2">Message Cooldown (seconds)</label>
                  <input
                    type="number"
                    value={config.messageCooldownSeconds}
                    onChange={(e) => setConfig({ ...config, messageCooldownSeconds: parseInt(e.target.value, 10) || 0 })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#53fc18]"
                  />
                  <p className="text-gray-500 text-sm mt-1">Time between earning message points (prevents spam)</p>
                </div>

                <div>
                  <label className="block text-gray-300 mb-2">Points per Minute Watching</label>
                  <input
                    type="number"
                    value={config.pointsPerMinuteWatching}
                    onChange={(e) => setConfig({ ...config, pointsPerMinuteWatching: parseInt(e.target.value, 10) || 0 })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#53fc18]"
                  />
                  <p className="text-gray-500 text-sm mt-1">Points earned per minute of watch time</p>
                </div>

                <div>
                  <label className="block text-gray-300 mb-2">Subscriber Multiplier</label>
                  <input
                    type="number"
                    step="0.1"
                    value={config.subMultiplier}
                    onChange={(e) => setConfig({ ...config, subMultiplier: parseFloat(e.target.value) || 1 })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#53fc18]"
                  />
                  <p className="text-gray-500 text-sm mt-1">Point multiplier for subscribers (e.g., 2.0 = double points)</p>
                </div>

                <button
                  onClick={handleSaveConfig}
                  className="w-full bg-[#53fc18] text-black font-semibold py-3 rounded-lg hover:bg-[#4ae614] transition-colors"
                >
                  Save Settings
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
