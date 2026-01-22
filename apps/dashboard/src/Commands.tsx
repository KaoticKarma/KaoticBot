import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, X, Save, Terminal } from 'lucide-react';
import { getCommands, createCommand, updateCommand, deleteCommand } from './apiClient';
import type { Command, UserLevel } from './types';

const USER_LEVELS: UserLevel[] = ['everyone', 'follower', 'subscriber', 'vip', 'moderator', 'broadcaster'];

export default function Commands() {
  const [commands, setCommands] = useState<Command[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<Partial<Command>>({});

  useEffect(() => {
    loadCommands();
  }, []);

  async function loadCommands() {
    try {
      const data = await getCommands();
      setCommands(data);
    } catch (error) {
      console.error('Failed to load commands:', error);
    } finally {
      setLoading(false);
    }
  }

  function startCreate() {
    setIsCreating(true);
    setEditingId(null);
    setFormData({
      name: '',
      response: '',
      cooldown: 5,
      userLevel: 'everyone',
      enabled: true,
    });
  }

  function startEdit(command: Command) {
    setEditingId(command.id);
    setIsCreating(false);
    setFormData({ ...command });
  }

  function cancelEdit() {
    setEditingId(null);
    setIsCreating(false);
    setFormData({});
  }

  async function handleSave() {
    try {
      if (isCreating) {
        const newCommand = await createCommand(formData);
        setCommands([...commands, newCommand]);
      } else if (editingId) {
        const updated = await updateCommand(editingId, formData);
        setCommands(commands.map(c => c.id === editingId ? updated : c));
      }
      cancelEdit();
    } catch (error) {
      console.error('Failed to save command:', error);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Are you sure you want to delete this command?')) return;
    
    try {
      await deleteCommand(id);
      setCommands(commands.filter(c => c.id !== id));
    } catch (error) {
      console.error('Failed to delete command:', error);
    }
  }

  async function toggleEnabled(command: Command) {
    try {
      const updated = await updateCommand(command.id, { enabled: !command.enabled });
      setCommands(commands.map(c => c.id === command.id ? updated : c));
    } catch (error) {
      console.error('Failed to toggle command:', error);
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
          <h1 className="text-3xl font-bold">Commands</h1>
          <p className="text-gray-400 mt-1">Manage chat commands</p>
        </div>
        <button onClick={startCreate} className="btn btn-primary flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Add Command
        </button>
      </div>

      {/* Create Form */}
      {isCreating && (
        <CommandForm
          formData={formData}
          setFormData={setFormData}
          onSave={handleSave}
          onCancel={cancelEdit}
          title="Create Command"
        />
      )}

      {/* Commands List */}
      <div className="space-y-4">
        {commands.map((command) => (
          <div key={command.id}>
            {editingId === command.id ? (
              <CommandForm
                formData={formData}
                setFormData={setFormData}
                onSave={handleSave}
                onCancel={cancelEdit}
                title="Edit Command"
              />
            ) : (
              <div className="card">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <Terminal className="w-5 h-5 text-kick-green" />
                      <span className="text-lg font-semibold">!{command.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        command.enabled 
                          ? 'bg-kick-green/20 text-kick-green' 
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {command.enabled ? 'Active' : 'Disabled'}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded bg-kick-light text-gray-400">
                        {command.userLevel}
                      </span>
                    </div>
                    <p className="mt-2 text-gray-300 font-mono text-sm bg-kick-light px-3 py-2 rounded">
                      {command.response}
                    </p>
                    <div className="mt-3 flex items-center gap-4 text-sm text-gray-500">
                      <span>Cooldown: {command.cooldown}s</span>
                      <span>Uses: {command.usageCount}</span>
                      {command.aliases && command.aliases.length > 0 && (
                        <span>Aliases: {command.aliases.join(', ')}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => toggleEnabled(command)}
                      className={`btn text-sm ${command.enabled ? 'btn-secondary' : 'btn-primary'}`}
                    >
                      {command.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => startEdit(command)}
                      className="p-2 text-gray-400 hover:text-white transition-colors"
                    >
                      <Pencil className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(command.id)}
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

        {commands.length === 0 && !isCreating && (
          <div className="card text-center py-12">
            <Terminal className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">No commands yet</p>
            <button onClick={startCreate} className="btn btn-primary mt-4">
              Create your first command
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CommandForm({
  formData,
  setFormData,
  onSave,
  onCancel,
  title,
}: {
  formData: Partial<Command>;
  setFormData: (data: Partial<Command>) => void;
  onSave: () => void;
  onCancel: () => void;
  title: string;
}) {
  return (
    <div className="card border-kick-green">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Command Name</label>
            <input
              type="text"
              className="input"
              placeholder="ping"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value.toLowerCase() })}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Cooldown (seconds)</label>
            <input
              type="number"
              className="input"
              min="0"
              value={formData.cooldown || 5}
              onChange={(e) => setFormData({ ...formData, cooldown: parseInt(e.target.value) })}
            />
          </div>
        </div>
        
        <div>
          <label className="block text-sm text-gray-400 mb-1">Response</label>
          <textarea
            className="input min-h-[100px]"
            placeholder="Pong! $(latency)ms"
            value={formData.response || ''}
            onChange={(e) => setFormData({ ...formData, response: e.target.value })}
          />
          <p className="text-xs text-gray-500 mt-1">
            Variables: $(user), $(touser), $(randomuser), $(channel), $(uptime), $(args), Rand[min,max]
          </p>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Permission Level</label>
          <select
            className="input"
            value={formData.userLevel || 'everyone'}
            onChange={(e) => setFormData({ ...formData, userLevel: e.target.value as UserLevel })}
          >
            {USER_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-kick-border">
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
