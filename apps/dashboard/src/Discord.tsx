// Discord.tsx - Discord Bot Integration Settings
import { useState, useEffect } from 'react';

interface DiscordSettings {
  id: number | null;
  guildId: string | null;
  channelId: string | null;
  pingEveryone: boolean;
  pingRoleId: string | null;
  customMessage: string;
  goLiveEnabled: boolean;
  offlineEnabled: boolean;
  embedColor: string;
  offlineColor: string;
}

interface Guild {
  id: string;
  name: string;
}

interface Channel {
  id: string;
  name: string;
}

interface Role {
  id: string;
  name: string;
}

interface DiscordStatus {
  connected: boolean;
  inviteUrl: string;
  guilds: Guild[];
}

interface StreamStatus {
  isLive: boolean;
  stats: {
    duration: number;
    durationFormatted: string;
    peakViewers: number;
    totalMessages: number;
    uniqueChatters: number;
    newFollowers: number;
    newSubs: number;
    giftedSubs: number;
    title: string;
    category: string;
  } | null;
}

const defaultSettings: DiscordSettings = {
  id: null,
  guildId: null,
  channelId: null,
  pingEveryone: true,
  pingRoleId: null,
  customMessage: 'Come hang out! 🎮',
  goLiveEnabled: true,
  offlineEnabled: true,
  embedColor: '#53fc18',
  offlineColor: '#ff6b6b',
};

