import { useEffect, useState } from 'react';
import { Bell, Plus, Edit, Trash2, Play, Link as LinkIcon, Image, Music, Video, X, Upload as UploadIcon, Code, AlertTriangle, Volume2, Settings, Copy, Check, RefreshCw, ExternalLink } from 'lucide-react';
import type { Alert, AlertLayout, AlertAnimation } from './types';

const API_BASE = '';

type AlertType = 'follow' | 'subscription' | 'gifted_sub' | 'raid' | 'tip' | 'kick';
type CodeTab = 'html' | 'css' | 'js' | 'variables';

interface CustomWidget {
  id: number;
  accountId: number;
  token: string;
  name: string;
  alertTypes: AlertType[];
  widgetUrl: string;
  createdAt: string;
  updatedAt: string;
}

const ALERT_TYPES: Record<AlertType, { label: string; color: string; unit: string; hasAmount: boolean }> = {
  follow: { label: 'Followers', color: 'bg-blue-500', unit: '', hasAmount: false },
  subscription: { label: 'Subscription', color: 'bg-kick-green', unit: 'months', hasAmount: true },
  gifted_sub: { label: 'Gift Sub', color: 'bg-purple-500', unit: 'subs', hasAmount: true },
  raid: { label: 'Host', color: 'bg-yellow-500', unit: 'viewers', hasAmount: true },
  kick: { label: 'KICKs', color: 'bg-orange-500', unit: 'kicks', hasAmount: true },
  tip: { label: 'Tip/Donate', color: 'bg-pink-500', unit: 'USD', hasAmount: true },
};

const LAYOUTS: { value: AlertLayout; label: string }[] = [
  { value: 'above', label: 'Image Above Text' },
  { value: 'side', label: 'Image Beside Text' },
  { value: 'overlay', label: 'Text Over Image' },
];

const ANIMATIONS: { value: AlertAnimation; label: string }[] = [
  { value: 'fade', label: 'Fade' },
  { value: 'slide', label: 'Slide' },
  { value: 'bounce', label: 'Bounce' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'none', label: 'None' },
];

const FONTS = ['Impact', 'Poppins', 'Arial', 'Roboto', 'Open Sans', 'Montserrat', 'Oswald', 'Raleway', 'Bebas Neue', 'Comic Sans MS'];

const DEFAULT_MESSAGES: Record<AlertType, string> = {
  follow: 'Thanks for the follow, {user}!',
  subscription: '{user} subscribed for {months} months!',
  gifted_sub: '{gifter} gifted {count} subs!',
  raid: '{user} raided with {viewers} viewers!',
  tip: '{user} tipped ${amount}!',
  kick: '{user} sent {count} kicks!',
};

const DEFAULT_CUSTOM_HTML = `<div class="custom-alert">
  <img src="{image}" alt="Alert" class="alert-img" />
  <div class="alert-text">{text}</div>
</div>`;

const DEFAULT_CUSTOM_CSS = `.custom-alert {
  display: flex;
  flex-direction: column;
  align-items: center;
  animation: fadeIn 0.5s ease-out;
}
.alert-img { max-width: 400px; border-radius: 10px; margin-bottom: 20px; }
.alert-text { font-size: 36px; font-weight: bold; color: #ffffff; text-shadow: 2px 2px 4px rgba(0,0,0,0.8); }
@keyframes fadeIn { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }`;

const DEFAULT_CUSTOM_JS = `// Variables: name, text, sound, image, amount, message
console.log('Alert triggered for:', name);`;

const getDefaultFormData = (type: AlertType): Partial<Alert> => ({
  type,
  minAmount: 1,
  maxAmount: type === 'follow' ? 1 : null,
  message: DEFAULT_MESSAGES[type],
  sound: null,
  imageUrl: null,
  videoUrl: null,
  duration: 8000,
  enabled: true,
  layout: 'above',
  animation: 'fade',
  volume: 50,
  topTextColor: '#ffffff',
  bottomTextColor: '#ffffff',
  font: 'Impact',
  textPositionY: 0,
  customCodeEnabled: false,
  customHtml: null,
  customCss: null,
  customJs: null,
});

