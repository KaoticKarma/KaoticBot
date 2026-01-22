import { useState, useEffect } from 'react';

const API_BASE = '/api';

interface EventMessage {
  id: number;
  eventType: string;
  enabled: boolean;
  message: string;
  createdAt: string;
  updatedAt: string;
}

const EVENT_INFO: Record<string, { icon: string; title: string; description: string; variables: string[] }> = {
  follow: {
    icon: '💚',
    title: 'Follow',
    description: 'When someone follows the channel',
    variables: ['$(user)'],
  },
  subscription: {
    icon: '⭐',
    title: 'Subscription',
    description: 'When someone subscribes',
    variables: ['$(user)'],
  },
  gifted_sub: {
    icon: '🎁',
    title: 'Gifted Subs',
    description: 'When someone gifts subscriptions',
    variables: ['$(user)', '$(amount)', '$(recipient)'],
  },
  raid: {
    icon: '🚀',
    title: 'Raid',
    description: 'When another streamer raids',
    variables: ['$(user)', '$(amount)'],
  },
  kick: {
    icon: '💰',
    title: 'Kicks (Tips)',
    description: 'When someone sends Kicks',
    variables: ['$(user)', '$(amount)', '$(message)'],
  },
};

export default function Events() {
  const [events, setEvents] = useState<EventMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testingEvent, setTestingEvent] = useState<string | null>(null);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/events`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch (err) {
      setError('Failed to load event messages');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const updateEvent = async (eventType: string, updates: { enabled?: boolean; message?: string }) => {
    setSaving(eventType);
    try {
      const res = await fetch(`${API_BASE}/events/${eventType}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      
      if (res.ok) {
        const updated = await res.json();
        setEvents(events.map(e => e.eventType === eventType ? updated : e));
      } else {
        throw new Error('Failed to update');
      }
    } catch (err) {
      setError('Failed to update event message');
      console.error(err);
    } finally {
      setSaving(null);
    }
  };

  const testEvent = async (eventType: string) => {
    setTestingEvent(eventType);
    try {
      const res = await fetch(`${API_BASE}/events/test/${eventType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'TestUser', amount: 10 }),
      });
      
      if (!res.ok) {
        throw new Error('Failed to send test');
      }
    } catch (err) {
      setError('Failed to send test event');
      console.error(err);
    } finally {
      setTimeout(() => setTestingEvent(null), 1000);
    }
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
          📢 Event Messages
        </h1>
        <p className="text-gray-400 text-sm">
          Chat messages sent when events occur
        </p>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500 text-red-400 px-4 py-2 rounded">
          {error}
          <button onClick={() => setError(null)} className="ml-4 text-red-300">✕</button>
        </div>
      )}

      <div className="space-y-4">
        {Object.entries(EVENT_INFO).map(([type, info]) => {
          const event = events.find(e => e.eventType === type);
          const isEnabled = event?.enabled ?? true;
          const message = event?.message || '';

          return (
            <div
              key={type}
              className={`bg-gray-800 rounded-lg border ${isEnabled ? 'border-[#53fc18]/30' : 'border-gray-700'} overflow-hidden`}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 bg-gray-900/50">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{info.icon}</span>
                  <div>
                    <h3 className="text-lg font-medium text-white">{info.title}</h3>
                    <p className="text-gray-400 text-sm">{info.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => testEvent(type)}
                    disabled={!isEnabled || testingEvent === type}
                    className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50"
                  >
                    {testingEvent === type ? '✓ Sent' : '🧪 Test'}
                  </button>
                  <button
                    onClick={() => updateEvent(type, { enabled: !isEnabled })}
                    disabled={saving === type}
                    className={`w-12 h-6 rounded-full relative transition-colors ${
                      isEnabled ? 'bg-[#53fc18]' : 'bg-gray-600'
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        isEnabled ? 'left-7' : 'left-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Message Editor */}
              {isEnabled && (
                <div className="px-4 py-4 border-t border-gray-700 space-y-3">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Message Template</label>
                    <textarea
                      value={message}
                      onChange={(e) => {
                        setEvents(events.map(ev => 
                          ev.eventType === type ? { ...ev, message: e.target.value } : ev
                        ));
                      }}
                      onBlur={(e) => updateEvent(type, { message: e.target.value })}
                      rows={2}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white resize-none"
                      placeholder={`Enter ${info.title.toLowerCase()} message...`}
                    />
                  </div>
                  
                  {/* Variables */}
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500">Variables:</span>
                    {info.variables.map(v => (
                      <code
                        key={v}
                        className="px-2 py-0.5 bg-gray-700 rounded text-[#53fc18] cursor-pointer hover:bg-gray-600"
                        onClick={() => {
                          const textarea = document.querySelector(`textarea`) as HTMLTextAreaElement;
                          if (textarea) {
                            const start = textarea.selectionStart;
                            const end = textarea.selectionEnd;
                            const newMessage = message.slice(0, start) + v + message.slice(end);
                            setEvents(events.map(ev => 
                              ev.eventType === type ? { ...ev, message: newMessage } : ev
                            ));
                          }
                        }}
                        title="Click to insert"
                      >
                        {v}
                      </code>
                    ))}
                  </div>

                  {/* Preview */}
                  <div className="bg-gray-900 rounded p-3">
                    <span className="text-gray-500 text-xs block mb-1">Preview:</span>
                    <span className="text-white">
                      {message
                        .replace(/\$\(user\)/gi, 'TestUser')
                        .replace(/\$\(username\)/gi, 'TestUser')
                        .replace(/\$\(amount\)/gi, '10')
                        .replace(/\$\(recipient\)/gi, 'LuckyViewer')
                        .replace(/\$\(message\)/gi, 'Great stream!')}
                    </span>
                  </div>
                </div>
              )}

              {/* Saving indicator */}
              {saving === type && (
                <div className="px-4 py-2 bg-[#53fc18]/10 text-[#53fc18] text-sm">
                  Saving...
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Help Section */}
      <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
        <h3 className="text-white font-medium mb-2">💡 Tips</h3>
        <ul className="text-gray-400 text-sm space-y-1">
          <li>• <code className="text-[#53fc18]">$(user)</code> = username. Add <code className="text-white">@</code> before it to mention: <code className="text-white">@$(user)</code></li>
          <li>• Use <code className="text-[#53fc18]">$(amount)</code> for gift count, raid viewers, or Kick amount</li>
          <li>• Messages are sent to chat when the event happens (separate from OBS alerts)</li>
          <li>• Click "Test" to send a sample message to chat</li>
        </ul>
      </div>
    </div>
  );
}
