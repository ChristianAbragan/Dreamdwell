import React, { useEffect, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { API_BASE_URL } from '../../config/api';
import styles from '../../styles/AccountPages.module.css';

export default function Settings() {
  const { isDarkMode, setIsDarkMode } = useTheme();
  const [activeTab, setActiveTab] = useState('interface');
  const [saveNotice, setSaveNotice] = useState('');
  const [voiceSettings, setVoiceSettings] = useState({
    engine: 'Archi (Echo)',
    speed: 'Instant',
    autoSend: true,
    volume: 80,
    continuousListening: false,
  });
  const [aiSettings, setAiSettings] = useState({
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    temperature: 0.7,
    maxTokens: 2048,
  });
  const [interfaceSettings, setInterfaceSettings] = useState({
    density: 'Comfortable',
    panelBehavior: 'Manual',
    textSize: 'Medium',
  });

  useEffect(() => {
    try {
      const savedVoiceSettings = localStorage.getItem('dreamdwellVoiceSettings');
      const savedAiSettings = localStorage.getItem('dreamdwellAiSettings');
      const savedInterfaceSettings = localStorage.getItem('dreamdwellInterfaceSettings');
      if (savedVoiceSettings) setVoiceSettings(JSON.parse(savedVoiceSettings));
      if (savedAiSettings) setAiSettings(JSON.parse(savedAiSettings));
      if (savedInterfaceSettings) setInterfaceSettings(JSON.parse(savedInterfaceSettings));
    } catch (_error) {
      console.warn('Could not load saved settings');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('dreamdwellVoiceSettings', JSON.stringify(voiceSettings));
    setSaveNotice('Voice settings saved.');
  }, [voiceSettings]);

  useEffect(() => {
    localStorage.setItem('dreamdwellAiSettings', JSON.stringify(aiSettings));
    setSaveNotice('Assistant settings saved.');
  }, [aiSettings]);

  useEffect(() => {
    localStorage.setItem('dreamdwellInterfaceSettings', JSON.stringify(interfaceSettings));
    document.documentElement.dataset.density = interfaceSettings.density.toLowerCase();
    document.documentElement.dataset.textSize = interfaceSettings.textSize.toLowerCase();
    setSaveNotice('Interface settings saved.');
  }, [interfaceSettings]);

  const tabs = [
    { key: 'interface', label: 'Interface' },
    { key: 'assistant', label: 'Assistant' },
    { key: 'privacy', label: 'Privacy' },
    { key: 'system', label: 'System' },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Settings</p>
          <h1 className={styles.title}>Make DreamDwell feel right for you</h1>
          <p className={styles.subtitle}>
            Adjust appearance, voice behavior, privacy preferences, and app diagnostics from one place.
          </p>
        </div>
      </header>

      <nav className={styles.tabs} aria-label="Settings sections">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`${styles.tab} ${activeTab === tab.key ? styles.activeTab : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'interface' && (
        <InterfaceTab
          isDarkMode={isDarkMode}
          onThemeChange={setIsDarkMode}
          interfaceSettings={interfaceSettings}
          setInterfaceSettings={setInterfaceSettings}
        />
      )}
      {activeTab === 'assistant' && (
        <AssistantTab
          voiceSettings={voiceSettings}
          setVoiceSettings={setVoiceSettings}
          aiSettings={aiSettings}
          setAiSettings={setAiSettings}
        />
      )}
      {activeTab === 'privacy' && <PrivacyTab />}
      {activeTab === 'system' && (
        <SystemTab
          setVoiceSettings={setVoiceSettings}
          setAiSettings={setAiSettings}
          setInterfaceSettings={setInterfaceSettings}
        />
      )}
      {saveNotice && <p style={{ margin: '14px 0 0', color: 'var(--accent)', fontWeight: 700 }}>{saveNotice}</p>}
    </div>
  );
}

// All subcomponents from original Settings.jsx - InterfaceTab, AssistantTab, etc.
function InterfaceTab({ isDarkMode, onThemeChange, interfaceSettings, setInterfaceSettings }) {
  const updateInterface = (key, value) =>
    setInterfaceSettings((prev) => ({ ...prev, [key]: value }));

  return (
    <section className={styles.panel}>
      <div className={styles.grid}>
        <button
          type="button"
          onClick={() => onThemeChange(false)}
          className={styles.card}
          style={{
            textAlign: 'left',
            cursor: 'pointer',
            borderColor: !isDarkMode ? 'var(--accent)' : 'var(--glass-border)',
          }}
        >
          <h3 className={styles.cardTitle}>Light mode</h3>
          <p className={styles.cardText}>A brighter workspace for scanning, reviewing, and comparing ideas.</p>
          {!isDarkMode && <StatusText text="Active" />}
        </button>

        <button
          type="button"
          onClick={() => onThemeChange(true)}
          className={styles.card}
          style={{
            textAlign: 'left',
            cursor: 'pointer',
            borderColor: isDarkMode ? 'var(--accent)' : 'var(--glass-border)',
          }}
        >
          <h3 className={styles.cardTitle}>Dark mode</h3>
          <p className={styles.cardText}>A calmer interface for focused room analysis and late work sessions.</p>
          {isDarkMode && <StatusText text="Active" />}
        </button>
      </div>

      <div className={styles.grid} style={{ marginTop: 18 }}>
        <Field label="Layout density">
          <select className={styles.select} value={interfaceSettings.density} onChange={(event) => updateInterface('density', event.target.value)}>
            <option>Compact</option>
            <option>Comfortable</option>
            <option>Spacious</option>
          </select>
        </Field>
        <Field label="Panel behavior">
          <select className={styles.select} value={interfaceSettings.panelBehavior} onChange={(event) => updateInterface('panelBehavior', event.target.value)}>
            <option>Manual</option>
            <option>Remember last open</option>
            <option>Auto collapse</option>
          </select>
        </Field>
        <Field label="Text size">
          <select className={styles.select} value={interfaceSettings.textSize} onChange={(event) => updateInterface('textSize', event.target.value)}>
            <option>Small</option>
            <option>Medium</option>
            <option>Large</option>
          </select>
        </Field>
      </div>
    </section>
  );
}

function AssistantTab({ voiceSettings, setVoiceSettings, aiSettings, setAiSettings }) {
  const updateVoice = (key, value) => setVoiceSettings((prev) => ({ ...prev, [key]: value }));
  const updateAi = (key, value) => setAiSettings((prev) => ({ ...prev, [key]: value }));

  return (
    <div className={styles.twoCol}>
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Voice</p>
        <div className={styles.grid}>
          <Field label="Voice">
            <select className={styles.select} value={voiceSettings.engine} onChange={(e) => updateVoice('engine', e.target.value)}>
              <option>Archi (Echo)</option>
              <option>Archi (Deep)</option>
              <option>Assistant (Neutral)</option>
            </select>
          </Field>
          <Field label="Response speed">
            <select className={styles.select} value={voiceSettings.speed} onChange={(e) => updateVoice('speed', e.target.value)}>
              <option>Instant</option>
              <option>Fast</option>
              <option>Normal</option>
            </select>
          </Field>
          <Field label={`Volume (${voiceSettings.volume}%)`}>
            <input className={styles.range} type="range" min="0" max="100" value={voiceSettings.volume} onChange={(e) => updateVoice('volume', Number(e.target.value))} />
          </Field>
        </div>
        <ToggleRow label="Auto-send voice messages" checked={voiceSettings.autoSend} onChange={(value) => updateVoice('autoSend', value)} />
        <ToggleRow label="Continuous listening" checked={voiceSettings.continuousListening} onChange={(value) => updateVoice('continuousListening', value)} />
      </section>

      <section className={styles.panel}>
        <p className={styles.eyebrow}>AI</p>
        <div className={styles.grid}>
          <Field label="Model">
            <select className={styles.select} value={aiSettings.model} onChange={(e) => updateAi('model', e.target.value)}>
              <option>llama-4-scout-17b-16e-instruct</option>
              <option>llama-3.3-70b-versatile</option>
              <option>meta-llama/llama-4-scout-17b-16e-instruct</option>
            </select>
          </Field>
          <Field label={`Creativity (${aiSettings.temperature})`}>
            <input className={styles.range} type="range" min="0" max="2" step="0.1" value={aiSettings.temperature} onChange={(e) => updateAi('temperature', Number(e.target.value))} />
          </Field>
          <Field label="Response length">
            <select className={styles.select} value={aiSettings.maxTokens} onChange={(e) => updateAi('maxTokens', Number(e.target.value))}>
              <option value="1024">Short</option>
              <option value="2048">Balanced</option>
              <option value="4096">Detailed</option>
            </select>
          </Field>
        </div>
      </section>
    </div>
  );
}

function PrivacyTab() {
  const [notice, setNotice] = useState('');

  const exportData = () => {
    const data = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith('dreamdwell')) data[key] = localStorage.getItem(key);
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dreamdwell-local-data-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice('Local DreamDwell data exported.');
  };

  const clearLocalCache = () => {
    Object.keys(localStorage)
      .filter((key) => key.startsWith('dreamdwell'))
      .forEach((key) => localStorage.removeItem(key));
    setNotice('Local cache cleared. Refresh to see the clean state.');
  };

  return (
    <section className={styles.panel}>
      <InfoRow label="Saved room scans" value="Stored in your account archive" />
      <InfoRow label="Assistant chat memory" value="Scoped to each signed-in account" />
      <InfoRow label="Inspiration saves" value="Private to your account" />
      <InfoRow label="Camera access" value="Only used when you start a scan" />
      <div className={styles.buttonRow}>
        <button type="button" className={styles.secondaryButton} onClick={exportData}>Export data</button>
        <button type="button" className={styles.secondaryButton} onClick={clearLocalCache}>Clear local cache</button>
      </div>
      {notice && <StatusText text={notice} />}
    </section>
  );
}

function SystemTab({ setVoiceSettings, setAiSettings, setInterfaceSettings }) {
  const [health, setHealth] = useState('Not checked');
  const [notice, setNotice] = useState('');

  const checkHealth = async () => {
    setHealth('Checking...');
    try {
      const response = await fetch(`${API_BASE_URL}/api/health`);
      const data = await response.json();
      setHealth(response.ok ? `Online (${data.status})` : `Error (${response.status})`);
    } catch (_error) {
      setHealth('Offline');
    }
  };

  const exportLogs = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      apiBaseUrl: API_BASE_URL,
      backendHealth: health,
      settings: {
        voice: JSON.parse(localStorage.getItem('dreamdwellVoiceSettings') || '{}'),
        ai: JSON.parse(localStorage.getItem('dreamdwellAiSettings') || '{}'),
        interface: JSON.parse(localStorage.getItem('dreamdwellInterfaceSettings') || '{}'),
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dreamdwell-system-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice('System log exported.');
  };

  const resetSettings = () => {
    localStorage.removeItem('dreamdwellVoiceSettings');
    localStorage.removeItem('dreamdwellAiSettings');
    localStorage.removeItem('dreamdwellInterfaceSettings');
    setVoiceSettings({
      engine: 'Archi (Echo)',
      speed: 'Instant',
      autoSend: true,
      volume: 80,
      continuousListening: false,
    });
    setAiSettings({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      temperature: 0.7,
      maxTokens: 2048,
    });
    setInterfaceSettings({
      density: 'Comfortable',
      panelBehavior: 'Manual',
      textSize: 'Medium',
    });
    setNotice('Settings reset.');
  };

  return (
    <section className={styles.panel}>
      <div className={styles.grid}>
        <InfoCard title="AI Engine" value={health} />
        <InfoCard title="Vision Core" value="Ready" />
        <InfoCard title="Archive" value="Connected" />
        <InfoCard title="Image Proxy" value="Available" />
      </div>
      <div className={styles.buttonRow}>
        <button type="button" className={styles.secondaryButton} onClick={checkHealth}>Check backend</button>
        <button type="button" className={styles.secondaryButton} onClick={exportLogs}>Export logs</button>
        <button type="button" className={styles.secondaryButton} onClick={resetSettings}>Reset settings</button>
      </div>
      {notice && <StatusText text={notice} />}
    </section>
  );
}

function Field({ label, children }) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      {children}
    </label>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <label className={styles.toggleRow}>
      <span>{label}</span>
      <input className={styles.checkbox} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className={styles.infoRow}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function InfoCard({ title, value }) {
  return (
    <div className={styles.card}>
      <p className={styles.cardText}>{title}</p>
      <h3 className={styles.cardTitle}>{value}</h3>
    </div>
  );
}

function StatusText({ text }) {
  return <p style={{ margin: '12px 0 0', color: 'var(--accent)', fontWeight: 700 }}>{text}</p>;
}