export default function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<AlertType>('follow');
  const [editingAlert, setEditingAlert] = useState<Alert | null>(null);
  const [showVariantForm, setShowVariantForm] = useState(false);
  const [showCustomCodeConfirm, setShowCustomCodeConfirm] = useState(false);
  const [activeCodeTab, setActiveCodeTab] = useState<CodeTab>('html');
  const [testAmounts, setTestAmounts] = useState<Record<AlertType, number>>({
    follow: 1, subscription: 1, gifted_sub: 5, raid: 100, tip: 10, kick: 1
  });
  const [formData, setFormData] = useState<Partial<Alert>>(getDefaultFormData('follow'));
  
  // Widget URL state
  const [widgetToken, setWidgetToken] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  
  // Advanced Settings (Custom Widgets) state
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [customWidgets, setCustomWidgets] = useState<CustomWidget[]>([]);
  const [newWidgetName, setNewWidgetName] = useState('');
  const [newWidgetTypes, setNewWidgetTypes] = useState<AlertType[]>(['follow', 'subscription', 'gifted_sub', 'raid', 'tip', 'kick']);
  const [editingWidget, setEditingWidget] = useState<CustomWidget | null>(null);
  
  // Upload state
  const [uploading, setUploading] = useState<string | null>(null); // 'imageUrl' | 'videoUrl' | 'sound' | null
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  useEffect(() => { 
    loadAlerts(); 
    loadWidgetToken();
    loadCustomWidgets();
  }, []);

  async function loadAlerts() {
    try {
      const res = await fetch(`${API_BASE}/api/alerts`, { credentials: 'include' });
      if (res.ok) setAlerts(await res.json());
    } catch (e) { console.error('Failed to load alerts:', e); }
    finally { setLoading(false); }
  }

  async function loadWidgetToken() {
    try {
      const res = await fetch(`${API_BASE}/api/widget/token`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setWidgetToken(data.token);
      }
    } catch (e) { console.error('Failed to load widget token:', e); }
  }

  async function loadCustomWidgets() {
    try {
      const res = await fetch(`${API_BASE}/api/widgets`, { credentials: 'include' });
      if (res.ok) setCustomWidgets(await res.json());
    } catch (e) { console.error('Failed to load custom widgets:', e); }
  }

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(`${window.location.origin}${url}`);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const createCustomWidget = async () => {
    if (!newWidgetName.trim() || newWidgetTypes.length === 0) return;
    try {
      const res = await fetch(`${API_BASE}/api/widgets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newWidgetName, alertTypes: newWidgetTypes }),
      });
      if (res.ok) {
        await loadCustomWidgets();
        setNewWidgetName('');
        setNewWidgetTypes(['follow', 'subscription', 'gifted_sub', 'raid', 'tip', 'kick']);
      }
    } catch (e) { console.error('Failed to create widget:', e); }
  };

  const updateCustomWidget = async (widget: CustomWidget) => {
    try {
      const res = await fetch(`${API_BASE}/api/widgets/${widget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: widget.name, alertTypes: widget.alertTypes }),
      });
      if (res.ok) {
        await loadCustomWidgets();
        setEditingWidget(null);
      }
    } catch (e) { console.error('Failed to update widget:', e); }
  };

  const deleteCustomWidget = async (id: number) => {
    if (!confirm('Delete this custom widget URL?')) return;
    try {
      await fetch(`${API_BASE}/api/widgets/${id}`, { method: 'DELETE', credentials: 'include' });
      await loadCustomWidgets();
    } catch (e) { console.error('Failed to delete widget:', e); }
  };

  const toggleWidgetType = (types: AlertType[], type: AlertType): AlertType[] => {
    return types.includes(type) ? types.filter(t => t !== type) : [...types, type];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingAlert ? `${API_BASE}/api/alerts/${editingAlert.id}` : `${API_BASE}/api/alerts`;
      const method = editingAlert ? 'PATCH' : 'POST';
      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...formData, type: selectedType }),
      });
      await loadAlerts();
      resetForm();
    } catch (e) { console.error('Failed to save alert:', e); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this variant?')) return;
    try {
      await fetch(`${API_BASE}/api/alerts/${id}`, { method: 'DELETE', credentials: 'include' });
      await loadAlerts();
    } catch (e) { console.error('Failed to delete:', e); }
  };

  const handleTest = async (type: AlertType) => {
    try {
      await fetch(`${API_BASE}/api/alerts/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type, username: 'TestUser', amount: testAmounts[type] }),
      });
    } catch (e) { console.error('Failed to test:', e); }
  };

  const handleFileUpload = async (file: File, field: 'imageUrl' | 'videoUrl' | 'sound') => {
    setUploading(field);
    setUploadProgress(0);
    
    const formDataObj = new FormData();
    formDataObj.append('file', file);
    
    // Use XMLHttpRequest for progress tracking
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        setUploadProgress(percent);
      }
    });
    
    xhr.addEventListener('load', () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (data.success) {
          setFormData(prev => ({ ...prev, [field]: data.url }));
        } else {
          alert('Upload failed: ' + (data.error || 'Unknown'));
        }
      } catch (e) {
        alert('Upload failed: Invalid response');
      }
      setUploading(null);
      setUploadProgress(0);
    });
    
    xhr.addEventListener('error', () => {
      alert('Upload failed: Network error');
      setUploading(null);
      setUploadProgress(0);
    });
    
    xhr.open('POST', `${API_BASE}/api/alerts/upload`);
    xhr.withCredentials = true;
    xhr.send(formDataObj);
  };

  const handleCustomCodeToggle = (enabled: boolean) => {
    if (enabled && !formData.customCodeEnabled) setShowCustomCodeConfirm(true);
    else setFormData({ ...formData, customCodeEnabled: enabled });
  };

  const confirmEnableCustomCode = () => {
    setFormData({
      ...formData,
      customCodeEnabled: true,
      customHtml: formData.customHtml || DEFAULT_CUSTOM_HTML,
      customCss: formData.customCss || DEFAULT_CUSTOM_CSS,
      customJs: formData.customJs || DEFAULT_CUSTOM_JS,
    });
    setShowCustomCodeConfirm(false);
  };

  const startEdit = (alert: Alert) => {
    setEditingAlert(alert);
    setFormData(alert);
    setSelectedType(alert.type);
    setShowVariantForm(true);
  };

  const startCreate = () => {
    setEditingAlert(null);
    setFormData(getDefaultFormData(selectedType));
    setShowVariantForm(true);
  };

  const resetForm = () => {
    setEditingAlert(null);
    setShowVariantForm(false);
    setActiveCodeTab('html');
    setFormData(getDefaultFormData(selectedType));
  };

  const typeVariants = alerts.filter(a => a.type === selectedType).sort((a, b) => a.minAmount - b.minAmount);

  const getConditionDisplay = (alert: Alert) => {
    if (alert.type === 'follow') return '= 1';
    if (alert.minAmount === alert.maxAmount) return `= ${alert.minAmount}`;
    if (alert.maxAmount === null) return `≥ ${alert.minAmount}`;
    return `${alert.minAmount}-${alert.maxAmount}`;
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-kick-green"></div></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Stream Alerts</h1>
        <p className="text-gray-400 mt-1">Configure OBS overlay alerts with images, sounds, and custom styling</p>
      </div>

      {/* Widget URL */}
      <div className="card bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-500/30">
        <div className="flex items-start gap-3">
          <LinkIcon className="w-5 h-5 text-purple-400 mt-1" />
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-purple-400">Widget URL <span className="text-xs bg-purple-500/20 px-2 py-0.5 rounded ml-2">All Alerts</span></h3>
              <button 
                onClick={() => setShowAdvancedSettings(true)} 
                className="btn-secondary text-sm flex items-center gap-2"
              >
                <Settings className="w-4 h-4" /> Advanced Settings
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-2">Add this URL as a Browser Source in OBS. This URL is unique to your account.</p>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={widgetToken ? `${window.location.origin}/alerts/overlay?token=${widgetToken}` : 'Loading...'} 
                readOnly 
                className="input flex-1 bg-kick-dark text-sm" 
              />
              <button 
                onClick={() => copyUrl(`/alerts/overlay?token=${widgetToken}`)} 
                className="btn-primary text-sm flex items-center gap-2"
                disabled={!widgetToken}
              >
                {copiedUrl === `/alerts/overlay?token=${widgetToken}` ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copiedUrl === `/alerts/overlay?token=${widgetToken}` ? 'Copied!' : 'Copy'}
              </button>
              <a 
                href={`/alerts/overlay?token=${widgetToken}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="btn-secondary text-sm flex items-center"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Test Buttons Section */}
      <div className="card">
        <p className="text-center text-gray-400 mb-4">Use the buttons below to test the alerts:</p>
        <div className="flex flex-wrap gap-3 justify-center">
          {(Object.keys(ALERT_TYPES) as AlertType[]).map((type) => {
            const config = ALERT_TYPES[type];
            const hasVariant = alerts.some(a => a.type === type);
            return (
              <div key={type} className="flex items-center gap-1">
                <button
                  onClick={() => handleTest(type)}
                  disabled={!hasVariant}
                  className={`${config.color} hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded font-medium transition-opacity`}
                >
                  {config.label}
                </button>
                {config.hasAmount && (
                  <div className="flex items-center bg-zinc-800 rounded overflow-hidden">
                    <button onClick={() => setTestAmounts(prev => ({ ...prev, [type]: Math.max(1, prev[type] - 1) }))} className="px-2 py-2 hover:bg-zinc-700 text-kick-green font-bold">−</button>
                    <input
                      type="number"
                      value={testAmounts[type]}
                      onChange={(e) => setTestAmounts(prev => ({ ...prev, [type]: Math.max(1, parseInt(e.target.value) || 1) }))}
                      className="w-12 bg-transparent text-center text-white py-2 focus:outline-none"
                      min="1"
                    />
                    <button onClick={() => setTestAmounts(prev => ({ ...prev, [type]: prev[type] + 1 }))} className="px-2 py-2 hover:bg-zinc-700 text-kick-green font-bold">+</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-center text-yellow-400 text-sm mt-4">Attention: you are configuring alerts for "kick" platform</p>
      </div>

      {/* Alert Type Tabs */}
      <div className="card">
        <div className="flex flex-wrap gap-2 mb-4">
          {(Object.keys(ALERT_TYPES) as AlertType[]).map((type) => {
            const config = ALERT_TYPES[type];
            const count = alerts.filter(a => a.type === type).length;
            return (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`px-4 py-2 rounded font-medium transition-all ${selectedType === type ? `${config.color} text-white` : 'bg-zinc-800 text-gray-300 hover:bg-zinc-700'}`}
              >
                {config.label} ({count})
              </button>
            );
          })}
        </div>

        <div className="flex justify-end mb-4">
          <button onClick={startCreate} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" />Add Variant</button>
        </div>

        {typeVariants.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-700">
                  <th className="text-left py-2 px-3 text-gray-400 font-medium">Condition</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium">Message</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium">Media</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium">Duration</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium">Status</th>
                  <th className="text-right py-2 px-3 text-gray-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {typeVariants.map((alert) => (
                  <tr key={alert.id} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                    <td className="py-3 px-3">
                      <span className="font-mono text-kick-green">{getConditionDisplay(alert)}</span>
                      {ALERT_TYPES[selectedType].unit && <span className="text-gray-500 text-sm ml-1">{ALERT_TYPES[selectedType].unit}</span>}
                    </td>
                    <td className="py-3 px-3 max-w-xs truncate">{alert.message}</td>
                    <td className="py-3 px-3">
                      <div className="flex gap-1">
                        {alert.imageUrl && <Image className="w-4 h-4 text-green-400" title="Image" />}
                        {alert.videoUrl && <Video className="w-4 h-4 text-purple-400" title="Video" />}
                        {alert.sound && <Music className="w-4 h-4 text-blue-400" title="Sound" />}
                        {alert.customCodeEnabled && <Code className="w-4 h-4 text-yellow-400" title="Custom code" />}
                        {!alert.imageUrl && !alert.videoUrl && !alert.sound && !alert.customCodeEnabled && <span className="text-gray-500 text-sm">None</span>}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-gray-400">{(alert.duration / 1000).toFixed(1)}s</td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-1 rounded text-xs ${alert.enabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {alert.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => handleTest(alert.type)} className="p-1.5 hover:bg-zinc-700 rounded" title="Test"><Play className="w-4 h-4 text-kick-green" /></button>
                        <button onClick={() => startEdit(alert)} className="p-1.5 hover:bg-zinc-700 rounded" title="Edit"><Edit className="w-4 h-4 text-blue-400" /></button>
                        <button onClick={() => handleDelete(alert.id)} className="p-1.5 hover:bg-zinc-700 rounded" title="Delete"><Trash2 className="w-4 h-4 text-red-400" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No variants configured for {ALERT_TYPES[selectedType].label}</p>
            <button onClick={startCreate} className="btn-primary mt-4">Add First Variant</button>
          </div>
        )}
      </div>

      {/* Custom Code Confirmation Modal */}
      {showCustomCodeConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-[#1a1a1d] border border-zinc-700 rounded-lg max-w-lg w-full shadow-2xl">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-yellow-500/20 rounded-lg"><AlertTriangle className="w-6 h-6 text-yellow-400" /></div>
                <h2 className="text-xl font-semibold">Confirmation</h2>
                <button onClick={() => setShowCustomCodeConfirm(false)} className="ml-auto text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-gray-300 mb-6"><strong>Attention:</strong> This feature is for users with programming knowledge. Pasting code sent to you here could lead to data theft.</p>
              <div className="flex gap-3 justify-end">
                <button onClick={confirmEnableCustomCode} className="btn-primary bg-green-600 hover:bg-green-700">✓ Yes</button>
                <button onClick={() => setShowCustomCodeConfirm(false)} className="btn-secondary bg-red-600 hover:bg-red-700">✕ No</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Variant Modal */}
      {showVariantForm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1a1d] border border-zinc-700 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-semibold">{editingAlert ? 'Edit alert variant' : `Add ${ALERT_TYPES[selectedType].label} Variant`}</h2>
                <button onClick={resetForm} className="text-gray-400 hover:text-white"><X className="w-6 h-6" /></button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Active Toggle */}
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Active alert</label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={formData.enabled} onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })} className="sr-only peer" />
                    <div className="w-11 h-6 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-kick-green"></div>
                  </label>
                </div>

                {/* Condition */}
                {ALERT_TYPES[selectedType].hasAmount && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Condition</label>
                    <div className="flex gap-2">
                      <select className="input w-20" defaultValue="="><option value="=">=</option><option value=">=">≥</option></select>
                      <input type="number" value={formData.minAmount} onChange={(e) => setFormData({ ...formData, minAmount: parseInt(e.target.value), maxAmount: parseInt(e.target.value) })} className="input flex-1" min="1" />
                    </div>
                  </div>
                )}

                {/* Style & Animation */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Style</label>
                    <select value={formData.layout} onChange={(e) => setFormData({ ...formData, layout: e.target.value as AlertLayout })} className="input w-full">
                      {LAYOUTS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Animation</label>
                    <select value={formData.animation} onChange={(e) => setFormData({ ...formData, animation: e.target.value as AlertAnimation })} className="input w-full">
                      {ANIMATIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Layout Preview (Provision) */}
                <div>
                  <label className="block text-sm font-medium mb-2">Provision</label>
                  <div className="flex gap-4 justify-center">
                    {(['above', 'side', 'overlay'] as AlertLayout[]).map((layout) => (
                      <button key={layout} type="button" onClick={() => setFormData({ ...formData, layout })}
                        className={`p-4 border-2 rounded-lg transition-all ${formData.layout === layout ? 'border-kick-green bg-kick-green/10' : 'border-zinc-700 hover:border-zinc-500'}`}>
                        <div className={`w-20 h-16 flex ${layout === 'above' ? 'flex-col' : layout === 'side' ? 'flex-row' : 'relative'} items-center justify-center gap-1`}>
                          <div className="w-8 h-8 bg-zinc-600 rounded flex items-center justify-center"><Image className="w-4 h-4 text-zinc-400" /></div>
                          <div className={`text-[8px] text-zinc-400 font-bold ${layout === 'overlay' ? 'absolute' : ''}`}>TEXTO</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Duration Slider */}
                <div>
                  <label className="block text-sm font-medium mb-1">Alert duration</label>
                  <div className="flex items-center gap-4">
                    <input type="range" min="1000" max="30000" step="100" value={formData.duration} onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })} className="flex-1 accent-kick-green" />
                    <span className="text-gray-400 w-24 text-right">{((formData.duration || 5000) / 1000).toFixed(1)} seconds</span>
                  </div>
                </div>

                {/* Image, Video & Sound */}
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 flex items-center gap-2">
                      <Image className="w-4 h-4" /> Image
                      {uploading === 'imageUrl' && <span className="text-xs text-kick-green animate-pulse">Uploading {uploadProgress}%</span>}
                    </label>
                    <div className="flex gap-2">
                      <input type="url" value={formData.imageUrl || ''} onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value || null })} className="input flex-1" placeholder="https://... or upload" disabled={uploading === 'imageUrl'} />
                      <label className={`btn-secondary cursor-pointer flex items-center gap-2 ${uploading === 'imageUrl' ? 'opacity-50 pointer-events-none' : ''}`}>
                        <UploadIcon className="w-4 h-4" />
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, 'imageUrl'); }} disabled={uploading === 'imageUrl'} />
                      </label>
                      {formData.imageUrl && (
                        <button type="button" onClick={() => setFormData({ ...formData, imageUrl: null })} className="btn-secondary text-red-400 hover:text-red-300">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {uploading === 'imageUrl' && <div className="w-full bg-zinc-700 rounded-full h-1.5 mt-2"><div className="bg-kick-green h-1.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }}></div></div>}
                    {formData.imageUrl && <p className="text-xs text-green-400 mt-1 truncate">✓ {formData.imageUrl.split('/').pop()}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 flex items-center gap-2">
                      <Video className="w-4 h-4" /> Video
                      {uploading === 'videoUrl' && <span className="text-xs text-kick-green animate-pulse">Uploading {uploadProgress}%</span>}
                    </label>
                    <div className="flex gap-2">
                      <input type="url" value={formData.videoUrl || ''} onChange={(e) => setFormData({ ...formData, videoUrl: e.target.value || null })} className="input flex-1" placeholder="https://... or upload (.mp4, .webm)" disabled={uploading === 'videoUrl'} />
                      <label className={`btn-secondary cursor-pointer flex items-center gap-2 ${uploading === 'videoUrl' ? 'opacity-50 pointer-events-none' : ''}`}>
                        <UploadIcon className="w-4 h-4" />
                        <input type="file" accept="video/mp4,video/webm,.mp4,.webm" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, 'videoUrl'); }} disabled={uploading === 'videoUrl'} />
                      </label>
                      {formData.videoUrl && (
                        <button type="button" onClick={() => setFormData({ ...formData, videoUrl: null })} className="btn-secondary text-red-400 hover:text-red-300">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {uploading === 'videoUrl' && <div className="w-full bg-zinc-700 rounded-full h-1.5 mt-2"><div className="bg-kick-green h-1.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }}></div></div>}
                    {formData.videoUrl && <p className="text-xs text-green-400 mt-1 truncate">✓ {formData.videoUrl.split('/').pop()}</p>}
                    <p className="text-xs text-gray-500 mt-1">Video takes priority over image if both are set</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 flex items-center gap-2">
                      <Music className="w-4 h-4" /> Sound
                      {uploading === 'sound' && <span className="text-xs text-kick-green animate-pulse">Uploading {uploadProgress}%</span>}
                    </label>
                    <div className="flex gap-2">
                      <input type="url" value={formData.sound || ''} onChange={(e) => setFormData({ ...formData, sound: e.target.value || null })} className="input flex-1" placeholder="https://... or upload" disabled={uploading === 'sound'} />
                      <label className={`btn-secondary cursor-pointer flex items-center gap-2 ${uploading === 'sound' ? 'opacity-50 pointer-events-none' : ''}`}>
                        <UploadIcon className="w-4 h-4" />
                        <input type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, 'sound'); }} disabled={uploading === 'sound'} />
                      </label>
                      {formData.sound && (
                        <button type="button" onClick={() => setFormData({ ...formData, sound: null })} className="btn-secondary text-red-400 hover:text-red-300">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {uploading === 'sound' && <div className="w-full bg-zinc-700 rounded-full h-1.5 mt-2"><div className="bg-kick-green h-1.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }}></div></div>}
                    {formData.sound && <p className="text-xs text-green-400 mt-1 truncate">✓ {formData.sound.split('/').pop()}</p>}
                  </div>
                </div>

                {/* Volume */}
                <div>
                  <label className="block text-sm font-medium mb-1 flex items-center gap-2"><Volume2 className="w-4 h-4" /> Volume</label>
                  <div className="flex items-center gap-4">
                    <input type="range" min="0" max="100" value={formData.volume} onChange={(e) => setFormData({ ...formData, volume: parseInt(e.target.value) })} className="flex-1 accent-kick-green" />
                    <span className="text-gray-400 w-16 text-right">{formData.volume} %</span>
                  </div>
                </div>

                {/* Message */}
                <div>
                  <label className="block text-sm font-medium mb-1">Message:</label>
                  <input type="text" value={formData.message} onChange={(e) => setFormData({ ...formData, message: e.target.value })} className="input w-full" />
                  <p className="text-xs text-gray-500 mt-1">Variables: {'{user}'}, {'{months}'}, {'{count}'}, {'{viewers}'}, {'{amount}'}, {'{gifter}'}</p>
                </div>

                {/* Text Colors */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Top text color</label>
                    <div className="flex gap-2">
                      <input type="color" value={formData.topTextColor} onChange={(e) => setFormData({ ...formData, topTextColor: e.target.value })} className="w-10 h-10 rounded cursor-pointer" />
                      <input type="text" value={formData.topTextColor} onChange={(e) => setFormData({ ...formData, topTextColor: e.target.value })} className="input flex-1" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Bottom text color</label>
                    <div className="flex gap-2">
                      <input type="color" value={formData.bottomTextColor} onChange={(e) => setFormData({ ...formData, bottomTextColor: e.target.value })} className="w-10 h-10 rounded cursor-pointer" />
                      <input type="text" value={formData.bottomTextColor} onChange={(e) => setFormData({ ...formData, bottomTextColor: e.target.value })} className="input flex-1" />
                    </div>
                  </div>
                </div>

                {/* Typography & Text Position */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Typography</label>
                    <select value={formData.font} onChange={(e) => setFormData({ ...formData, font: e.target.value })} className="input w-full">
                      {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Vertical position of the text</label>
                    <div className="flex items-center gap-4">
                      <input type="range" min="-200" max="200" value={formData.textPositionY} onChange={(e) => setFormData({ ...formData, textPositionY: parseInt(e.target.value) })} className="flex-1 accent-kick-green" />
                      <span className="text-gray-400 w-16 text-right">{formData.textPositionY} px</span>
                    </div>
                  </div>
                </div>

                {/* Custom Code Section */}
                <div className="border-t border-zinc-700 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <label className="flex items-center gap-2 text-sm font-medium"><Code className="w-4 h-4" />Custom code (advanced)</label>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={formData.customCodeEnabled} onChange={(e) => handleCustomCodeToggle(e.target.checked)} className="sr-only peer" />
                      <div className="w-11 h-6 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-kick-green"></div>
                    </label>
                  </div>

                  {formData.customCodeEnabled && (
                    <>
                      <p className="text-sm text-gray-400 mb-3">Variables: <span className="text-kick-green">{'{name}'}</span>, <span className="text-kick-green">{'{text}'}</span>, <span className="text-kick-green">{'{sound}'}</span>, <span className="text-kick-green">{'{image}'}</span>, <span className="text-kick-green">{'{amount}'}</span>, <span className="text-kick-green">{'{message}'}</span></p>
                      <div className="flex border-b border-zinc-700 mb-3">
                        {(['html', 'js', 'css', 'variables'] as CodeTab[]).map((tab) => (
                          <button key={tab} type="button" onClick={() => setActiveCodeTab(tab)}
                            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeCodeTab === tab ? 'border-kick-green text-kick-green' : 'border-transparent text-gray-400 hover:text-white'}`}>
                            {tab === 'html' ? 'Html' : tab === 'js' ? 'JavaScript' : tab === 'css' ? 'CSS' : 'Custom fields'}
                          </button>
                        ))}
                      </div>
                      <div className="bg-[#0d0d0f] rounded-lg border border-zinc-700">
                        {activeCodeTab === 'html' && <textarea value={formData.customHtml || ''} onChange={(e) => setFormData({ ...formData, customHtml: e.target.value })} className="w-full h-48 p-4 bg-transparent text-gray-200 font-mono text-sm resize-none focus:outline-none" spellCheck={false} />}
                        {activeCodeTab === 'css' && <textarea value={formData.customCss || ''} onChange={(e) => setFormData({ ...formData, customCss: e.target.value })} className="w-full h-48 p-4 bg-transparent text-gray-200 font-mono text-sm resize-none focus:outline-none" spellCheck={false} />}
                        {activeCodeTab === 'js' && <textarea value={formData.customJs || ''} onChange={(e) => setFormData({ ...formData, customJs: e.target.value })} className="w-full h-48 p-4 bg-transparent text-gray-200 font-mono text-sm resize-none focus:outline-none" spellCheck={false} />}
                        {activeCodeTab === 'variables' && (
                          <div className="p-4 text-sm">
                            <table className="w-full"><tbody className="text-gray-300">
                              <tr><td className="py-1 text-kick-green font-mono">{'{name}'}</td><td>Username</td></tr>
                              <tr><td className="py-1 text-kick-green font-mono">{'{text}'}</td><td>Formatted message</td></tr>
                              <tr><td className="py-1 text-kick-green font-mono">{'{sound}'}</td><td>Sound URL</td></tr>
                              <tr><td className="py-1 text-kick-green font-mono">{'{image}'}</td><td>Image URL</td></tr>
                              <tr><td className="py-1 text-kick-green font-mono">{'{amount}'}</td><td>Amount value</td></tr>
                              <tr><td className="py-1 text-kick-green font-mono">{'{message}'}</td><td>Raw message template</td></tr>
                            </tbody></table>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>

                <div className="flex justify-center pt-4">
                  <button type="submit" className="btn-primary px-8 py-2">Accept</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Advanced Settings Modal */}
      {showAdvancedSettings && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-kick-card rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-zinc-700">
              <h2 className="text-xl font-bold">Advanced Settings</h2>
              <button onClick={() => setShowAdvancedSettings(false)} className="text-gray-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Info */}
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Settings className="w-5 h-5 text-blue-400 mt-0.5" />
                  <p className="text-sm text-blue-200">
                    Create unique URLs with only the alerts you prefer and place them wherever you want. 
                    Each custom URL can show different alert types in different OBS browser sources.
                  </p>
                </div>
              </div>

              {/* Create New Custom Widget */}
              <div className="bg-zinc-800/50 rounded-lg p-4">
                <h3 className="font-semibold mb-3">Create Custom Widget URL</h3>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={newWidgetName}
                    onChange={(e) => setNewWidgetName(e.target.value)}
                    placeholder="Widget name (e.g., 'Webcam Alerts')"
                    className="input w-full"
                  />
                  
                  <div>
                    <p className="text-sm text-gray-400 mb-2">Select alert types:</p>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(ALERT_TYPES) as AlertType[]).map((type) => (
                        <button
                          key={type}
                          onClick={() => setNewWidgetTypes(toggleWidgetType(newWidgetTypes, type))}
                          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                            newWidgetTypes.includes(type)
                              ? `${ALERT_TYPES[type].color} text-white`
                              : 'bg-zinc-700 text-gray-400 hover:bg-zinc-600'
                          }`}
                        >
                          {ALERT_TYPES[type].label}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <button
                    onClick={createCustomWidget}
                    disabled={!newWidgetName.trim() || newWidgetTypes.length === 0}
                    className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4 inline mr-2" /> Create Widget URL
                  </button>
                </div>
              </div>

              {/* Existing Custom Widgets */}
              {customWidgets.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3">Your Custom Widget URLs</h3>
                  <div className="space-y-3">
                    {customWidgets.map((widget) => (
                      <div key={widget.id} className="bg-zinc-800/50 rounded-lg p-4">
                        {editingWidget?.id === widget.id ? (
                          /* Editing Mode */
                          <div className="space-y-3">
                            <input
                              type="text"
                              value={editingWidget.name}
                              onChange={(e) => setEditingWidget({ ...editingWidget, name: e.target.value })}
                              className="input w-full"
                            />
                            <div className="flex flex-wrap gap-2">
                              {(Object.keys(ALERT_TYPES) as AlertType[]).map((type) => (
                                <button
                                  key={type}
                                  onClick={() => setEditingWidget({
                                    ...editingWidget,
                                    alertTypes: toggleWidgetType(editingWidget.alertTypes, type)
                                  })}
                                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                                    editingWidget.alertTypes.includes(type)
                                      ? `${ALERT_TYPES[type].color} text-white`
                                      : 'bg-zinc-700 text-gray-400 hover:bg-zinc-600'
                                  }`}
                                >
                                  {ALERT_TYPES[type].label}
                                </button>
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => updateCustomWidget(editingWidget)} className="btn-primary flex-1">Save</button>
                              <button onClick={() => setEditingWidget(null)} className="btn-secondary flex-1">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          /* View Mode */
                          <>
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-medium">{widget.name}</h4>
                              <div className="flex gap-1">
                                <button onClick={() => setEditingWidget(widget)} className="p-1.5 text-gray-400 hover:text-white rounded hover:bg-zinc-700">
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button onClick={() => deleteCustomWidget(widget.id)} className="p-1.5 text-gray-400 hover:text-red-400 rounded hover:bg-zinc-700">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5 mb-3">
                              {widget.alertTypes.map((type) => (
                                <span key={type} className={`px-2 py-0.5 rounded text-xs ${ALERT_TYPES[type].color} text-white`}>
                                  {ALERT_TYPES[type].label}
                                </span>
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={`${window.location.origin}${widget.widgetUrl}`}
                                readOnly
                                className="input flex-1 text-xs bg-kick-dark"
                              />
                              <button
                                onClick={() => copyUrl(widget.widgetUrl)}
                                className="btn-secondary text-sm flex items-center gap-1"
                              >
                                {copiedUrl === widget.widgetUrl ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                              </button>
                              <a
                                href={widget.widgetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-secondary text-sm flex items-center"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Instructions */}
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                <h4 className="font-medium text-yellow-400 mb-2">How to use</h4>
                <ol className="text-sm text-gray-300 space-y-1 list-decimal list-inside">
                  <li>Create a custom widget with the alert types you want</li>
                  <li>Copy the widget URL</li>
                  <li>Add a new Browser Source in OBS</li>
                  <li>Paste the URL and set your desired size</li>
                  <li>Repeat for different areas with different alert types</li>
                </ol>
              </div>
            </div>
            
            <div className="p-4 border-t border-zinc-700">
              <button onClick={() => setShowAdvancedSettings(false)} className="btn-secondary w-full">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
