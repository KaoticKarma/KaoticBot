// Clips.tsx - Clip Feature Settings
import { useState, useEffect } from 'react';

interface ClipSettings {
  id: number | null;
  enabled: boolean;
  defaultDuration: number;
  maxDuration: number;
  minUserLevel: string;
  cooldownSeconds: number;
  discordGuildId: string | null;
  discordChannelId: string | null;
}

interface Clip {
  id: number;
  channelSlug: string;
  channelName: string;
  filename: string;
  duration: number;
  fileSize: number;
  requestedBy: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  discordSent: boolean;
  errorMessage: string | null;
  createdAt: string;
}

interface Guild {
  id: string;
  name: string;
}

interface Channel {
  id: string;
  name: string;
}

interface DiscordStatus {
  connected: boolean;
  inviteUrl: string;
  guilds: Guild[];
}

const defaultSettings: ClipSettings = {
  id: null,
  enabled: false,
  defaultDuration: 30,
  maxDuration: 120,
  minUserLevel: 'everyone',
  cooldownSeconds: 30,
  discordGuildId: null,
  discordChannelId: null,
};

const userLevels = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'follower', label: 'Followers' },
  { value: 'subscriber', label: 'Subscribers' },
  { value: 'vip', label: 'VIPs' },
  { value: 'moderator', label: 'Moderators' },
  { value: 'broadcaster', label: 'Broadcaster Only' },
];

const durationOptions = [
  { value: 15, label: '15 seconds' },
  { value: 30, label: '30 seconds' },
  { value: 45, label: '45 seconds' },
  { value: 60, label: '60 seconds' },
  { value: 90, label: '90 seconds' },
  { value: 120, label: '120 seconds' },
];

