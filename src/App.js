import React, { useState, useEffect } from 'react';
import './styles/App.css';
import './styles/design-tokens.css';
import { BrowserRouter as Router } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';

// Components
import SystemPortal from './pages/system-portal/index.jsx'; 
import UserSetup from './pages/user-setup/index.jsx'; 
import MainDashboard from './pages/main-dashboard/index.jsx'; 
// Deprecated - use pages/main-dashboard imports
// import Profile from './pages/profile'; 
// import Settings from './pages/settings'; 

// Firebase
import { db } from './config/firebase'; 
import { doc, getDoc } from 'firebase/firestore';

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const [setupComplete, setSetupComplete] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    const checkSetup = async () => {
      try {
        if (user) {
          const docRef = doc(db, "users", user.uid);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists() && docSnap.data().setupComplete) {
            setSetupComplete(true);
          } else {
            setSetupComplete(false);
          }
        } else {
          setSetupComplete(false);
        }
      } catch (error) {
        console.error("Auth Error:", error);
      } finally {
        setLoading(false);
      }
    };

    checkSetup();
  }, [user, authLoading]);

  // 1. LOADING STATE
  if (loading || authLoading) {
    return (
      <div style={{ backgroundColor: 'var(--bg-1)', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontFamily: "'Space Grotesk', sans-serif", fontSize: '0.9rem', fontWeight: 500 }}>
        Loading...
      </div>
    );
  }

  // 2. MAIN APP RENDER
  return (
    <div className="system-viewport" style={{ height: '100vh', width: '100vw', overflow: 'hidden', position: 'fixed' }}>
      {!user ? (
        /* FLOW 1: Not Logged In */
        <SystemPortal />
      ) : !setupComplete ? (
        /* FLOW 2: Logged In but NO DNA SET */
        <UserSetup user={user} onComplete={() => setSetupComplete(true)} />
      ) : (
        /* FLOW 3: Full Dashboard Access */
        <MainDashboard user={user} />
      )}
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <Router>
          <AppContent />
        </Router>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
