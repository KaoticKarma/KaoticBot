import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, X, Save, Clock } from 'lucide-react';
import { getTimers, createTimer, updateTimer, deleteTimer } from './apiClient';
import type { Timer } from './types';

export default function Timers() {
  const [timers, setTimers] = useState<Timer[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<Partial<Timer>>({});

  useEffect(() => {
    loadTimers();
  }, []);

  async function loadTimers() {
    try {
      const data = await getTimers();
      setTimers(data);
    } catch (error) {
      console.error('Failed to load timers:', error);
    } finally {
      setLoading(false);
    }
  }

  function startCreate() {
    setIsCreating(true);
    setEditingId(null);
    setFormData({
      name: '',
      message: '',
      interval: 300,
      minChatLines: 5,
      enabled: true,
    });
  }

  function startEdit(timer: Timer) {
    setEditingId(timer.id);
    setIsCreating(false);
    setFormData({ ...timer });
  }

  function cancelEdit() {
    setEditingId(null);
    setIsCreating(false);
    setFormData({});
  }

  async function handleSave() {
    try {
      if (isCreating) {
        const newTimer = await createTimer(formData);
        setTimers([...timers, newTimer]);
      } else if (editingId) {
        const updated = await updateTimer(editingId, formData);
        setTimers(timers.map(t => t.id === editingId ? updated : t));
      }
      cancelEdit();
    } catch (error) {
      console.error('Failed to save timer:', error);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this timer?')) return;
    try {
      await deleteTimer(id);
      setTimers(timers.filter(t => t.id !== id));
    } catch (error) {
      console.error('Failed to delete timer:', error);
    }
  }

  async function toggleEnabled(timer: Timer) {
    try {
      const updated = await updateTimer(timer.id, { enabled: !timer.enabled });
      setTimers(timers.map(t => t.id === timer.id ? updated : t));
    } catch (error) {
      console.error('Failed to toggle timer:', error);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Timers</h1>
          <p className="text-gray-400 mt-1">Scheduled chat messages</p>
        </div>
        <button onClick={startCreate} className="btn btn-primary flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Add Timer
        </button>
      </div>

      {isCreating && (
        <TimerForm
          formData={formData}
          setFormData={setFormData}
          onSave={handleSave}
          onCancel={cancelEdit}
          title="Create Timer"
        />
      )}

      <div className="space-y-4">
        {timers.map((timer) => (
          <div key={timer.id}>
            {editingId === timer.id ? (
              <TimerForm
                formData={formData}
                setFormData={setFormData}
                onSave={handleSave}
                onCancel={cancelEdit}
                title="Edit Timer"
              />
            ) : (
              <div className="card">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <Clock className="w-5 h-5 text-kick-green" />
                      <span className="text-lg font-semibold">{timer.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        timer.enabled 
                          ? 'bg-kick-green/20 text-kick-green' 
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {timer.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                    <p className="mt-2 text-gray-300">{timer.message}</p>
                    <div className="mt-3 flex items-center gap-4 text-sm text-gray-500">
                      <span>Interval: {Math.floor(timer.interval / 60)}m</span>
                      <span>Min lines: {timer.minChatLines}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => toggleEnabled(timer)}
                      className={`btn text-sm ${timer.enabled ? 'btn-secondary' : 'btn-primary'}`}
                    >
                      {timer.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => startEdit(timer)}
                      className="p-2 text-gray-400 hover:text-white transition-colors"
                    >
                      <Pencil className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(timer.id)}
                      className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {timers.length === 0 && !isCreating && (
          <div className="card text-center py-12">
            <Clock className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">No timers yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TimerForm({ formData, setFormData, onSave, onCancel, title }: any) {
  return (
    <div className="card border-kick-green">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <div className="space-y-4">
        <input
          type="text"
          className="input"
          placeholder="Timer name"
          value={formData.name || ''}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        />
        <textarea
          className="input min-h-[80px]"
          placeholder="Message"
          value={formData.message || ''}
          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Interval (seconds)</label>
            <input
              type="number"
              className="input"
              min="60"
              value={formData.interval || 300}
              onChange={(e) => setFormData({ ...formData, interval: parseInt(e.target.value) })}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Min Chat Lines</label>
            <input
              type="number"
              className="input"
              min="0"
              value={formData.minChatLines || 5}
              onChange={(e) => setFormData({ ...formData, minChatLines: parseInt(e.target.value) })}
            />
          </div>
        </div>
        <div className="flex gap-3 pt-4 border-t border-kick-border">
          <button onClick={onCancel} className="btn btn-secondary flex items-center gap-2">
            <X className="w-4 h-4" />
            Cancel
          </button>
          <button onClick={onSave} className="btn btn-primary flex items-center gap-2">
            <Save className="w-4 h-4" />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
