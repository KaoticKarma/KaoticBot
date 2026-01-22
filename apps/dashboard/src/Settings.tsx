import { useEffect, useState } from 'react';
import { TrendingUp, Plus, Minus, RotateCcw, Activity, Bot, User } from 'lucide-react';
import { getCounters, setCounter } from './apiClient';
import type { Counter } from './types';

interface UserInfo {
  authenticated: boolean;
  user: {
    id: number;
    username: string;
    profilePic: string;
  } | null;
}

interface BotConfig {
  configured: boolean;
  botUsername?: string;
  botUserId?: number;
  tokenExpiresAt?: string;
  message?: string;
}

export default function Settings() {
  const [counters, setCounters] = useState<Counter[]>([]);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [botConfig, setBotConfig] = useState<BotConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      // Load auth and bot config - these are critical
      const [authRes, botRes] = await Promise.all([
        fetch('/api/auth/status', { credentials: 'include' }).then(r => r.json()),
        fetch('/api/bot/config', { credentials: 'include' }).then(r => r.json()),
      ]);
      setUserInfo(authRes);
      setBotConfig(botRes);
      
      // Load counters separately - this endpoint may not exist
      try {
        const ctrs = await getCounters();
        setCounters(ctrs);
      } catch (e) {
        console.log('Counters not available');
        setCounters([]);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function updateCounter(name: string, newValue: number) {
    try {
      await setCounter(name, newValue);
      setCounters(counters.map(c => c.name === name ? { ...c, value: newValue } : c));
    } catch (error) {
      console.error('Failed to update counter:', error);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-kick-green"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-gray-400 mt-1">Bot configuration and status</p>
      </div>

      {/* User Session Status */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <User className={`w-6 h-6 ${userInfo?.authenticated ? 'text-kick-green' : 'text-red-400'}`} />
          <h2 className="text-xl font-semibold">Your Account</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="p-3 bg-kick-light rounded">
            <p className="text-gray-400">Status</p>
            <p className="font-medium mt-1">
              {userInfo?.authenticated ? '🟢 Logged In' : '🔴 Not Logged In'}
            </p>
          </div>
          <div className="p-3 bg-kick-light rounded">
            <p className="text-gray-400">Username</p>
            <p className="font-medium mt-1">
              {userInfo?.user?.username || 'N/A'}
            </p>
          </div>
        </div>
        {!userInfo?.authenticated && (
          <a
            href="/auth/login"
            className="btn btn-primary mt-4 inline-block"
          >
            Login with Kick
          </a>
        )}
      </div>

      {/* Bot Account Status */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <Bot className={`w-6 h-6 ${botConfig?.configured ? 'text-kick-green' : 'text-yellow-400'}`} />
          <h2 className="text-xl font-semibold">Bot Account</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="p-3 bg-kick-light rounded">
            <p className="text-gray-400">Status</p>
            <p className="font-medium mt-1">
              {botConfig?.configured ? '🟢 Configured' : '🟡 Not Configured'}
            </p>
          </div>
          <div className="p-3 bg-kick-light rounded">
            <p className="text-gray-400">Bot Username</p>
            <p className="font-medium mt-1">
              {botConfig?.botUsername || 'N/A'}
            </p>
          </div>
          {botConfig?.tokenExpiresAt && (
            <div className="p-3 bg-kick-light rounded col-span-2">
              <p className="text-gray-400">Token Expires</p>
              <p className="font-medium mt-1">
                {new Date(botConfig.tokenExpiresAt).toLocaleString()}
              </p>
            </div>
          )}
        </div>
        {!botConfig?.configured && (
          <div className="mt-4">
            <p className="text-yellow-400 text-sm mb-2">
              Bot account needs to be authenticated before the bot can send messages.
            </p>
            <a
              href="/auth/bot/login"
              className="btn btn-primary inline-block"
            >
              Authenticate Bot Account
            </a>
          </div>
        )}
      </div>

      {/* Counters */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <TrendingUp className="w-6 h-6 text-kick-green" />
          <h2 className="text-xl font-semibold">Counters</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {counters.map((counter) => (
            <div key={counter.id} className="p-4 bg-kick-light rounded-lg">
              <p className="text-gray-400 text-sm mb-2">{counter.name}</p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => updateCounter(counter.name, counter.value - 1)}
                  className="p-2 bg-kick-bg rounded hover:bg-kick-dark transition-colors"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <input
                  type="number"
                  value={counter.value}
                  onChange={(e) => updateCounter(counter.name, parseInt(e.target.value) || 0)}
                  className="input flex-1 text-center text-xl font-bold"
                />
                <button
                  onClick={() => updateCounter(counter.name, counter.value + 1)}
                  className="p-2 bg-kick-bg rounded hover:bg-kick-dark transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  onClick={() => updateCounter(counter.name, 0)}
                  className="p-2 bg-kick-bg rounded hover:bg-kick-dark transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {counters.length === 0 && (
            <p className="text-gray-500 col-span-2 text-center py-4">No counters configured</p>
          )}
        </div>
      </div>

      {/* Variable Reference */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Variable Reference</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm font-mono">
          {[
            '$(user)', '$(username)', '$(touser)', '$(randomuser)',
            '$(channel)', '$(uptime)', '$(viewers)', '$(title)',
            '$(args)', '$(1)', '$(2)', '$(3)',
            'Rand[min,max]', '$(counter name)', '$(time)', '$(date)',
          ].map((variable) => (
            <div key={variable} className="px-3 py-2 bg-kick-light rounded text-kick-green">
              {variable}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
