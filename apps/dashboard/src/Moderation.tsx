import { useState, useEffect } from 'react';

const API_BASE = '/api';

interface ModerationSettings {
  id: number;
  linkFilterEnabled: boolean;
  linkFilterAction: 'delete' | 'timeout' | 'ban';
  linkTimeoutDuration: number;
  linkWhitelist: string[];
  linkPermitLevel: string;
  capsFilterEnabled: boolean;
  capsFilterAction: 'delete' | 'timeout' | 'ban';
  capsTimeoutDuration: number;
  capsThreshold: number;
  capsMinLength: number;
  capsPermitLevel: string;
  spamFilterEnabled: boolean;
  spamFilterAction: 'delete' | 'timeout' | 'ban';
  spamTimeoutDuration: number;
  spamMaxRepeats: number;
  spamMaxEmotes: number;
  spamPermitLevel: string;
  symbolFilterEnabled: boolean;
  symbolFilterAction: 'delete' | 'timeout' | 'ban';
  symbolTimeoutDuration: number;
  symbolThreshold: number;
  symbolMinLength: number;
  symbolPermitLevel: string;
  bannedWordsEnabled: boolean;
  bannedWordsAction: 'delete' | 'timeout' | 'ban';
  bannedWordsTimeoutDuration: number;
}

interface BannedWord {
  id: number;
  word: string;
  isRegex: boolean;
  severity: 'low' | 'medium' | 'high';
  action: 'delete' | 'timeout' | 'ban';
  timeoutDuration: number;
  enabled: boolean;
  createdAt: string;
}

interface ModLog {
  id: number;
  targetUserId: number;
  targetUsername: string;
  moderatorUsername: string | null;
  action: string;
  reason: string | null;
  duration: number | null;
  messageContent: string | null;
  filterType: string | null;
  createdAt: string;
}

const PERMIT_LEVELS = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'follower', label: 'Followers' },
  { value: 'subscriber', label: 'Subscribers' },
  { value: 'vip', label: 'VIPs' },
  { value: 'moderator', label: 'Moderators' },
  { value: 'broadcaster', label: 'Broadcaster Only' },
];

const ACTIONS = [
  { value: 'delete', label: 'Delete Message' },
  { value: 'timeout', label: 'Timeout' },
  { value: 'ban', label: 'Ban' },
];

