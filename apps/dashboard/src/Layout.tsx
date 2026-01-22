import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';

const navItems = [
  { path: '/', label: 'Dashboard', icon: '🏠' },
  { path: '/commands', label: 'Commands', icon: '⌨️' },
  { path: '/timers', label: 'Timers', icon: '⏰' },
  { path: '/alerts', label: 'Alerts', icon: '🔔' },
  { path: '/events', label: 'Events', icon: '🎉' },
  { path: '/points', label: 'Points', icon: '💰' },
  { path: '/clips', label: 'Clips', icon: '🎬' },
  { path: '/statistics', label: 'Statistics', icon: '📊' },
  { path: '/moderation', label: 'Moderation', icon: '🛡️' },
  { path: '/discord', label: 'Discord', icon: '💬' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Layout() {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    if (confirm('Are you sure you want to logout?')) {
      await logout();
    }
  };

  return (
    <div className="min-h-screen bg-[#0e0e10] text-white flex">
      {/* Sidebar */}
      <aside className="w-64 bg-[#18181b] border-r border-[#2f2f35] flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-[#2f2f35]">
          <h1 className="text-xl font-bold">
            <span className="text-[#53fc18]">Kaotic</span>Bot
          </h1>
        </div>

        {/* User info */}
        {user && (
          <div className="p-4 border-b border-[#2f2f35]">
            <div className="flex items-center gap-3">
              {user.profilePic ? (
                <img
                  src={user.profilePic}
                  alt={user.username}
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#53fc18] flex items-center justify-center text-black font-bold">
                  {user.username.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{user.displayName || user.username}</p>
                <p className="text-xs text-gray-400 truncate">
                  {user.channelSlug ? `kick.com/${user.channelSlug}` : 'No channel'}
                </p>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                user.subscriptionTier === 'pro' 
                  ? 'bg-purple-500/20 text-purple-400'
                  : user.subscriptionTier === 'enterprise'
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'bg-gray-500/20 text-gray-400'
              }`}>
                {user.subscriptionTier.charAt(0).toUpperCase() + user.subscriptionTier.slice(1)}
              </span>
              {user.botEnabled && (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400">
                  Bot Active
                </span>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-[#53fc18]/10 text-[#53fc18]'
                    : 'text-gray-400 hover:text-white hover:bg-[#2f2f35]'
                }`
              }
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-[#2f2f35]">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <span>🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