export default function Discord() {
  const [settings, setSettings] = useState<DiscordSettings>(defaultSettings);
  const [discordStatus, setDiscordStatus] = useState<DiscordStatus | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>({ isLive: false, stats: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchDiscordStatus();
    fetchSettings();
    fetchStreamStatus();
    
    const interval = setInterval(fetchStreamStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (settings.guildId) {
      fetchChannelsAndRoles(settings.guildId);
    } else {
      setChannels([]);
      setRoles([]);
    }
  }, [settings.guildId]);

  const fetchDiscordStatus = async () => {
    try {
      const res = await fetch('/api/discord/status');
      if (res.ok) {
        const data = await res.json();
        setDiscordStatus(data);
      }
    } catch (error) {
      console.error('Failed to fetch Discord status:', error);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/discord/settings', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSettings({ ...defaultSettings, ...data });
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchChannelsAndRoles = async (guildId: string) => {
    setLoadingChannels(true);
    try {
      const [channelsRes, rolesRes] = await Promise.all([
        fetch(`/api/discord/guilds/${guildId}/channels`),
        fetch(`/api/discord/guilds/${guildId}/roles`),
      ]);
      
      if (channelsRes.ok) {
        const data = await channelsRes.json();
        setChannels(data.channels || []);
      }
      
      if (rolesRes.ok) {
        const data = await rolesRes.json();
        setRoles(data.roles || []);
      }
    } catch (error) {
      console.error('Failed to fetch channels/roles:', error);
    } finally {
      setLoadingChannels(false);
    }
  };

  const fetchStreamStatus = async () => {
    try {
      const res = await fetch('/api/discord/stream-status');
      if (res.ok) {
        const data = await res.json();
        setStreamStatus(data);
      }
    } catch (error) {
      // Stream status endpoint may not exist yet
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    setMessage(null);
    
    try {
      const res = await fetch('/api/discord/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          guildId: settings.guildId,
          channelId: settings.channelId,
          pingEveryone: settings.pingEveryone,
          pingRoleId: settings.pingRoleId,
          customMessage: settings.customMessage,
          goLiveEnabled: settings.goLiveEnabled,
          offlineEnabled: settings.offlineEnabled,
          embedColor: settings.embedColor,
          offlineColor: settings.offlineColor,
        }),
      });
      
      if (res.ok) {
        setMessage({ type: 'success', text: 'Settings saved successfully!' });
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.error || 'Failed to save settings' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const testNotification = async () => {
    setTesting(true);
    setMessage(null);
    
    try {
      const res = await fetch('/api/discord/test', { 
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      
      if (res.ok) {
        setMessage({ type: 'success', text: 'Test message sent! Check your Discord channel.' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to send test message' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to send test message' });
    } finally {
      setTesting(false);
    }
  };

  const handleGuildChange = (guildId: string) => {
    setSettings({ 
      ...settings, 
      guildId: guildId || null, 
      channelId: null,
      pingRoleId: null,
    });
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">Loading Discord settings...</div>
      </div>
    );
  }

  const selectedGuild = discordStatus?.guilds.find(g => g.id === settings.guildId);
  const selectedChannel = channels.find(c => c.id === settings.channelId);
  const isConfigured = settings.guildId && settings.channelId;

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <span className="text-2xl">🤖</span> Discord Integration
      </h1>

      {/* Status Message */}
      {message && (
        <div className={`mb-6 p-4 rounded-lg ${
          message.type === 'success' 
            ? 'bg-green-500/20 border border-green-500/50 text-green-400' 
            : 'bg-red-500/20 border border-red-500/50 text-red-400'
        }`}>
          {message.text}
        </div>
      )}

      {/* Bot Status Card */}
      <div className="bg-zinc-800/50 rounded-lg p-4 mb-6 border border-zinc-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${discordStatus?.connected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="font-medium">
              {discordStatus?.connected ? 'KaoticBot Connected' : 'KaoticBot Offline'}
            </span>
          </div>
          
          {isConfigured && discordStatus?.connected && (
            <button
              onClick={testNotification}
              disabled={testing}
              className="px-4 py-2 bg-[#53fc18] hover:bg-[#45d614] disabled:opacity-50 text-black font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              {testing ? (
                <>
                  <span className="animate-spin">⏳</span> Sending...
                </>
              ) : (
                <>
                  <span>📤</span> Test Notification
                </>
              )}
            </button>
          )}
        </div>
        
        {!discordStatus?.connected && (
          <div className="mt-3 text-sm text-zinc-400">
            The Discord bot is not connected. Please contact an administrator.
          </div>
        )}
        
        {discordStatus?.connected && discordStatus.guilds.length === 0 && (
          <div className="mt-4 p-4 bg-zinc-900/50 rounded-lg">
            <p className="text-zinc-300 mb-3">
              KaoticBot isn't in any Discord servers yet. Add it to your server to enable notifications.
            </p>
            <a
              href={discordStatus.inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#5865F2] hover:bg-[#4752C4] text-white font-medium rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
              Add KaoticBot to Discord
            </a>
          </div>
        )}
      </div>

      {/* Server & Channel Selection */}
      {discordStatus?.connected && discordStatus.guilds.length > 0 && (
        <div className="bg-zinc-800/50 rounded-lg p-6 mb-6 border border-zinc-700">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span>🖥️</span> Server & Channel
          </h2>
          
          <div className="grid grid-cols-2 gap-4">
            {/* Server Selection */}
            <div>
              <label className="block text-sm font-medium mb-2">Discord Server</label>
              <select
                value={settings.guildId || ''}
                onChange={(e) => handleGuildChange(e.target.value)}
                className="w-full px-4 py-2 bg-zinc-900 border border-zinc-600 rounded-lg focus:outline-none focus:border-[#53fc18]"
              >
                <option value="">Select a server...</option>
                {discordStatus.guilds.map((guild) => (
                  <option key={guild.id} value={guild.id}>
                    {guild.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-zinc-500 mt-1">
                Select the server where notifications will be sent
              </p>
            </div>
            
            {/* Channel Selection */}
            <div>
              <label className="block text-sm font-medium mb-2">Notification Channel</label>
              <select
                value={settings.channelId || ''}
                onChange={(e) => setSettings({ ...settings, channelId: e.target.value || null })}
                disabled={!settings.guildId || loadingChannels}
                className="w-full px-4 py-2 bg-zinc-900 border border-zinc-600 rounded-lg focus:outline-none focus:border-[#53fc18] disabled:opacity-50"
              >
                <option value="">
                  {loadingChannels ? 'Loading channels...' : 'Select a channel...'}
                </option>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    #{channel.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-zinc-500 mt-1">
                Where go-live and offline notifications appear
              </p>
            </div>
          </div>
          
          {/* Current Selection Display */}
          {isConfigured && (
            <div className="mt-4 p-3 bg-zinc-900/50 rounded-lg flex items-center gap-2 text-sm">
              <span className="text-green-400">✓</span>
              <span>
                Notifications will be sent to <strong>#{selectedChannel?.name}</strong> in <strong>{selectedGuild?.name}</strong>
              </span>
            </div>
          )}
          
          {/* Add to another server link */}
          <div className="mt-4 text-sm">
            <a
              href={discordStatus.inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#53fc18] hover:underline"
            >
              + Add KaoticBot to another server
            </a>
          </div>
        </div>
      )}

      {/* Notification Settings */}
      <div className="bg-zinc-800/50 rounded-lg p-6 mb-6 border border-zinc-700">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>🔔</span> Notification Settings
        </h2>
        
        <div className="space-y-4">
          {/* Ping Options */}
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Ping @everyone</div>
              <div className="text-sm text-zinc-400">Mention everyone when stream goes live</div>
            </div>
            <button
              onClick={() => setSettings({ ...settings, pingEveryone: !settings.pingEveryone, pingRoleId: null })}
              className={`w-12 h-6 rounded-full transition-colors ${
                settings.pingEveryone ? 'bg-[#53fc18]' : 'bg-zinc-600'
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                settings.pingEveryone ? 'translate-x-6' : 'translate-x-0.5'
              }`} />
            </button>
          </div>
          
          {/* Role Ping (alternative to @everyone) */}
          {!settings.pingEveryone && settings.guildId && (
            <div>
              <label className="block text-sm font-medium mb-2">Ping Role (optional)</label>
              <select
                value={settings.pingRoleId || ''}
                onChange={(e) => setSettings({ ...settings, pingRoleId: e.target.value || null })}
                className="w-full px-4 py-2 bg-zinc-900 border border-zinc-600 rounded-lg focus:outline-none focus:border-[#53fc18]"
              >
                <option value="">No role ping</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    @{role.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-zinc-500 mt-1">
                Ping a specific role instead of @everyone
              </p>
            </div>
          )}

          {/* Go Live Enabled */}
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Go-Live Notifications</div>
              <div className="text-sm text-zinc-400">Send notification when stream starts</div>
            </div>
            <button
              onClick={() => setSettings({ ...settings, goLiveEnabled: !settings.goLiveEnabled })}
              className={`w-12 h-6 rounded-full transition-colors ${
                settings.goLiveEnabled ? 'bg-[#53fc18]' : 'bg-zinc-600'
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                settings.goLiveEnabled ? 'translate-x-6' : 'translate-x-0.5'
              }`} />
            </button>
          </div>

          {/* Offline Enabled */}
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Offline Notifications</div>
              <div className="text-sm text-zinc-400">Update message when stream ends with stats</div>
            </div>
            <button
              onClick={() => setSettings({ ...settings, offlineEnabled: !settings.offlineEnabled })}
              className={`w-12 h-6 rounded-full transition-colors ${
                settings.offlineEnabled ? 'bg-[#53fc18]' : 'bg-zinc-600'
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                settings.offlineEnabled ? 'translate-x-6' : 'translate-x-0.5'
              }`} />
            </button>
          </div>

          {/* Custom Message */}
          <div>
            <label className="block text-sm font-medium mb-2">Custom Message</label>
            <textarea
              value={settings.customMessage}
              onChange={(e) => setSettings({ ...settings, customMessage: e.target.value })}
              placeholder="Come hang out! 🎮"
              rows={2}
              className="w-full px-4 py-2 bg-zinc-900 border border-zinc-600 rounded-lg focus:outline-none focus:border-[#53fc18] resize-none"
            />
            <p className="text-xs text-zinc-500 mt-1">
              This message appears in the embed description
            </p>
          </div>
        </div>
      </div>

      {/* Embed Colors */}
      <div className="bg-zinc-800/50 rounded-lg p-6 mb-6 border border-zinc-700">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>🎨</span> Embed Colors
        </h2>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Live Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={settings.embedColor}
                onChange={(e) => setSettings({ ...settings, embedColor: e.target.value })}
                className="w-12 h-10 rounded cursor-pointer border-0"
              />
              <input
                type="text"
                value={settings.embedColor}
                onChange={(e) => setSettings({ ...settings, embedColor: e.target.value })}
                className="flex-1 px-4 py-2 bg-zinc-900 border border-zinc-600 rounded-lg focus:outline-none focus:border-[#53fc18] font-mono text-sm"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Offline Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={settings.offlineColor}
                onChange={(e) => setSettings({ ...settings, offlineColor: e.target.value })}
                className="w-12 h-10 rounded cursor-pointer border-0"
              />
              <input
                type="text"
                value={settings.offlineColor}
                onChange={(e) => setSettings({ ...settings, offlineColor: e.target.value })}
                className="flex-1 px-4 py-2 bg-zinc-900 border border-zinc-600 rounded-lg focus:outline-none focus:border-[#53fc18] font-mono text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Stream Status (if live) */}
      {streamStatus.isLive && streamStatus.stats && (
        <div className="bg-zinc-800/50 rounded-lg p-4 mb-6 border border-zinc-700">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <span className="font-medium">Currently Live</span>
          </div>
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div className="bg-zinc-900/50 p-3 rounded">
              <div className="text-zinc-400">Duration</div>
              <div className="font-medium">{streamStatus.stats.durationFormatted}</div>
            </div>
            <div className="bg-zinc-900/50 p-3 rounded">
              <div className="text-zinc-400">Peak Viewers</div>
              <div className="font-medium">{streamStatus.stats.peakViewers}</div>
            </div>
            <div className="bg-zinc-900/50 p-3 rounded">
              <div className="text-zinc-400">Messages</div>
              <div className="font-medium">{streamStatus.stats.totalMessages}</div>
            </div>
            <div className="bg-zinc-900/50 p-3 rounded">
              <div className="text-zinc-400">Chatters</div>
              <div className="font-medium">{streamStatus.stats.uniqueChatters}</div>
            </div>
          </div>
        </div>
      )}

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={saveSettings}
          disabled={saving}
          className="px-6 py-3 bg-[#53fc18] hover:bg-[#45d614] disabled:opacity-50 text-black font-semibold rounded-lg transition-colors"
        >
          {saving ? 'Saving...' : '💾 Save Settings'}
        </button>
      </div>

      {/* Setup Guide */}
      <div className="mt-8 bg-zinc-800/30 rounded-lg p-6 border border-zinc-700/50">
        <h3 className="font-semibold mb-4 flex items-center gap-2 text-lg">
          <span>📋</span> Setup Guide
        </h3>
        
        <div className="space-y-4">
          {/* Step 1 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-[#53fc18] text-black rounded-full flex items-center justify-center font-bold">
              1
            </div>
            <div>
              <div className="font-medium mb-1">Add KaoticBot to your Discord server</div>
              <p className="text-sm text-zinc-400 mb-2">
                Click the button below to invite KaoticBot with the required permissions.
              </p>
              {discordStatus?.inviteUrl && (
                <a
                  href={discordStatus.inviteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                  </svg>
                  Add to Discord
                </a>
              )}
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-[#53fc18] text-black rounded-full flex items-center justify-center font-bold">
              2
            </div>
            <div>
              <div className="font-medium mb-1">Select your notification channel</div>
              <p className="text-sm text-zinc-400">
                Choose the Discord server and channel where you want notifications to appear. 
                Make sure KaoticBot has permission to send messages in that channel.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-[#53fc18] text-black rounded-full flex items-center justify-center font-bold">
              3
            </div>
            <div>
              <div className="font-medium mb-1">Mod KaoticBot on Kick</div>
              <p className="text-sm text-zinc-400 mb-2">
                For moderation features to work (timeout, ban, delete messages), you need to make KaoticBot a moderator in your Kick chat.
              </p>
              <div className="bg-zinc-900 rounded-lg px-4 py-2 font-mono text-sm text-[#53fc18] inline-block">
                /mod KaoticBot
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                Run this command in your Kick chat while streaming
              </p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-[#53fc18] text-black rounded-full flex items-center justify-center font-bold">
              4
            </div>
            <div>
              <div className="font-medium mb-1">Test your setup</div>
              <p className="text-sm text-zinc-400">
                Click the "Test Notification" button above to verify everything is working correctly.
              </p>
            </div>
          </div>
        </div>

        {/* Troubleshooting */}
        <div className="mt-6 pt-4 border-t border-zinc-700/50">
          <h4 className="font-medium mb-2 flex items-center gap-2">
            <span>🔧</span> Troubleshooting
          </h4>
          <ul className="text-sm text-zinc-400 space-y-1">
            <li>• <strong>Bot can't send messages?</strong> Check channel permissions - KaoticBot needs "Send Messages" and "Embed Links"</li>
            <li>• <strong>Channel not showing?</strong> Make sure KaoticBot has "View Channel" permission</li>
            <li>• <strong>Moderation not working?</strong> Run <code className="text-[#53fc18]">/mod KaoticBot</code> in your Kick chat</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
