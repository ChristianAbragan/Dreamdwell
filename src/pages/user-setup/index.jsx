import React, { useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';

export default function UserSetup({ user, onComplete }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState({
    displayName: user?.displayName || '',
    architecturalStyle: '',
    favoriteRoom: '',
    moodPreference: '',
    palettePreference: '',
    materialPreference: '',
    primaryGoal: '',
  });

  const fields = [
    {
      key: 'architecturalStyle',
      label: 'Architectural style',
      options: ['Minimalist', 'Modern', 'Industrial', 'Scandinavian', 'Bohemian', 'Traditional', 'Contemporary', 'Mid-Century'],
    },
    {
      key: 'favoriteRoom',
      label: 'Your favorite room',
      options: ['Living Room', 'Bedroom', 'Kitchen', 'Bathroom', 'Home Office', 'Dining Room', 'Outdoor Space'],
    },
    {
      key: 'moodPreference',
      label: 'Preferred mood',
      options: ['Calm & Serene', 'Warm & Cozy', 'Bright & Airy', 'Bold & Dramatic', 'Minimal & Clean', 'Eclectic & Vibrant'],
    },
    {
      key: 'palettePreference',
      label: 'Color palette',
      options: ['Neutral Tones', 'Earth Tones', 'Cool Blues & Greys', 'Warm Whites & Creams', 'Bold & Saturated', 'Monochrome'],
    },
    {
      key: 'materialPreference',
      label: 'Favorite materials',
      options: ['Wood & Natural Fibers', 'Metal & Glass', 'Soft Fabrics & Textiles', 'Stone & Concrete', 'Mixed Materials'],
    },
    {
      key: 'primaryGoal',
      label: 'Your main goal',
      options: ['Refresh the look', 'Maximize functionality', 'Organize & declutter', 'Express my personality', 'Prepare to sell'],
    },
  ];

  const currentField = fields[step - 1];

  const selectOption = (value) => {
    setProfile((prev) => ({ ...prev, [currentField.key]: value }));
  };

  const handleNext = async () => {
    if (step < fields.length) {
      setStep(step + 1);
    } else {
      await saveProfile();
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const saveProfile = async () => {
    setLoading(true);
    try {
      await setDoc(
        doc(db, 'users', user.uid),
        {
          ...profile,
          setupComplete: true,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
      // Persist locally for inspiration context
      localStorage.setItem('dreamdwellProfile', JSON.stringify(profile));
      localStorage.setItem('architecturalDNA', profile.architecturalStyle.toLowerCase() || 'modern');
      onComplete();
    } catch (error) {
      console.error('Failed to save profile:', error);
      alert('Could not save your profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const progress = (step / fields.length) * 100;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          background: 'var(--glass)',
          backdropFilter: 'blur(40px)',
          border: '1px solid var(--glass-border)',
          borderRadius: 24,
          padding: '40px',
          boxShadow: '0 25px 50px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--accent)',
                boxShadow: '0 0 10px var(--accent)',
              }}
            />
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                letterSpacing: '2px',
                textTransform: 'uppercase',
              }}
            >
              DreamDwell Setup
            </span>
          </div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: 8 }}>
            Tell us about your style
          </h1>
          <p style={{ fontSize: '0.85rem', opacity: 0.6 }}>
            Answer a few quick questions so Archi can give you personalized design suggestions.
          </p>
        </div>

        {/* Progress bar */}
        <div
          style={{
            height: 4,
            background: 'var(--glass-border)',
            borderRadius: 999,
            overflow: 'hidden',
            marginBottom: 32,
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              background: 'var(--accent)',
              borderRadius: 999,
              transition: 'width 0.4s ease',
            }}
          />
        </div>

        {/* Step counter */}
        <p style={{ fontSize: '0.75rem', color: 'var(--accent)', marginBottom: 16 }}>
          Question {step} of {fields.length}
        </p>

        {/* Question */}
        <h2 style={{ fontSize: '1.3rem', fontWeight: 600, marginBottom: 24 }}>
          {currentField?.label}
        </h2>

        {/* Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
          {currentField?.options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => selectOption(option)}
              style={{
                padding: '14px 18px',
                borderRadius: 12,
                border: `1.5px solid ${
                  profile[currentField.key] === option ? 'var(--accent)' : 'var(--glass-border)'
                }`,
                background:
                  profile[currentField.key] === option
                    ? 'rgba(139,92,246,0.12)'
                    : 'var(--surface)',
                color: 'var(--text)',
                fontSize: '0.88rem',
                fontWeight: profile[currentField.key] === option ? 600 : 400,
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: "'Space Grotesk', sans-serif",
                transition: 'all 0.2s',
              }}
            >
              {option}
            </button>
          ))}
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', gap: 12 }}>
          {step > 1 && (
            <button
              type="button"
              onClick={handleBack}
              className="ghost-btn"
              style={{ flex: '0 0 auto' }}
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={handleNext}
            disabled={!profile[currentField?.key] || loading}
            className="primary-neon-btn"
            style={{
              flex: 1,
              opacity: !profile[currentField?.key] ? 0.5 : 1,
              cursor: !profile[currentField?.key] ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Saving...' : step === fields.length ? 'Finish Setup' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