export default function Moderation() {
  const [activeTab, setActiveTab] = useState<'filters' | 'banned-words' | 'logs'>('filters');
  const [settings, setSettings] = useState<ModerationSettings | null>(null);
  const [bannedWords, setBannedWords] = useState<BannedWord[]>([]);
  const [modLogs, setModLogs] = useState<ModLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // New banned word form
  const [newWord, setNewWord] = useState('');
  const [newWordIsRegex, setNewWordIsRegex] = useState(false);
  const [newWordAction, setNewWordAction] = useState<'delete' | 'timeout' | 'ban'>('timeout');
  const [newWordDuration, setNewWordDuration] = useState(300);
  
  // New whitelist domain
  const [newDomain, setNewDomain] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [settingsRes, wordsRes, logsRes] = await Promise.all([
        fetch(`${API_BASE}/moderation/settings`),
        fetch(`${API_BASE}/moderation/banned-words`),
        fetch(`${API_BASE}/moderation/logs?limit=100`),
      ]);
      
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setSettings(data);
      }
      
      if (wordsRes.ok) {
        const data = await wordsRes.json();
        setBannedWords(data);
      }
      
      if (logsRes.ok) {
        const data = await logsRes.json();
        setModLogs(data);
      }
    } catch (err) {
      setError('Failed to load moderation data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (updates: Partial<ModerationSettings>) => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/moderation/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (err) {
      setError('Failed to save settings');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const addBannedWord = async () => {
    if (!newWord.trim()) return;
    
    try {
      const res = await fetch(`${API_BASE}/moderation/banned-words`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word: newWord,
          isRegex: newWordIsRegex,
          action: newWordAction,
          timeoutDuration: newWordDuration,
        }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setBannedWords([...bannedWords, data]);
        setNewWord('');
        setNewWordIsRegex(false);
      }
    } catch (err) {
      setError('Failed to add banned word');
    }
  };

  const deleteBannedWord = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE}/moderation/banned-words/${id}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        setBannedWords(bannedWords.filter(w => w.id !== id));
      }
    } catch (err) {
      setError('Failed to delete banned word');
    }
  };

  const toggleBannedWord = async (word: BannedWord) => {
    try {
      const res = await fetch(`${API_BASE}/moderation/banned-words/${word.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !word.enabled }),
      });
      
      if (res.ok) {
        setBannedWords(bannedWords.map(w => 
          w.id === word.id ? { ...w, enabled: !w.enabled } : w
        ));
      }
    } catch (err) {
      setError('Failed to toggle banned word');
    }
  };

  const addWhitelistDomain = () => {
    if (!newDomain.trim() || !settings) return;
    
    const currentWhitelist = settings.linkWhitelist || [];
    const newWhitelist = [...currentWhitelist, newDomain.toLowerCase().trim()];
    
    saveSettings({ linkWhitelist: newWhitelist });
    setNewDomain('');
  };

  const removeWhitelistDomain = (domain: string) => {
    if (!settings) return;
    
    const newWhitelist = (settings.linkWhitelist || []).filter(d => d !== domain);
    saveSettings({ linkWhitelist: newWhitelist });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#53fc18]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          🛡️ Moderation
        </h1>
      </div>
      
      {error && (
        <div className="bg-red-500/20 border border-red-500 text-red-400 px-4 py-2 rounded">
          {error}
          <button onClick={() => setError(null)} className="ml-4 text-red-300">✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-700">
        {(['filters', 'banned-words', 'logs'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === tab
                ? 'text-[#53fc18] border-b-2 border-[#53fc18]'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab === 'filters' && '⚙️ Filters'}
            {tab === 'banned-words' && '🚫 Banned Words'}
            {tab === 'logs' && '📋 Mod Logs'}
          </button>
        ))}
      </div>

      {/* Filters Tab */}
      {activeTab === 'filters' && settings && (
        <div className="space-y-6">
          {/* Link Filter */}
          <FilterCard
            title="🔗 Link Filter"
            description="Block unauthorized links in chat"
            enabled={settings.linkFilterEnabled}
            onToggle={() => saveSettings({ linkFilterEnabled: !settings.linkFilterEnabled })}
          >
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Action</label>
                <select
                  value={settings.linkFilterAction}
                  onChange={(e) => saveSettings({ linkFilterAction: e.target.value as any })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                >
                  {ACTIONS.map(a => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Timeout Duration (seconds)</label>
                <input
                  type="number"
                  value={settings.linkTimeoutDuration}
                  onChange={(e) => saveSettings({ linkTimeoutDuration: parseInt(e.target.value) || 60 })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Exempt Level</label>
                <select
                  value={settings.linkPermitLevel}
                  onChange={(e) => saveSettings({ linkPermitLevel: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                >
                  {PERMIT_LEVELS.map(l => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Whitelist */}
            <div className="mt-4">
              <label className="block text-sm text-gray-400 mb-2">Whitelisted Domains</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  placeholder="example.com"
                  className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
                <button
                  onClick={addWhitelistDomain}
                  className="px-4 py-2 bg-[#53fc18] text-black rounded font-medium hover:bg-[#4ae615]"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(settings.linkWhitelist || []).map(domain => (
                  <span
                    key={domain}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-gray-700 rounded text-sm"
                  >
                    {domain}
                    <button
                      onClick={() => removeWhitelistDomain(domain)}
                      className="text-red-400 hover:text-red-300"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </FilterCard>

          {/* Caps Filter */}
          <FilterCard
            title="🔠 Caps Filter"
            description="Block messages with excessive capital letters"
            enabled={settings.capsFilterEnabled}
            onToggle={() => saveSettings({ capsFilterEnabled: !settings.capsFilterEnabled })}
          >
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Action</label>
                <select
                  value={settings.capsFilterAction}
                  onChange={(e) => saveSettings({ capsFilterAction: e.target.value as any })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                >
                  {ACTIONS.map(a => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Timeout Duration (seconds)</label>
                <input
                  type="number"
                  value={settings.capsTimeoutDuration}
                  onChange={(e) => saveSettings({ capsTimeoutDuration: parseInt(e.target.value) || 60 })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Caps Threshold (%)</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={settings.capsThreshold}
                  onChange={(e) => saveSettings({ capsThreshold: parseInt(e.target.value) || 70 })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Min Message Length</label>
                <input
                  type="number"
                  value={settings.capsMinLength}
                  onChange={(e) => saveSettings({ capsMinLength: parseInt(e.target.value) || 10 })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Exempt Level</label>
                <select
                  value={settings.capsPermitLevel}
                  onChange={(e) => saveSettings({ capsPermitLevel: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                >
                  {PERMIT_LEVELS.map(l => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </FilterCard>

          {/* Spam Filter */}
          <FilterCard
            title="📢 Spam Filter"
            description="Block repeated characters, words, and emote spam"
            enabled={settings.spamFilterEnabled}
            onToggle={() => saveSettings({ spamFilterEnabled: !settings.spamFilterEnabled })}
          >
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Action</label>
                <select
                  value={settings.spamFilterAction}
                  onChange={(e) => saveSettings({ spamFilterAction: e.target.value as any })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                >
                  {ACTIONS.map(a => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Timeout Duration (seconds)</label>
                <input
                  type="number"
                  value={settings.spamTimeoutDuration}
                  onChange={(e) => saveSettings({ spamTimeoutDuration: parseInt(e.target.value) || 60 })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Max Repeats</label>
                <input
                  type="number"
                  value={settings.spamMaxRepeats}
                  onChange={(e) => saveSettings({ spamMaxRepeats: parseInt(e.target.value) || 4 })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Max Emotes</label>
                <input
                  type="number"
                  value={settings.spamMaxEmotes}
                  onChange={(e) => saveSettings({ spamMaxEmotes: parseInt(e.target.value) || 10 })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Exempt Level</label>
                <select
                  value={settings.spamPermitLevel}
                  onChange={(e) => saveSettings({ spamPermitLevel: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                >
                  {PERMIT_LEVELS.map(l => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </FilterCard>

          {/* Symbol Filter */}
          <FilterCard
            title="✳️ Symbol Filter"
            description="Block messages with excessive symbols"
            enabled={settings.symbolFilterEnabled}
            onToggle={() => saveSettings({ symbolFilterEnabled: !settings.symbolFilterEnabled })}
          >
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Action</label>
                <select
                  value={settings.symbolFilterAction}
                  onChange={(e) => saveSettings({ symbolFilterAction: e.target.value as any })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                >
                  {ACTIONS.map(a => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Timeout Duration (seconds)</label>
                <input
                  type="number"
                  value={settings.symbolTimeoutDuration}
                  onChange={(e) => saveSettings({ symbolTimeoutDuration: parseInt(e.target.value) || 60 })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Symbol Threshold (%)</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={settings.symbolThreshold}
                  onChange={(e) => saveSettings({ symbolThreshold: parseInt(e.target.value) || 50 })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Min Message Length</label>
                <input
                  type="number"
                  value={settings.symbolMinLength}
                  onChange={(e) => saveSettings({ symbolMinLength: parseInt(e.target.value) || 5 })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Exempt Level</label>
                <select
                  value={settings.symbolPermitLevel}
                  onChange={(e) => saveSettings({ symbolPermitLevel: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                >
                  {PERMIT_LEVELS.map(l => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </FilterCard>

          {/* Banned Words Settings */}
          <FilterCard
            title="🚫 Banned Words Filter"
            description="Block messages containing banned words or phrases"
            enabled={settings.bannedWordsEnabled}
            onToggle={() => saveSettings({ bannedWordsEnabled: !settings.bannedWordsEnabled })}
          >
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Default Action</label>
                <select
                  value={settings.bannedWordsAction}
                  onChange={(e) => saveSettings({ bannedWordsAction: e.target.value as any })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                >
                  {ACTIONS.map(a => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Default Timeout Duration (seconds)</label>
                <input
                  type="number"
                  value={settings.bannedWordsTimeoutDuration}
                  onChange={(e) => saveSettings({ bannedWordsTimeoutDuration: parseInt(e.target.value) || 300 })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
            </div>
            <p className="text-gray-400 text-sm mt-2">
              Manage individual banned words in the "Banned Words" tab
            </p>
          </FilterCard>
        </div>
      )}

      {/* Banned Words Tab */}
      {activeTab === 'banned-words' && (
        <div className="space-y-4">
          {/* Add new banned word */}
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <h3 className="text-lg font-medium text-white mb-4">Add Banned Word</h3>
            <div className="grid grid-cols-4 gap-4">
              <div className="col-span-2">
                <input
                  type="text"
                  value={newWord}
                  onChange={(e) => setNewWord(e.target.value)}
                  placeholder="Word or phrase..."
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <select
                  value={newWordAction}
                  onChange={(e) => setNewWordAction(e.target.value as any)}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                >
                  {ACTIONS.map(a => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <input
                  type="number"
                  value={newWordDuration}
                  onChange={(e) => setNewWordDuration(parseInt(e.target.value) || 300)}
                  placeholder="Timeout (s)"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
            </div>
            <div className="flex items-center gap-4 mt-3">
              <label className="flex items-center gap-2 text-gray-300">
                <input
                  type="checkbox"
                  checked={newWordIsRegex}
                  onChange={(e) => setNewWordIsRegex(e.target.checked)}
                  className="w-4 h-4"
                />
                Use Regex
              </label>
              <button
                onClick={addBannedWord}
                disabled={!newWord.trim()}
                className="px-4 py-2 bg-[#53fc18] text-black rounded font-medium hover:bg-[#4ae615] disabled:opacity-50"
              >
                Add Word
              </button>
            </div>
          </div>

          {/* Banned words list */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-900">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Word/Pattern</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Type</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Action</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Duration</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Status</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {bannedWords.map(word => (
                  <tr key={word.id} className={!word.enabled ? 'opacity-50' : ''}>
                    <td className="px-4 py-3 text-white font-mono text-sm">{word.word}</td>
                    <td className="px-4 py-3 text-gray-300">
                      {word.isRegex ? (
                        <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs">Regex</span>
                      ) : (
                        <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">Exact</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-300 capitalize">{word.action}</td>
                    <td className="px-4 py-3 text-gray-300">{word.timeoutDuration}s</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleBannedWord(word)}
                        className={`px-2 py-1 rounded text-xs ${
                          word.enabled
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {word.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => deleteBannedWord(word.id)}
                        className="text-red-400 hover:text-red-300"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
                {bannedWords.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No banned words configured
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mod Logs Tab */}
      {activeTab === 'logs' && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-900">
            <h3 className="text-lg font-medium text-white">Recent Mod Actions</h3>
            <button
              onClick={loadData}
              className="text-gray-400 hover:text-white"
            >
              🔄 Refresh
            </button>
          </div>
          <table className="w-full">
            <thead className="bg-gray-900/50">
              <tr>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Time</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">User</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Action</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Reason</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Filter</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {modLogs.map(log => (
                <tr key={log.id}>
                  <td className="px-4 py-3 text-gray-400 text-sm">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-white">{log.targetUsername}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs ${
                      log.action === 'ban' ? 'bg-red-500/20 text-red-400' :
                      log.action === 'timeout' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-blue-500/20 text-blue-400'
                    }`}>
                      {log.action}
                      {log.duration ? ` (${log.duration}s)` : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-300 text-sm max-w-xs truncate">
                    {log.reason || '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-sm">
                    {log.filterType || 'manual'}
                  </td>
                </tr>
              ))}
              {modLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    No moderation actions logged
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {saving && (
        <div className="fixed bottom-4 right-4 bg-[#53fc18] text-black px-4 py-2 rounded shadow-lg">
          Saving...
        </div>
      )}
    </div>
  );
}

// Filter Card Component
function FilterCard({ 
  title, 
  description, 
  enabled, 
  onToggle, 
  children 
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`bg-gray-800 rounded-lg border ${enabled ? 'border-[#53fc18]/30' : 'border-gray-700'} overflow-hidden`}>
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900/50">
        <div>
          <h3 className="text-lg font-medium text-white">{title}</h3>
          <p className="text-gray-400 text-sm">{description}</p>
        </div>
        <button
          onClick={onToggle}
          className={`w-12 h-6 rounded-full relative transition-colors ${
            enabled ? 'bg-[#53fc18]' : 'bg-gray-600'
          }`}
        >
          <span
            className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
              enabled ? 'left-7' : 'left-1'
            }`}
          />
        </button>
      </div>
      {enabled && (
        <div className="px-4 py-4 border-t border-gray-700">
          {children}
        </div>
      )}
    </div>
  );
}