export default function Clips() {
  const [settings, setSettings] = useState<ClipSettings>(defaultSettings);
  const [clips, setClips] = useState<Clip[]>([]);
  const [discordStatus, setDiscordStatus] = useState<DiscordStatus | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'settings' | 'history'>('settings');

  useEffect(() => {
    fetchDiscordStatus();
    fetchSettings();
    fetchClips();
  }, []);

  useEffect(() => {
    if (settings.discordGuildId) {
      fetchChannels(settings.discordGuildId);
    } else {
      setChannels([]);
    }
  }, [settings.discordGuildId]);

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
      const res = await fetch('/api/clips/settings', { credentials: 'include' });
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

  const fetchClips = async () => {
    try {
      const res = await fetch('/api/clips', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setClips(data);
      }
    } catch (error) {
      console.error('Failed to fetch clips:', error);
    }
  };

  const fetchChannels = async (guildId: string) => {
    setLoadingChannels(true);
    try {
      const res = await fetch(`/api/discord/guilds/${guildId}/channels`);
      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels || []);
      }
    } catch (error) {
      console.error('Failed to fetch channels:', error);
    } finally {
      setLoadingChannels(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/clips/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          enabled: settings.enabled,
          defaultDuration: settings.defaultDuration,
          maxDuration: settings.maxDuration,
          minUserLevel: settings.minUserLevel,
          cooldownSeconds: settings.cooldownSeconds,
          discordGuildId: settings.discordGuildId,
          discordChannelId: settings.discordChannelId,
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

  const deleteClip = async (clipId: number) => {
    if (!confirm('Are you sure you want to delete this clip?')) return;

    try {
      const res = await fetch(`/api/clips/${clipId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (res.ok) {
        setClips(clips.filter(c => c.id !== clipId));
        setMessage({ type: 'success', text: 'Clip deleted' });
      } else {
        setMessage({ type: 'error', text: 'Failed to delete clip' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to delete clip' });
    }
  };

  const handleGuildChange = (guildId: string) => {
    setSettings({
      ...settings,
      discordGuildId: guildId || null,
      discordChannelId: null,
    });
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const formatFileSize = (bytes: number): string => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleString();
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">Loading clip settings...</div>
      </div>
    );
  }

  const selectedGuild = discordStatus?.guilds.find(g => g.id === settings.discordGuildId);
  const selectedChannel = channels.find(c => c.id === settings.discordChannelId);

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <span className="text-2xl">🎬</span> Clip Command
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

      {/* Info Banner */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <span className="text-xl">ℹ️</span>
          <div>
            <p className="text-blue-400 font-medium">How it works</p>
            <p className="text-sm text-zinc-400 mt-1">
              Viewers can type <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-[#53fc18]">!clip</code> or{' '}
              <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-[#53fc18]">!clip 60</code> in chat to create a clip.
              Clips are captured from the live stream and sent to your Discord channel.
              Processing takes 1-2 minutes.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'settings'
              ? 'bg-[#53fc18] text-black'
              : 'bg-zinc-800 text-zinc-400 hover:text-white'
          }`}
        >
          ⚙️ Settings
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'history'
              ? 'bg-[#53fc18] text-black'
              : 'bg-zinc-800 text-zinc-400 hover:text-white'
          }`}
        >
          📜 Clip History ({clips.length})
        </button>
      </div>

      {activeTab === 'settings' && (
        <>
          {/* Enable/Disable */}
          <div className="bg-zinc-800/50 rounded-lg p-6 mb-6 border border-zinc-700">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Enable !clip Command</h2>
                <p className="text-sm text-zinc-400 mt-1">
                  Allow viewers to create clips using the !clip command
                </p>
              </div>
              <button
                onClick={() => setSettings({ ...settings, enabled: !settings.enabled })}
                className={`w-14 h-7 rounded-full transition-colors ${
                  settings.enabled ? 'bg-[#53fc18]' : 'bg-zinc-600'
                }`}
              >
                <div className={`w-6 h-6 bg-white rounded-full transition-transform ${
                  settings.enabled ? 'translate-x-7' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
          </div>

          {settings.enabled && (
            <>
              {/* Default Settings */}
              <div className="bg-zinc-800/50 rounded-lg p-6 mb-6 border border-zinc-700">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <span>⏱️</span> Duration Settings
                </h2>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Default Duration</label>
                    <select
                      value={settings.defaultDuration}
                      onChange={(e) => setSettings({ ...settings, defaultDuration: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 bg-zinc-900 border border-zinc-600 rounded-lg focus:outline-none focus:border-[#53fc18]"
                    >
                      {durationOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-zinc-500 mt-1">
                      Duration when user types !clip without a number
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Maximum Duration</label>
                    <select
                      value={settings.maxDuration}
                      onChange={(e) => setSettings({ ...settings, maxDuration: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 bg-zinc-900 border border-zinc-600 rounded-lg focus:outline-none focus:border-[#53fc18]"
                    >
                      {durationOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-zinc-500 mt-1">
                      Maximum clip length viewers can request
                    </p>
                  </div>
                </div>
              </div>

              {/* Permissions */}
              <div className="bg-zinc-800/50 rounded-lg p-6 mb-6 border border-zinc-700">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <span>🔐</span> Permissions
                </h2>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Minimum User Level</label>
                    <select
                      value={settings.minUserLevel}
                      onChange={(e) => setSettings({ ...settings, minUserLevel: e.target.value })}
                      className="w-full px-4 py-2 bg-zinc-900 border border-zinc-600 rounded-lg focus:outline-none focus:border-[#53fc18]"
                    >
                      {userLevels.map((level) => (
                        <option key={level.value} value={level.value}>
                          {level.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-zinc-500 mt-1">
                      Who can use the !clip command
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Cooldown (seconds)</label>
                    <input
                      type="number"
                      min="10"
                      max="300"
                      value={settings.cooldownSeconds}
                      onChange={(e) => setSettings({ ...settings, cooldownSeconds: parseInt(e.target.value) || 30 })}
                      className="w-full px-4 py-2 bg-zinc-900 border border-zinc-600 rounded-lg focus:outline-none focus:border-[#53fc18]"
                    />
                    <p className="text-xs text-zinc-500 mt-1">
                      Time between clip requests per user
                    </p>
                  </div>
                </div>
              </div>

              {/* Discord Channel Selection */}
              <div className="bg-zinc-800/50 rounded-lg p-6 mb-6 border border-zinc-700">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <span>💬</span> Discord Destination
                </h2>

                {!discordStatus?.connected ? (
                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <p className="text-yellow-400">
                      Discord bot is not connected. Clips will be saved but not sent to Discord.
                    </p>
                  </div>
                ) : discordStatus.guilds.length === 0 ? (
                  <div className="p-4 bg-zinc-900/50 rounded-lg">
                    <p className="text-zinc-300 mb-3">
                      KaoticBot isn't in any Discord servers yet.
                    </p>
                    <a
                      href={discordStatus.inviteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-[#5865F2] hover:bg-[#4752C4] text-white font-medium rounded-lg transition-colors"
                    >
                      Add KaoticBot to Discord
                    </a>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Discord Server</label>
                      <select
                        value={settings.discordGuildId || ''}
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
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Clips Channel</label>
                      <select
                        value={settings.discordChannelId || ''}
                        onChange={(e) => setSettings({ ...settings, discordChannelId: e.target.value || null })}
                        disabled={!settings.discordGuildId || loadingChannels}
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
                    </div>
                  </div>
                )}

                {settings.discordGuildId && settings.discordChannelId && (
                  <div className="mt-4 p-3 bg-zinc-900/50 rounded-lg flex items-center gap-2 text-sm">
                    <span className="text-green-400">✓</span>
                    <span>
                      Clips will be sent to <strong>#{selectedChannel?.name}</strong> in <strong>{selectedGuild?.name}</strong>
                    </span>
                  </div>
                )}

                {!settings.discordChannelId && discordStatus?.connected && (
                  <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-400">
                    ⚠️ No Discord channel selected. Clips will be saved locally only.
                  </div>
                )}
              </div>
            </>
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
        </>
      )}

      {activeTab === 'history' && (
        <div className="bg-zinc-800/50 rounded-lg border border-zinc-700 overflow-hidden">
          {clips.length === 0 ? (
            <div className="p-8 text-center text-zinc-400">
              <span className="text-4xl block mb-3">🎬</span>
              <p>No clips yet</p>
              <p className="text-sm mt-1">Clips created with !clip will appear here</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-zinc-900/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-zinc-400">Created</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-zinc-400">Clipped By</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-zinc-400">Duration</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-zinc-400">Size</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-zinc-400">Status</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-zinc-400">Discord</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-zinc-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-700">
                  {clips.map((clip) => (
                    <tr key={clip.id} className="hover:bg-zinc-800/50">
                      <td className="px-4 py-3 text-sm">{formatDate(clip.createdAt)}</td>
                      <td className="px-4 py-3 text-sm font-medium">{clip.requestedBy}</td>
                      <td className="px-4 py-3 text-sm">{formatDuration(clip.duration)}</td>
                      <td className="px-4 py-3 text-sm">{formatFileSize(clip.fileSize)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          clip.status === 'completed'
                            ? 'bg-green-500/20 text-green-400'
                            : clip.status === 'failed'
                            ? 'bg-red-500/20 text-red-400'
                            : clip.status === 'processing'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-zinc-500/20 text-zinc-400'
                        }`}>
                          {clip.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {clip.discordSent ? (
                          <span className="text-green-400">✓ Sent</span>
                        ) : (
                          <span className="text-zinc-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {clip.status === 'completed' && (
                            <a
                              href={`/clips/media/${clip.filename}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#53fc18] hover:underline text-sm"
                            >
                              Download
                            </a>
                          )}
                          <button
                            onClick={() => deleteClip(clip.id)}
                            className="text-red-400 hover:text-red-300 text-sm"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Command Reference */}
      <div className="mt-8 bg-zinc-800/30 rounded-lg p-6 border border-zinc-700/50">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <span>📋</span> Command Reference
        </h3>

        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <code className="bg-zinc-900 px-3 py-1 rounded text-[#53fc18] font-mono text-sm whitespace-nowrap">
              !clip
            </code>
            <p className="text-sm text-zinc-400">
              Creates a clip with the default duration ({settings.defaultDuration}s)
            </p>
          </div>
          <div className="flex items-start gap-3">
            <code className="bg-zinc-900 px-3 py-1 rounded text-[#53fc18] font-mono text-sm whitespace-nowrap">
              !clip 60
            </code>
            <p className="text-sm text-zinc-400">
              Creates a 60-second clip (max: {settings.maxDuration}s)
            </p>
          </div>
        </div>

        <div className="mt-4 p-3 bg-zinc-900/50 rounded-lg text-sm text-zinc-400">
          <strong>Note:</strong> Clips capture the most recent footage from your stream.
          Processing takes 1-2 minutes depending on the clip length.
        </div>
      </div>
    </div>
  );
}
