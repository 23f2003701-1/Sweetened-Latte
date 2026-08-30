import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LayoutDashboard, Dumbbell, Utensils, Droplets, LogOut } from 'lucide-react';
import OnboardingFlow from './components/OnboardingFlow/OnboardingFlow';
import Dashboard from './components/Dashboard/Dashboard';
import ExerciseSession from './components/ExerciseSession/ExerciseSession';
import FoodScanner from './components/FoodScanner/FoodScanner';
import HydrationWidget from './components/HydrationWidget/HydrationWidget';
import { Toast } from './components/shared/SharedComponents';
import { hasOnboarded, getUserId, clearUser } from './lib/userSession';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const TABS = [
  { id: 'dashboard', label: 'Plan', icon: LayoutDashboard },
  { id: 'exercise', label: 'Workout', icon: Dumbbell },
  { id: 'food', label: 'Eat This?', icon: Utensils },
  { id: 'hydration', label: 'Hydration', icon: Droplets },
];

function App() {
  const [onboarded, setOnboarded] = useState(hasOnboarded());
  const [userId, setUserId] = useState(getUserId());
  const [activeTab, setActiveTab] = useState('dashboard');
  const [changeSummary, setChangeSummary] = useState(null);

  const handleOnboardComplete = ({ userId: uid }) => {
    setUserId(uid);
    setOnboarded(true);
    setActiveTab('dashboard');
  };

  const handleWorkoutEnd = (summary) => {
    if (summary) {
      setChangeSummary(summary);
      setActiveTab('dashboard');
    }
  };

  const handleReset = () => {
    if (window.confirm('Reset ZiddiFit? This will clear your local session.')) {
      clearUser();
      window.location.reload();
    }
  };

  if (!onboarded) {
    return <OnboardingFlow onComplete={handleOnboardComplete} />;
  }

  return (
    <>
      {/* Navbar */}
      <nav className="navbar">
        <div className="navbar-inner">
          <div className="logo">
            Ziddi<span>Fit</span>
          </div>
          <div className="nav-tabs">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  id={`nav-${tab.id}`}
                  className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </div>
          <button id="btn-reset" className="btn btn-ghost btn-sm" onClick={handleReset} title="Reset session">
            <LogOut size={16} />
          </button>
        </div>
      </nav>

      {/* Mobile bottom tabs */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'rgba(10,10,15,0.95)', backdropFilter: 'blur(16px)',
        borderTop: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-around', padding: '0.5rem 0',
        zIndex: 90,
      }} className="mobile-nav">
        <style>{`
          @media (min-width: 769px) { .mobile-nav { display: none !important; } }
          .page { padding-bottom: 5rem; }
        `}</style>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`mobile-nav-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                background: 'none', border: 'none', cursor: 'pointer',
                color: isActive ? 'var(--accent-green)' : 'var(--text-muted)',
                fontSize: '0.65rem', fontWeight: 600, padding: '0.4rem 1rem',
                fontFamily: 'inherit',
                transition: 'color 0.18s',
              }}
            >
              <Icon size={20} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Page content */}
      {activeTab === 'dashboard' && (
        <Dashboard
          userId={userId}
          changeSummary={changeSummary}
          onClearChange={() => setChangeSummary(null)}
        />
      )}
      {activeTab === 'exercise' && (
        <ExerciseSession userId={userId} onWorkoutEnd={handleWorkoutEnd} />
      )}
      {activeTab === 'food' && <FoodScanner userId={userId} />}
      {activeTab === 'hydration' && <HydrationWidget userId={userId} />}

      {/* Global change toast */}
      <Toast
        message={changeSummary || ''}
        visible={!!changeSummary && activeTab !== 'dashboard'}
        onClose={() => setChangeSummary(null)}
      />
    </>
  );
}

export default function Root() {
  return (
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  );
}
