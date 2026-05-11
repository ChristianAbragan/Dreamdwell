import React, { useCallback, useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../config/firebase';
import { API_BASE_URL } from '../../config/api';
import styles from '../../styles/AccountPages.module.css';

export default function Profile({ user }) {
  const [profile, setProfile] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState({ scans: 0, saved: 0, daysActive: 0 });
  const [loadingStats, setLoadingStats] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [recentSessions, setRecentSessions] = useState([]);

  useEffect(() => {
    getDoc(doc(db, 'users', user.uid)).then((snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setProfile(data);
        setEditName(data.displayName || user.displayName || '');
      } else {
        setEditName(user.displayName || '');
      }
    });
  }, [user]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const [sessionsRes, savedRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/sessions/${user.uid}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE_URL}/api/photos/saved?userId=${user.uid}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const sessions = sessionsRes.ok ? await sessionsRes.json() : [];
        const saved = savedRes.ok ? await savedRes.json() : {};
        const firstScan = sessions.length
          ? new Date(Math.min(...sessions.map((session) => new Date(session.createdAt))))
          : new Date();
        const daysActive = Math.max(
          1,
          Math.floor((Date.now() - firstScan.getTime()) / (1000 * 60 * 60 * 24))
        );

        setStats({ scans: sessions.length, saved: saved.count || saved.photos?.length || 0, daysActive });
        setRecentSessions(sessions.slice(0, 5));
      } catch (error) {
        console.error('Stats fetch failed:', error);
      } finally {
        setLoadingStats(false);
      }
    };

    fetchStats();
  }, [user]);

  const handleSaveName = useCallback(async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { displayName: editName.trim() });
      await auth.currentUser?.updateProfile({ displayName: editName.trim() });
      setProfile((prev) => ({ ...prev, displayName: editName.trim() }));
      setEditMode(false);
    } catch (error) {
      console.error('Failed to update name:', error);
      alert('Could not update name.');
    } finally {
      setSaving(false);
    }
  }, [editName, user.uid]);

  const displayName = profile?.displayName || user.displayName || 'DreamDwell user';
  const initials = displayName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'activity', label: 'Activity' },
    { key: 'preferences', label: 'Preferences' },
  ];

  return (
    <div className={styles.page}>
      <section className={`${styles.panel} ${styles.profileHero}`}>
        <div className={styles.avatar}>{initials}</div>
        <div>
          <p className={styles.eyebrow}>Profile</p>
          {editMode ? (
            <div className={styles.buttonRow} style={{ marginTop: 0 }}>
              <input
                className={styles.input}
                type="text"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                autoFocus
                style={{ maxWidth: 280 }}
              />
              <button type="button" className={styles.primaryButton} onClick={handleSaveName} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setEditMode(false);
                  setEditName(displayName);
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div>
              <h1 className={styles.title}>{displayName}</h1>
              <p className={styles.subtitle}>{user.email}</p>
              <div className={styles.buttonRow}>
                <button type="button" className={styles.secondaryButton} onClick={() => setEditMode(true)}>
                  Edit name
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <nav className={styles.tabs} aria-label="Profile sections">
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

      {activeTab === 'overview' && (
        <>
          <div className={styles.statGrid}>
            <StatCard label="Room scans" value={loadingStats ? '...' : stats.scans} />
            <StatCard label="Saved ideas" value={loadingStats ? '...' : stats.saved} />
            <StatCard label="Days active" value={loadingStats ? '...' : stats.daysActive} />
            <StatCard label="Save rate" value={`${Math.round((stats.saved / Math.max(stats.scans, 1)) * 100)}%`} />
          </div>
          <section className={styles.panel}>
            <p className={styles.eyebrow}>Design profile</p>
            <div className={styles.grid}>
              <InfoCard title="Style" value={profile?.architecturalStyle || 'Not set'} />
              <InfoCard title="Goal" value={profile?.primaryGoal || 'Not set'} />
              <InfoCard title="Favorite room" value={profile?.favoriteRoom || 'Not set'} />
              <InfoCard title="Mood" value={profile?.moodPreference || 'Not set'} />
            </div>
            <div className={styles.tagList} style={{ marginTop: 16 }}>
              {[profile?.palettePreference, profile?.materialPreference, profile?.moodPreference]
                .filter(Boolean)
                .map((tag) => (
                  <span key={tag} className={styles.tag}>{tag}</span>
                ))}
            </div>
          </section>
        </>
      )}

      {activeTab === 'activity' && <ActivityTab sessions={recentSessions} stats={stats} />}
      {activeTab === 'preferences' && <PreferencesTab profile={profile} user={user} />}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className={styles.card}>
      <p className={styles.statValue}>{value}</p>
      <p className={styles.cardText}>{label}</p>
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

function ActivityTab({ sessions, stats }) {
  return (
    <div className={styles.twoCol}>
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Recent archive</p>
        {sessions.length ? (
          <div className={styles.sessionList}>
            {sessions.map((session) => (
              <div key={session.id} className={styles.sessionItem}>
                <div>
                  <strong>{session.goal || 'Room analysis'}</strong>
                  <p className={styles.cardText}>{new Date(session.createdAt || Date.now()).toLocaleDateString()}</p>
                </div>
                <span className={styles.tag}>{session.style || 'Design'}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.cardText}>No room analyses yet.</p>
        )}
      </section>

      <section className={styles.panel}>
        <p className={styles.eyebrow}>Activity</p>
        <InfoRow label="Total scans" value={stats.scans} />
        <InfoRow label="Saved ideas" value={stats.saved} />
        <InfoRow label="Active days" value={stats.daysActive} />
      </section>
    </div>
  );
}

function PreferencesTab({ profile, user }) {
  return (
    <div className={styles.twoCol}>
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Preferences</p>
        <InfoRow label="Architectural style" value={profile?.architecturalStyle || 'Not set'} />
        <InfoRow label="Primary goal" value={profile?.primaryGoal || 'Not set'} />
        <InfoRow label="Mood" value={profile?.moodPreference || 'Not set'} />
        <InfoRow label="Palette" value={profile?.palettePreference || 'Not set'} />
        <InfoRow label="Materials" value={profile?.materialPreference || 'Not set'} />
      </section>

      <section className={styles.panel}>
        <p className={styles.eyebrow}>Account</p>
        <InfoRow label="Display name" value={user.displayName || profile?.displayName || 'Not set'} />
        <InfoRow label="Email" value={user.email} />
        <InfoRow label="User ID" value={`${user.uid.slice(0, 10)}...`} />
      </section>
    </div>
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

