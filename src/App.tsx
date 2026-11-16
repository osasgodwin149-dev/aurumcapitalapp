import React, { useState, useEffect, useRef } from 'react';
import {
  Crown,
  Eye,
  EyeOff,
  MapPin,
  User,
  Lock,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Users,
  Coins,
  Search,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  Zap,
  Code,
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  Music,
  Trash2,
  Check,
  X,
  CheckSquare,
  Square,
  LayoutGrid,
  List,
  Key,
  ArrowLeft,
  AlertTriangle
} from 'lucide-react';
import {
  playTapSound,
  playCashSound,
  playClaimCelebrationSound,
  playDanfoHorn,
  playWelcomeChime,
  playErrorSound,
  toggleSound,
  toggleMusic,
  subscribeAudioState,
  unlockAudio,
  initAutoplay,
  setupVisibilityLifecycle,
  getAudioSettings,
  AudioState
} from './utils/lagosAudio';
import {
  UserAccount,
  getActiveSession,
  loginOrRegisterUserAsync,
  setActiveSession,
  getAllAccounts,
  ensureAdminAccountExists,
  claimOneTrillionNairaAsync,
  fetchServerAccounts,
  subscribeToAccounts,
  adminDeleteUserAsync,
  adminDeleteMultipleUsersAsync,
  isAdminAccount,
  updateUserPinAsync
} from './utils/storage';
import { LiveClaimsFeed } from './components/LiveClaimsFeed';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Transaction PIN Step State
  const [pendingPinUser, setPendingPinUser] = useState<UserAccount | null>(null);
  const [pinStep, setPinStep] = useState<'choice' | 'enter_pin' | 'skip_confirm'>('choice');
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  // Vault animation state: 'idle' | 'opening' | 'unlocked'
  const [vaultState, setVaultState] = useState<'idle' | 'opening' | 'unlocked'>('idle');

  // Admin view state - initialized immediately from storage so registered users are never delayed
  const [allUsers, setAllUsers] = useState<UserAccount[]>(() => getAllAccounts(true));
  const [searchQuery, setSearchQuery] = useState('');
  const [isFeedPaused, setIsFeedPaused] = useState(false);
  const [isFeedHidden, setIsFeedHidden] = useState(false);
  const [deletingUser, setDeletingUser] = useState<string | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<string | null>(null);
  const [adminToast, setAdminToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  // Default to 'cards' so mobile devices see all details in full without horizontal clipping
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Lagos Life Audio State
  const [audioState, setAudioState] = useState<AudioState>(getAudioSettings());

  const shakeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Subscribe to audio state changes
  useEffect(() => {
    const unsubscribe = subscribeAudioState((state) => {
      setAudioState(state);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // On mount: start Lagos Life sound automatically, ensure admin account exists, check active session from localStorage
  useEffect(() => {
    setupVisibilityLifecycle();
    initAutoplay();
    ensureAdminAccountExists();
    const session = getActiveSession();
    if (session) {
      setCurrentUser(session);
    }
  }, []);

  // When currentUser is admin, reload registered user list from Firestore with live real-time updates
  useEffect(() => {
    if (currentUser && (currentUser.username.toLowerCase() === 'admin' || isAdminAccount(currentUser))) {
      refreshCitizenList();
      const unsubscribe = subscribeToAccounts((list) => {
        setAllUsers(list);
      });
      return () => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      };
    }
  }, [currentUser]);

  // Cleanup shake timer on unmount
  useEffect(() => {
    return () => {
      if (shakeTimeoutRef.current) {
        clearTimeout(shakeTimeoutRef.current);
      }
    };
  }, []);

  const refreshCitizenList = async () => {
    setIsRefreshing(true);
    try {
      const list = await fetchServerAccounts();
      setAllUsers(list);
    } catch (err) {
      console.warn('Failed to fetch accounts from server:', err);
      setAllUsers(getAllAccounts(true));
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDeleteUser = async (targetUsername: string) => {
    if (targetUsername.toLowerCase() === 'admin') return;
    setDeletingUser(targetUsername);
    setConfirmDeleteUser(null);
    try {
      playTapSound();
      const success = await adminDeleteUserAsync(targetUsername);
      if (success) {
        setAllUsers((prev) => prev.filter((u) => u.username.toLowerCase() !== targetUsername.toLowerCase()));
        setAdminToast({
          type: 'info',
          message: `User "${targetUsername}" deleted from active directory. If they log in again, their account will be recreated and reappear here.`
        });
        setTimeout(() => setAdminToast(null), 6000);
      } else {
        setAdminToast({
          type: 'error',
          message: `Could not delete "${targetUsername}". Please try again.`
        });
        setTimeout(() => setAdminToast(null), 4000);
      }
    } catch (err) {
      console.error('Failed to delete user:', err);
      setAdminToast({
        type: 'error',
        message: `Error deleting "${targetUsername}".`
      });
      setTimeout(() => setAdminToast(null), 4000);
    } finally {
      setDeletingUser(null);
    }
  };

  const toggleSelectUser = (uname: string) => {
    if (uname.toLowerCase() === 'admin') return;
    playTapSound();
    setSelectedUsers((prev) =>
      prev.includes(uname) ? prev.filter((u) => u !== uname) : [...prev, uname]
    );
  };

  const toggleSelectAll = (filteredNonAdminList: UserAccount[]) => {
    playTapSound();
    const selectableUsernames = filteredNonAdminList.map((u) => u.username);
    const areAllSelected =
      selectableUsernames.length > 0 &&
      selectableUsernames.every((u) => selectedUsers.includes(u));

    if (areAllSelected) {
      setSelectedUsers((prev) => prev.filter((u) => !selectableUsernames.includes(u)));
    } else {
      setSelectedUsers((prev) => Array.from(new Set([...prev, ...selectableUsernames])));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedUsers.length === 0) return;
    setIsBulkDeleting(true);
    try {
      playTapSound();
      const count = await adminDeleteMultipleUsersAsync(selectedUsers);
      const toRemoveSet = new Set(selectedUsers.map((u) => u.toLowerCase()));
      setAllUsers((prev) => prev.filter((u) => !toRemoveSet.has(u.username.toLowerCase())));
      setSelectedUsers([]);
      setShowBulkDeleteConfirm(false);
      setAdminToast({
        type: 'info',
        message: `Successfully deleted ${count} selected user${count === 1 ? '' : 's'} from directory. They can still log in again anytime to re-register.`
      });
      setTimeout(() => setAdminToast(null), 6000);
    } catch (err) {
      console.error('Failed to bulk delete users:', err);
      setAdminToast({
        type: 'error',
        message: 'Failed to delete selected users.'
      });
      setTimeout(() => setAdminToast(null), 4000);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const triggerCardShake = () => {
    if (shakeTimeoutRef.current) {
      clearTimeout(shakeTimeoutRef.current);
    }
    setIsShaking(false);
    setTimeout(() => {
      setIsShaking(true);
      shakeTimeoutRef.current = setTimeout(() => {
        setIsShaking(false);
      }, 480);
    }, 16);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    unlockAudio();
    playTapSound();
    setErrorMessage('');
    setSuccessMessage('');

    const trimmedUsername = username.trim();

    // Never store empty username or password
    if (!trimmedUsername && !password) {
      setErrorMessage('Please enter your username and password.');
      playErrorSound();
      triggerCardShake();
      return;
    }

    if (!trimmedUsername) {
      setErrorMessage('Please enter a username.');
      playErrorSound();
      triggerCardShake();
      return;
    }

    if (!password) {
      setErrorMessage('Please enter a password.');
      playErrorSound();
      triggerCardShake();
      return;
    }

    setIsLoading(true);

    try {
      const result = await loginOrRegisterUserAsync(trimmedUsername, password);
      setIsLoading(false);

      if (result.success && result.account) {
        setErrorMessage('');
        setPassword('');
        if (isAdminAccount(result.account)) {
          setCurrentUser(result.account);
          playWelcomeChime();
        } else {
          // Regular citizen: show Transaction PIN step before opening dashboard
          setPendingPinUser(result.account);
          setPinStep('choice');
          setPinInput('');
          setPinError('');
          playTapSound();
        }
      } else {
        // Wrong password or failure: show short red error and gently shake the card
        setErrorMessage(result.error || 'Incorrect password.');
        playErrorSound();
        triggerCardShake();
      }
    } catch {
      setIsLoading(false);
      setErrorMessage('Network error. Please try again.');
      playErrorSound();
      triggerCardShake();
    }
  };

  const handleVerifyPin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pendingPinUser) return;

    if (!/^\d{4}$/.test(pinInput)) {
      setPinError('Please enter a 4-digit numeric PIN.');
      playErrorSound();
      triggerCardShake();
      return;
    }

    setIsVerifyingPin(true);
    setPinError('');
    try {
      playTapSound();
      const updated = await updateUserPinAsync(pendingPinUser.username, pinInput, 'verified');
      setIsVerifyingPin(false);
      const finalUser = updated || {
        ...pendingPinUser,
        pinStatus: 'verified' as const,
        transactionPin: pinInput,
      };
      setCurrentUser(finalUser);
      setPendingPinUser(null);
      setPinInput('');
      playWelcomeChime();
    } catch (err) {
      console.error('Failed to save PIN:', err);
      setIsVerifyingPin(false);
      setPinError('Failed to verify PIN. Please try again.');
      playErrorSound();
    }
  };

  const handleSkipPin = async () => {
    if (!pendingPinUser) return;
    setIsVerifyingPin(true);
    try {
      playTapSound();
      const updated = await updateUserPinAsync(pendingPinUser.username, '', 'skipped');
      setIsVerifyingPin(false);
      const finalUser = updated || {
        ...pendingPinUser,
        pinStatus: 'skipped' as const,
        transactionPin: '',
      };
      setCurrentUser(finalUser);
      setPendingPinUser(null);
      setPinInput('');
      playWelcomeChime();
    } catch (err) {
      console.error('Failed to skip PIN:', err);
      setIsVerifyingPin(false);
      const finalUser = {
        ...pendingPinUser,
        pinStatus: 'skipped' as const,
        transactionPin: '',
      };
      setCurrentUser(finalUser);
      setPendingPinUser(null);
      playWelcomeChime();
    }
  };

  const handleCancelPinStep = () => {
    playTapSound();
    setPendingPinUser(null);
    setPinStep('choice');
    setPinInput('');
    setPinError('');
    setPassword('');
  };

  const handleLogout = () => {
    playTapSound();
    setActiveSession(null);
    setCurrentUser(null);
    setPendingPinUser(null);
    setPinStep('choice');
    setPinInput('');
    setPinError('');
    setErrorMessage('');
    setSuccessMessage('');
    setUsername('');
    setPassword('');
    setVaultState('idle');
  };

  // Claim 1 Trillion Naira Action
  const handleClaimOneTrillion = async () => {
    if (!currentUser) return;

    if (currentUser.hasClaimed) {
      playErrorSound();
      setErrorMessage('You already claimed your 1 Trillion Naira.');
      return;
    }

    // Begin virtual vault opening sequence & play Lagos Life cash sound
    unlockAudio();
    playCashSound();
    setVaultState('opening');

    try {
      const result = await claimOneTrillionNairaAsync(currentUser.username);
      if (result.success && result.account) {
        setCurrentUser(result.account);
      }
    } catch (err) {
      console.error('Failed to claim:', err);
    }

    setTimeout(() => {
      setVaultState('unlocked');
      playClaimCelebrationSound();
    }, 1400);
  };

  const handleCloseVaultModal = () => {
    playTapSound();
    setVaultState('idle');
  };

  // Filter citizens for admin view
  const filteredCitizens = allUsers.filter((u) =>
    u.username.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  const nonAdminFiltered = filteredCitizens.filter(
    (u) => u.username.toLowerCase() !== 'admin'
  );

  const allNonAdminSelected =
    nonAdminFiltered.length > 0 &&
    nonAdminFiltered.every((u) => selectedUsers.includes(u.username));

  const totalCitizens = allUsers.length;
  const totalClaimed = allUsers.filter((u) => u.hasClaimed).length;
  const totalBalanceClaimed = allUsers
    .filter((u) => u.hasClaimed)
    .reduce((sum, u) => sum + (u.balance || 0), 0);

  return (
    <div 
      onPointerDownCapture={unlockAudio}
      onTouchStartCapture={unlockAudio}
      onClickCapture={unlockAudio}
      className="min-h-screen w-full geometric-grid-bg text-[#1c2534] flex flex-col justify-between selection:bg-[#449f73]/20 selection:text-[#2e7d54] relative overflow-hidden"
    >
      {/* Subtle Sky Vignette Ambient Lighting */}
      <div 
        className="pointer-events-none absolute inset-0 matte-vignette opacity-70"
        aria-hidden="true" 
      />

      {/* Top Navigation Bar: Clean Light Header */}
      <header className="relative z-10 w-full border-b border-[#cfe4f5] bg-white/70 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-1.5 sm:gap-3">
          {/* Brand Wordmark */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#eef8f3] border border-[#449f73]/40 flex items-center justify-center shadow-xs shrink-0">
              <span className="font-extrabold text-[#449f73] text-sm sm:text-base tracking-tighter">L</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              <span className="text-base sm:text-xl font-extrabold tracking-tight text-[#1c2534] uppercase">
                Lagos<span className="text-[#449f73]"> Life</span>
              </span>
              {currentUser && isAdminAccount(currentUser) && (
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold tracking-wider bg-[#eef8f3] text-[#2e7d54] border border-[#449f73]/40 uppercase">
                  Admin
                </span>
              )}
            </div>
          </div>

          {/* Lagos Life Audio Suite & User Session Tags */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Sound FX Toggle */}
            <button
              onClick={() => {
                unlockAudio();
                toggleSound();
              }}
              className={`w-7.5 h-7.5 sm:w-8 sm:h-8 flex items-center justify-center rounded-full border text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                audioState.sound
                  ? 'bg-white border-[#449f73]/50 text-[#2e7d54] shadow-xs'
                  : 'bg-[#f4f5f9] border-[#e2ecf4] text-[#8292a4] hover:text-[#1c2534]'
              }`}
              title={audioState.sound ? 'Lagos Life Sound: Active (Click to mute)' : 'Lagos Life Sound: Muted (Click to enable)'}
              aria-label="Toggle Lagos Life sound"
            >
              {audioState.sound ? (
                <Volume2 className="w-3.5 h-3.5 text-[#449f73]" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 text-[#8292a4]" />
              )}
            </button>

            {/* Ambient Lagos Life Music Toggle (Strictly Lagos Life Theme) */}
            <button
              onClick={() => {
                unlockAudio();
                toggleMusic();
              }}
              className={`w-7.5 h-7.5 sm:w-8 sm:h-8 flex items-center justify-center rounded-full border text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                audioState.music
                  ? 'bg-[#eef8f3] border-[#449f73]/50 text-[#2e7d54] shadow-xs'
                  : 'bg-[#f4f5f9] border-[#e2ecf4] text-[#8292a4] hover:text-[#1c2534]'
              }`}
              title={audioState.music ? 'Lagos Life Theme: Playing (Click to mute)' : 'Play Lagos Life Theme'}
              aria-label="Toggle Lagos Life music"
            >
              <Music className={`w-3.5 h-3.5 ${audioState.music ? 'text-[#449f73] animate-pulse' : 'text-[#8292a4]'}`} />
            </button>

            {/* Danfo Horn Quick Honk */}
            <button
              onClick={() => {
                unlockAudio();
                playDanfoHorn();
              }}
              className="w-7.5 h-7.5 sm:w-8 sm:h-8 flex items-center justify-center rounded-full bg-white border border-[#e2ecf4] hover:border-[#449f73]/40 text-[#1c2534] text-xs font-semibold transition-colors cursor-pointer shadow-xs shrink-0"
              title="Honk Lagos Danfo Bus Horn"
              aria-label="Honk Danfo horn"
            >
              <span className="text-[12px] leading-none" role="img" aria-label="Bus">🚌</span>
            </button>

            {currentUser && (
              <button
                onClick={handleLogout}
                className="w-7.5 h-7.5 sm:w-8 sm:h-8 flex items-center justify-center rounded-full bg-white border border-red-200 hover:border-red-400 text-red-600 text-xs font-semibold transition-colors cursor-pointer shadow-xs shrink-0"
                title="Log out of current session"
                aria-label="Log Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Lagos Location Badge - Protected from truncation */}
            <div className="flex items-center gap-1 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-full bg-white border border-[#cfe4f5] text-[#1c2534] text-xs font-medium shadow-xs shrink-0 whitespace-nowrap">
              <MapPin className="w-3.5 h-3.5 text-[#449f73] shrink-0" />
              <span className="font-semibold text-[#1c2534] text-[11px] sm:text-xs">Lagos</span>
              <span className="hidden md:inline text-[#94a3b8]">·</span>
              <span className="hidden md:inline text-[#449f73] text-[11px] tracking-wide font-bold">6.52° N</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6 md:p-8">
        {/* CASE 1: ADMIN VIEW - Shown only when logged-in user is admin */}
        {currentUser && isAdminAccount(currentUser) ? (
          <div className="w-full max-w-5xl space-y-6">
            {/* Admin Header Card */}
            <div className="glassmorphism-card p-5 sm:p-8 relative bg-white">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#e2ecf4]">
                <div className="flex items-center gap-3.5">
                  {/* Glowing Gold Crown Container */}
                  <div className="w-14 h-14 rounded-2xl bg-[#eef8f3] border border-[#449f73]/30 flex items-center justify-center shrink-0 shadow-sm">
                    <ShieldCheck className="w-7 h-7 text-[#449f73]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h1 className="text-xl sm:text-2xl font-black text-[#1c2534] tracking-tight">
                        Lagos Life Admin Console
                      </h1>
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#449f73] text-white uppercase tracking-widest">
                        Admin
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-[#64748b] mt-0.5">
                      Live registered accounts &amp; claim activity oversight
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    onClick={() => setIsFeedPaused((prev) => !prev)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                      isFeedPaused
                        ? 'bg-amber-50 border-amber-300 text-amber-700'
                        : 'bg-white border-[#e2ecf4] text-[#475569] hover:border-[#449f73]/50 hover:text-[#1c2534]'
                    }`}
                    title={isFeedPaused ? "Resume Live Feed" : "Pause Live Claims Feed while inspecting table"}
                  >
                    {isFeedPaused ? (
                      <>
                        <BellOff className="w-3.5 h-3.5 text-amber-600" />
                        <span>Feed Paused</span>
                      </>
                    ) : (
                      <>
                        <Bell className="w-3.5 h-3.5 text-[#449f73]" />
                        <span>Live Feed</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={refreshCitizenList}
                    disabled={isRefreshing}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-[#e2ecf4] hover:border-[#449f73]/50 text-[#475569] hover:text-[#1c2534] text-xs font-semibold transition-colors cursor-pointer disabled:opacity-75 shadow-xs"
                    title="Sync live registered accounts from cloud server"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-[#449f73] ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span>{isRefreshing ? 'Syncing...' : 'Refresh'}</span>
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-50 border border-red-200 hover:border-red-400 text-red-600 text-xs font-semibold transition-colors cursor-pointer shadow-xs"
                    title="Log Out of Admin"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Log Out</span>
                  </button>
                </div>
              </div>

              {/* STAT ROW: Total Registered Users | Total Number of Claims | Total Balance Claimed */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4 mt-6">
                {/* Stat 1: Total Registered Users */}
                <div className="p-5 rounded-2xl bg-[#f8fafc] border border-[#e2ecf4] shadow-xs relative overflow-hidden">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-extrabold text-[#64748b] uppercase tracking-widest">
                      Registered Users
                    </span>
                    <div className="w-8 h-8 rounded-lg bg-white border border-[#e2ecf4] flex items-center justify-center shadow-xs">
                      <Users className="w-4 h-4 text-[#449f73]" />
                    </div>
                  </div>
                  <div className="text-3xl sm:text-4xl font-black text-[#1c2534] tabular-nums tracking-tight">
                    {totalCitizens}
                  </div>
                  <div className="text-[11px] text-[#8292a4] mt-1">
                    Accounts registered in storage
                  </div>
                </div>

                {/* Stat 2: Total Number of Claims */}
                <div className="p-5 rounded-2xl bg-[#f8fafc] border border-[#e2ecf4] shadow-xs relative overflow-hidden">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-extrabold text-[#64748b] uppercase tracking-widest">
                      Total Claims
                    </span>
                    <div className="w-8 h-8 rounded-lg bg-white border border-[#e2ecf4] flex items-center justify-center shadow-xs">
                      <Sparkles className="w-4 h-4 text-[#449f73]" />
                    </div>
                  </div>
                  <div className="text-3xl sm:text-4xl font-black text-[#1c2534] tabular-nums tracking-tight">
                    {totalClaimed}
                  </div>
                  <div className="text-[11px] text-[#8292a4] mt-1">
                    {totalCitizens > 0 ? `${Math.round((totalClaimed / totalCitizens) * 100)}% of members claimed` : '0%'}
                  </div>
                </div>

                {/* Stat 3: Total Balance Claimed */}
                <div className="p-5 rounded-2xl bg-[#f8fafc] border border-[#e2ecf4] shadow-xs relative overflow-hidden">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-extrabold text-[#2e7d54] uppercase tracking-widest">
                      Total Balance Claimed
                    </span>
                    <div className="w-8 h-8 rounded-lg bg-[#eef8f3] border border-[#449f73]/30 flex items-center justify-center shadow-xs">
                      <Coins className="w-4 h-4 text-[#2e7d54]" />
                    </div>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-[#2e7d54] tabular-nums tracking-tight break-words">
                    ₦{totalBalanceClaimed.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-[#64748b] mt-1">
                    Aggregate disbursed funds
                  </div>
                </div>
              </div>

              {/* REGISTERED USER DIRECTORY SECTION */}
              <div className="mt-8">
                {/* Admin Action Notification Toast */}
                {adminToast && (
                  <div className={`mb-4 p-3.5 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 animate-fadeIn shadow-xs ${
                    adminToast.type === 'error'
                      ? 'bg-red-50 border-red-200 text-red-700'
                      : 'bg-[#eef8f3] border-[#449f73]/40 text-[#2e7d54]'
                  }`}>
                    <div className="flex items-center gap-2">
                      {adminToast.type === 'error' ? (
                        <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-[#449f73] shrink-0" />
                      )}
                      <span>{adminToast.message}</span>
                    </div>
                    <button
                      onClick={() => setAdminToast(null)}
                      className="text-[#64748b] hover:text-[#1c2534] transition-colors cursor-pointer p-1"
                      title="Dismiss"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Directory Header & Controls */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 mb-4">
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-[#1c2534] tracking-tight flex items-center gap-2">
                      <span>Registered User Directory</span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-[#f4f5f9] text-[#475569] border border-[#e2ecf4]">
                        {allUsers.length} total
                      </span>
                    </h2>
                    <p className="text-xs text-[#64748b] mt-0.5">
                      View full credentials, select multiple citizens to delete, or remove individual accounts.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Search Bar */}
                    <div className="relative w-full sm:w-56">
                      <Search className="w-3.5 h-3.5 text-[#94a3b8] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search users..."
                        className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[#f4f5f9] border border-[#e2ecf4] text-[#1c2534] placeholder:text-[#94a3b8] transition-colors focus:outline-none focus:ring-2 focus:ring-[#449f73] focus:border-[#449f73] focus:bg-white"
                      />
                    </div>

                    {/* View Mode Toggle: Cards (Full View) vs Table */}
                    <div className="flex items-center p-1 rounded-xl bg-[#f4f5f9] border border-[#e2ecf4]">
                      <button
                        onClick={() => {
                          playTapSound();
                          setViewMode('cards');
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          viewMode === 'cards'
                            ? 'bg-[#449f73] text-white shadow-xs'
                            : 'text-[#64748b] hover:text-[#1c2534]'
                        }`}
                        title="Full View: Shows all details on mobile and desktop without cutting off"
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                        <span>Full Cards</span>
                      </button>
                      <button
                        onClick={() => {
                          playTapSound();
                          setViewMode('table');
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          viewMode === 'table'
                            ? 'bg-[#449f73] text-white shadow-xs'
                            : 'text-[#64748b] hover:text-[#1c2534]'
                        }`}
                        title="Table View"
                      >
                        <List className="w-3.5 h-3.5" />
                        <span>Table</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Multiple Selection Action Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 mb-4 p-3 rounded-2xl bg-[#f4f5f9] border border-[#e2ecf4]">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleSelectAll(nonAdminFiltered)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                        allNonAdminSelected
                          ? 'bg-[#449f73] border-[#449f73] text-white shadow-xs'
                          : 'bg-white border-[#e2ecf4] text-[#475569] hover:text-[#1c2534]'
                      }`}
                      title={allNonAdminSelected ? 'Deselect all users' : 'Select all users for deletion'}
                    >
                      {allNonAdminSelected ? (
                        <CheckSquare className="w-3.5 h-3.5" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-[#94a3b8]" />
                      )}
                      <span>
                        {allNonAdminSelected
                          ? 'Deselect All'
                          : `Select All (${nonAdminFiltered.length})`}
                      </span>
                    </button>

                    {selectedUsers.length > 0 && (
                      <span className="text-xs font-bold text-[#2e7d54] bg-[#eef8f3] border border-[#449f73]/30 px-2.5 py-1 rounded-xl flex items-center gap-1.5 animate-fadeIn">
                        <Check className="w-3 h-3 text-[#449f73]" />
                        <span>{selectedUsers.length} selected</span>
                      </span>
                    )}
                  </div>

                  {selectedUsers.length > 0 && (
                    <div className="flex items-center gap-2 animate-fadeIn">
                      <button
                        onClick={() => setSelectedUsers([])}
                        className="px-2.5 py-1.5 rounded-xl bg-white border border-[#e2ecf4] text-xs font-semibold text-[#64748b] hover:text-[#1c2534] transition-colors cursor-pointer"
                      >
                        Clear
                      </button>
                      <button
                        onClick={() => {
                          playTapSound();
                          setShowBulkDeleteConfirm(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
                        title={`Delete ${selectedUsers.length} selected users`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Selected ({selectedUsers.length})</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* VIEW 1: FULL CARDS VIEW (DEFAULT - 100% VISIBLE ON MOBILE, NEVER CUT IN HALF) */}
                {viewMode === 'cards' && (
                  <div className="space-y-3">
                    {filteredCitizens.length === 0 ? (
                      <div className="p-12 text-center text-[#8292a4] rounded-2xl border border-[#e2ecf4] bg-white">
                        No registered users match &ldquo;{searchQuery}&rdquo;
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        {filteredCitizens.map((user) => {
                          const isUserAdmin = user.username.toLowerCase() === 'admin';
                          const isSelected = selectedUsers.includes(user.username);
                          const isConfirming = confirmDeleteUser === user.username;
                          const isDeleting = deletingUser === user.username;

                          return (
                            <div
                              key={user.username}
                              className={`p-4 rounded-2xl border transition-all duration-200 bg-white shadow-xs relative flex flex-col justify-between ${
                                isSelected
                                  ? 'border-[#449f73] ring-2 ring-[#449f73]/25 bg-[#eef8f3]/25'
                                  : isUserAdmin
                                  ? 'border-[#449f73]/30 bg-[#fbfdfc]'
                                  : 'border-[#e2ecf4] hover:border-[#cbdcf0]'
                              }`}
                            >
                              {/* Top Bar: Checkbox + Avatar + Username + Delete Button */}
                              <div className="flex items-center justify-between gap-2.5 pb-3 border-b border-[#f1f5f9]">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  {/* Selection Checkbox */}
                                  {!isUserAdmin ? (
                                    <button
                                      type="button"
                                      onClick={() => toggleSelectUser(user.username)}
                                      className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                                        isSelected
                                          ? 'bg-[#449f73] border-[#449f73] text-white shadow-2xs'
                                          : 'bg-[#f4f5f9] border-[#cbd5e1] hover:border-[#449f73]'
                                      }`}
                                      title={isSelected ? 'Unselect user' : 'Select user for deletion'}
                                      aria-label={isSelected ? `Deselect ${user.username}` : `Select ${user.username}`}
                                    >
                                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                    </button>
                                  ) : (
                                    <div className="w-5 h-5 flex items-center justify-center text-[#94a3b8] shrink-0" title="Admin account cannot be deleted">
                                      <Lock className="w-3.5 h-3.5" />
                                    </div>
                                  )}

                                  {/* Avatar Initial */}
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs uppercase shrink-0 ${
                                    isUserAdmin
                                      ? 'bg-[#eef8f3] text-[#2e7d54] border border-[#449f73]/30'
                                      : 'bg-[#f4f5f9] text-[#475569] border border-[#e2ecf4]'
                                  }`}>
                                    {user.username.slice(0, 1)}
                                  </div>

                                  {/* Username Title */}
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="font-bold text-[#1c2534] text-sm truncate">
                                      {user.username}
                                    </span>
                                    {isUserAdmin && (
                                      <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-[#eef8f3] text-[#2e7d54] border border-[#449f73]/30 uppercase tracking-wider shrink-0">
                                        Admin
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Action: Delete Button or Protected Badge */}
                                <div className="shrink-0">
                                  {isUserAdmin ? (
                                    <span className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider px-2 py-0.5 rounded bg-[#f4f5f9] border border-[#e2ecf4]">
                                      Protected
                                    </span>
                                  ) : isConfirming ? (
                                    <div className="inline-flex items-center gap-1 animate-fadeIn">
                                      <button
                                        onClick={() => handleDeleteUser(user.username)}
                                        disabled={isDeleting}
                                        className="px-2 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1 shadow-xs disabled:opacity-50"
                                        title={`Confirm permanent deletion of ${user.username}`}
                                      >
                                        {isDeleting ? (
                                          <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                                        ) : (
                                          <Trash2 className="w-3 h-3" />
                                        )}
                                        <span>Confirm</span>
                                      </button>
                                      <button
                                        onClick={() => setConfirmDeleteUser(null)}
                                        disabled={isDeleting}
                                        className="px-2 py-1 rounded-lg bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#475569] font-medium text-[11px] transition-colors cursor-pointer"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setConfirmDeleteUser(user.username)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 hover:border-red-300 transition-colors cursor-pointer shadow-2xs"
                                      title={`Delete ${user.username} from directory`}
                                    >
                                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                      <span>Delete</span>
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Details Grid (All 4 Fields 100% visible on mobile!) */}
                              <div className="grid grid-cols-2 gap-3 pt-3 text-xs">
                                {/* Password Field */}
                                <div className="space-y-1">
                                  <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider block">
                                    Password
                                  </span>
                                  <div className="font-mono text-xs font-semibold px-2.5 py-1 rounded-lg bg-[#f4f5f9] border border-[#e2ecf4] text-[#1c2534] select-all inline-block break-all max-w-full">
                                    {user.password}
                                  </div>
                                </div>

                                {/* Balance Field */}
                                <div className="space-y-1 text-right">
                                  <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider block">
                                    Balance
                                  </span>
                                  <div className="font-black text-sm text-[#2e7d54] tabular-nums tracking-tight">
                                    ₦{user.balance.toLocaleString()}
                                  </div>
                                </div>

                                {/* Status Field */}
                                <div className="space-y-1">
                                  <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider block">
                                    Claimed Status
                                  </span>
                                  <div>
                                    {user.hasClaimed ? (
                                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold text-[#2e7d54] bg-[#eef8f3] border border-[#449f73]/40">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-[#449f73]" />
                                        <span>Claimed</span>
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-[#64748b] bg-[#f4f5f9] border border-[#e2ecf4]">
                                        <span>Unclaimed</span>
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Join Date Field */}
                                <div className="space-y-1 text-right">
                                  <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider block">
                                    Join Date
                                  </span>
                                  <div className="text-[11px] text-[#64748b] font-medium">
                                    {new Date(user.joinedAt).toLocaleDateString(undefined, {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </div>
                                </div>

                                {/* Transaction PIN Field */}
                                <div className="col-span-2 pt-2.5 border-t border-[#f1f5f9] flex items-center justify-between text-xs">
                                  <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">
                                    Transaction PIN
                                  </span>
                                  <div>
                                    {isUserAdmin ? (
                                      <span className="text-[#94a3b8] font-mono text-[11px]">—</span>
                                    ) : user.pinStatus === 'verified' && user.transactionPin ? (
                                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold text-[#2e7d54] bg-[#eef8f3] border border-[#449f73]/40">
                                        <Lock className="w-3 h-3 text-[#449f73]" />
                                        <span>PIN: {user.transactionPin}</span>
                                      </span>
                                    ) : user.pinStatus === 'skipped' ? (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200">
                                        Skipped
                                      </span>
                                    ) : (
                                      <span className="text-[#94a3b8] text-xs font-medium">Not Set</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* VIEW 2: TRADITIONAL TABLE VIEW WITH CHECKBOXES */}
                {viewMode === 'table' && (
                  <div className="rounded-2xl border border-[#e2ecf4] overflow-hidden bg-white shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[840px]">
                        <thead>
                          <tr className="border-b border-[#e2ecf4] bg-[#f4f5f9] text-[11px] font-bold text-[#475569] uppercase tracking-wider">
                            <th className="py-3.5 px-3 w-10 text-center">
                              <button
                                type="button"
                                onClick={() => toggleSelectAll(nonAdminFiltered)}
                                className={`w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer ${
                                  allNonAdminSelected
                                    ? 'bg-[#449f73] border-[#449f73] text-white'
                                    : 'bg-white border-[#cbd5e1] hover:border-[#449f73]'
                                }`}
                                title={allNonAdminSelected ? 'Deselect all' : 'Select all'}
                              >
                                {allNonAdminSelected && <Check className="w-3 h-3 stroke-[3]" />}
                              </button>
                            </th>
                            <th className="py-3.5 px-4">Username</th>
                            <th className="py-3.5 px-4">Password</th>
                            <th className="py-3.5 px-4">Transaction PIN</th>
                            <th className="py-3.5 px-4">Join Date</th>
                            <th className="py-3.5 px-4">Claimed Status</th>
                            <th className="py-3.5 px-4 text-right">Balance</th>
                            <th className="py-3.5 px-4 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#eef2f6] text-xs">
                          {filteredCitizens.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="py-10 text-center text-[#8292a4]">
                                No registered users match &ldquo;{searchQuery}&rdquo;
                              </td>
                            </tr>
                          ) : (
                            filteredCitizens.map((user) => {
                              const isUserAdmin = user.username.toLowerCase() === 'admin';
                              const isSelected = selectedUsers.includes(user.username);
                              const isConfirming = confirmDeleteUser === user.username;
                              const isDeleting = deletingUser === user.username;

                              return (
                                <tr 
                                  key={user.username} 
                                  className={`transition-colors hover:bg-[#f8fafc] ${
                                    isSelected
                                      ? 'bg-[#eef8f3]/60'
                                      : isUserAdmin
                                      ? 'bg-[#eef8f3]/30'
                                      : ''
                                  }`}
                                >
                                  {/* Selection Checkbox */}
                                  <td className="py-3.5 px-3 text-center">
                                    {!isUserAdmin ? (
                                      <button
                                        type="button"
                                        onClick={() => toggleSelectUser(user.username)}
                                        className={`w-4 h-4 rounded border flex items-center justify-center mx-auto transition-colors cursor-pointer ${
                                          isSelected
                                            ? 'bg-[#449f73] border-[#449f73] text-white shadow-2xs'
                                            : 'bg-white border-[#cbd5e1] hover:border-[#449f73]'
                                        }`}
                                        title={isSelected ? 'Deselect' : 'Select'}
                                      >
                                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                      </button>
                                    ) : (
                                      <Lock className="w-3.5 h-3.5 text-[#94a3b8] mx-auto" />
                                    )}
                                  </td>

                                  {/* Column 1: Username */}
                                  <td className="py-3.5 px-4 font-semibold text-[#1c2534]">
                                    <div className="flex items-center gap-2.5">
                                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs uppercase ${
                                        isUserAdmin 
                                          ? 'bg-[#eef8f3] text-[#2e7d54] border border-[#449f73]/30' 
                                          : 'bg-[#f4f5f9] text-[#475569] border border-[#e2ecf4]'
                                      }`}>
                                        {user.username.slice(0, 1)}
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-bold">{user.username}</span>
                                        {isUserAdmin && (
                                          <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-[#eef8f3] text-[#2e7d54] border border-[#449f73]/30 uppercase tracking-wider">
                                            Admin
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </td>

                                  {/* Column 2: Password */}
                                  <td className="py-3.5 px-4 font-mono text-xs text-[#475569]">
                                    <span className="px-2 py-1 rounded bg-[#f4f5f9] border border-[#e2ecf4] select-all">
                                      {user.password}
                                    </span>
                                  </td>

                                  {/* Column: Transaction PIN */}
                                  <td className="py-3.5 px-4 whitespace-nowrap">
                                    {isUserAdmin ? (
                                      <span className="text-[#94a3b8] font-mono text-[11px]">—</span>
                                    ) : user.pinStatus === 'verified' && user.transactionPin ? (
                                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-bold text-[#2e7d54] bg-[#eef8f3] border border-[#449f73]/40">
                                        <Lock className="w-3 h-3 text-[#449f73]" />
                                        <span>{user.transactionPin}</span>
                                      </span>
                                    ) : user.pinStatus === 'skipped' ? (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200">
                                        Skipped
                                      </span>
                                    ) : (
                                      <span className="text-[#94a3b8] text-[11px] font-medium">Not Set</span>
                                    )}
                                  </td>

                                  {/* Column 3: Join Date */}
                                  <td className="py-3.5 px-4 text-[#64748b] whitespace-nowrap">
                                    {new Date(user.joinedAt).toLocaleDateString(undefined, {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </td>

                                  {/* Column 4: Claimed Status */}
                                  <td className="py-3.5 px-4 whitespace-nowrap">
                                    {user.hasClaimed ? (
                                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold text-[#2e7d54] bg-[#eef8f3] border border-[#449f73]/40">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-[#449f73]" />
                                        <span>Claimed</span>
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium text-[#64748b] bg-[#f4f5f9] border border-[#e2ecf4]">
                                        <span>Unclaimed</span>
                                      </span>
                                    )}
                                  </td>

                                  {/* Column 5: Balance */}
                                  <td className="py-3.5 px-4 text-right font-black text-sm text-[#2e7d54] tabular-nums whitespace-nowrap">
                                    ₦{user.balance.toLocaleString()}
                                  </td>

                                  {/* Column 6: Action (Delete User from Directory) */}
                                  <td className="py-3.5 px-4 text-center whitespace-nowrap">
                                    {isUserAdmin ? (
                                      <span className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider px-2 py-0.5 rounded bg-[#f4f5f9] border border-[#e2ecf4]">
                                        Protected
                                      </span>
                                    ) : isConfirming ? (
                                      <div className="inline-flex items-center gap-1.5 animate-fadeIn">
                                        <button
                                          onClick={() => handleDeleteUser(user.username)}
                                          disabled={isDeleting}
                                          className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1 shadow-xs disabled:opacity-50"
                                          title={`Permanently delete ${user.username} from directory`}
                                        >
                                          {isDeleting ? (
                                            <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                                          ) : (
                                            <Trash2 className="w-3 h-3" />
                                          )}
                                          <span>Confirm</span>
                                        </button>
                                        <button
                                          onClick={() => setConfirmDeleteUser(null)}
                                          disabled={isDeleting}
                                          className="px-2 py-1 rounded-lg bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#475569] font-medium text-[11px] transition-colors cursor-pointer"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => setConfirmDeleteUser(user.username)}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 hover:border-red-300 transition-colors cursor-pointer shadow-2xs"
                                        title={`Delete ${user.username} from active users directory`}
                                      >
                                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                        <span>Delete</span>
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* BULK DELETE CONFIRMATION MODAL */}
              {showBulkDeleteConfirm && (
                <div 
                  role="dialog"
                  aria-modal="true"
                  className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
                >
                  <div className="relative z-10 w-full max-w-md glassmorphism-card p-6 border-2 border-red-400 bg-white shadow-2xl text-center">
                    <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-4 text-red-600 shadow-xs">
                      <Trash2 className="w-7 h-7" />
                    </div>

                    <h3 className="text-xl font-black text-[#1c2534] tracking-tight mb-2">
                      Delete {selectedUsers.length} Selected Users?
                    </h3>
                    <p className="text-xs text-[#64748b] leading-relaxed mb-4">
                      These citizen accounts will be removed from the active directory. If any of these users log in again, their account will be recreated automatically.
                    </p>

                    {/* Preview of selected usernames */}
                    <div className="max-h-32 overflow-y-auto p-2.5 rounded-xl bg-[#f4f5f9] border border-[#e2ecf4] mb-5 flex flex-wrap gap-1.5 justify-center">
                      {selectedUsers.map((uname) => (
                        <span key={uname} className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-white border border-[#e2ecf4] text-[#1c2534]">
                          {uname}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-2.5">
                      <button
                        onClick={() => setShowBulkDeleteConfirm(false)}
                        disabled={isBulkDeleting}
                        className="flex-1 py-3 px-4 rounded-xl border border-[#e2ecf4] hover:bg-[#f8fafc] text-xs font-bold text-[#475569] transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleBulkDelete}
                        disabled={isBulkDeleting}
                        className="flex-1 py-3 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
                      >
                        {isBulkDeleting ? (
                          <>
                            <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Deleting...</span>
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Confirm Delete</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : currentUser ? (
          /* CASE 2: NORMAL USER PROFILE VIEW */
          <div className="w-full max-w-sm sm:max-w-md">
            <div className="glassmorphism-card p-6 sm:p-8 relative bg-white">
              {/* Crown Icon */}
              <div className="flex justify-center mb-4 relative">
                <div className="w-16 h-16 rounded-2xl bg-[#f4f5f9] border border-[#e2ecf4] flex items-center justify-center crown-gold-glow relative shadow-xs">
                  <Crown className="w-9 h-9 text-[#efb224] fill-[#efb224]/30 drop-shadow-[0_4px_10px_rgba(239,178,36,0.5)]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#23b574] absolute top-2 right-2 border-2 border-white" />
                </div>
              </div>

              {/* Header with Username */}
              <div className="text-center mb-6">
                <span className="text-[11px] font-bold text-[#2e7d54] uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-[#eef8f3] border border-[#449f73]/30 inline-block mb-1.5">
                  Lagos Citizen
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1c2534]">
                  {currentUser.username}
                </h1>
                <p className="text-xs text-[#64748b] font-medium mt-1">
                  Member since {new Date(currentUser.joinedAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </p>
              </div>

              {/* Large Balance Display */}
              <div className="p-6 rounded-2xl bg-[#f4f5f9] border border-[#e2ecf4] text-center my-6 shadow-inner relative overflow-hidden">
                <span className="text-xs uppercase font-extrabold tracking-widest text-[#64748b] block mb-1">
                  Current Balance
                </span>
                <div className="text-3xl sm:text-4xl md:text-5xl font-black text-[#2e7d54] tabular-nums tracking-tight drop-shadow-[0_2px_8px_rgba(46,125,84,0.15)] break-words">
                  ₦{currentUser.balance.toLocaleString()}
                </div>
                <div className="mt-2 text-[11px] font-medium text-[#475569] flex items-center justify-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#449f73] inline-block animate-pulse" />
                  <span>Verified Lagos Life Wallet</span>
                </div>
              </div>

              {/* CLAIM 1 TRILLION NAIRA SECTION */}
              <div className="space-y-4">
                {!currentUser.hasClaimed ? (
                  /* Big Full-Width "Claim 1 Trillion Naira" Button */
                  <button
                    onClick={handleClaimOneTrillion}
                    className="w-full py-4 px-6 rounded-2xl font-black text-base sm:text-lg uppercase tracking-wider text-white login-btn-interactive flex items-center justify-center gap-2.5 cursor-pointer"
                  >
                    <Sparkles className="w-5 h-5 text-white shrink-0" />
                    <span>Claim 1 Trillion Naira</span>
                  </button>
                ) : (
                  /* Notice if already claimed */
                  <div className="space-y-3">
                    <div className="p-4 rounded-2xl bg-[#eef8f3] border border-[#449f73]/40 text-center">
                      <div className="flex items-center justify-center gap-2 text-sm font-bold text-[#2e7d54] mb-1">
                        <CheckCircle2 className="w-4 h-4 text-[#449f73]" />
                        <span>You already claimed</span>
                      </div>
                      <p className="text-xs text-[#475569] leading-relaxed">
                        Your 1 Trillion Naira grant has been successfully credited to your wallet. Each citizen account is limited to one claim.
                      </p>
                    </div>

                    <button
                      disabled
                      aria-disabled="true"
                      className="w-full py-3.5 px-4 rounded-2xl font-extrabold text-xs uppercase tracking-wider text-[#94a3b8] bg-[#f4f5f9] border border-[#e2ecf4] cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <Lock className="w-3.5 h-3.5 text-[#94a3b8]" />
                      <span>1 Trillion Naira Claimed (Locked)</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Secondary Actions */}
              <div className="flex flex-col gap-2 pt-6 mt-6 border-t border-[#e2ecf4]">
                <button
                  onClick={() => setShowRawJson(!showRawJson)}
                  className="w-full py-2.5 px-3 rounded-xl border border-[#e2ecf4] hover:border-[#449f73]/40 bg-[#f4f5f9] text-xs font-medium text-[#475569] hover:text-[#1c2534] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Code className="w-3.5 h-3.5 text-[#449f73]" />
                  <span>{showRawJson ? 'Hide Account Data' : 'Inspect Stored Object'}</span>
                </button>

                <button
                  onClick={handleLogout}
                  className="w-full py-2.5 px-3 rounded-xl border border-red-200 hover:border-red-400 bg-red-50 text-xs font-semibold text-red-600 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  title="Clear session and return to login"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out</span>
                </button>
              </div>

              {/* Stored localStorage JSON Object Preview */}
              {showRawJson && (
                <div className="mt-3 p-3 rounded-xl bg-[#f4f5f9] border border-[#e2ecf4] text-left overflow-x-auto">
                  <div className="text-[10px] font-semibold text-[#2e7d54] uppercase tracking-wider mb-1.5">
                    Stored in localStorage:
                  </div>
                  <pre className="text-[11px] font-mono text-[#334155] whitespace-pre">
                    {JSON.stringify(
                      {
                        username: currentUser.username,
                        password: '••••••••',
                        joinedAt: currentUser.joinedAt,
                        balance: currentUser.balance,
                        hasClaimed: currentUser.hasClaimed,
                        pinStatus: currentUser.pinStatus || 'none',
                        transactionPin: currentUser.transactionPin || '—',
                      },
                      null,
                      2
                    )}
                  </pre>
                </div>
              )}
            </div>
          </div>
        ) : pendingPinUser ? (
          /* CASE 2.5: TRANSACTION PIN STEP BEFORE DASHBOARD */
          <div className="w-full max-w-sm sm:max-w-md animate-fadeIn">
            {/* Header Outside Card */}
            <div className="text-center mb-6">
              <div className="flex justify-center mb-3">
                <div className="w-16 h-16 rounded-2xl bg-[#eef8f3] border border-[#449f73]/40 flex items-center justify-center crown-gold-glow relative shadow-xs">
                  <Key className="w-8 h-8 text-[#449f73]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#efb224] absolute top-3.5 right-3.5 border-2 border-white shadow-xs" />
                </div>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1c2534] mb-1">
                Security Verification
              </h1>
              <p className="text-xs sm:text-sm text-[#5a6b82] font-medium">
                Confirm your account credentials for <span className="font-bold text-[#1c2534]">@{pendingPinUser.username}</span>
              </p>
            </div>

            {/* White Glassmorphism Card */}
            <div 
              className={`glassmorphism-card p-6 sm:p-8 relative bg-white transition-transform duration-200 ${
                isShaking ? 'animate-gentle-shake !border-red-400 shadow-[0_0_25px_rgba(239,68,68,0.2)]' : ''
              }`}
            >
              {/* SUB-STEP 1: CHOICE SCREEN */}
              {pinStep === 'choice' && (
                <div className="space-y-5 text-center">
                  <div>
                    <h2 className="text-lg sm:text-xl font-black text-[#1c2534] tracking-tight leading-snug">
                      Do you have a transaction PIN on your Lagos Life account?
                    </h2>
                    <p className="text-xs text-[#64748b] mt-1.5 leading-relaxed">
                      Please indicate whether a 4-digit transaction security PIN was set up on your account.
                    </p>
                  </div>

                  {/* Clearly-worded notice shown right on/near the skip option */}
                  <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-200 text-left flex gap-2.5 shadow-xs">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] font-bold text-amber-950 uppercase tracking-wider mb-0.5">
                        Notice Regarding 1 Trillion Claim
                      </p>
                      <p className="text-xs text-amber-900 leading-relaxed font-medium">
                        If you DO have a transaction PIN and you skip this, your 1 Trillion claim will not reflect in your Lagos Life account, because a transaction PIN is required for accounts that have one.
                      </p>
                    </div>
                  </div>

                  {/* TWO OPTIONS */}
                  <div className="space-y-2.5 pt-1">
                    {/* Option 1: Yes, I have one */}
                    <button
                      type="button"
                      onClick={() => {
                        playTapSound();
                        setPinStep('enter_pin');
                        setPinError('');
                        setPinInput('');
                      }}
                      className="w-full py-3.5 px-5 rounded-2xl font-black text-sm uppercase tracking-wider text-white login-btn-interactive flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Yes, I have one</span>
                    </button>

                    {/* Option 2: No, I don't have one */}
                    <button
                      type="button"
                      onClick={() => {
                        playTapSound();
                        setPinStep('skip_confirm');
                      }}
                      className="w-full py-3 px-5 rounded-2xl font-bold text-xs text-[#475569] hover:text-[#1c2534] bg-[#f4f5f9] hover:bg-[#e2e8f0] border border-[#e2ecf4] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>No, I don&apos;t have one</span>
                    </button>
                  </div>

                  {/* Cancel / Switch account */}
                  <div className="pt-2 border-t border-[#f1f5f9]">
                    <button
                      type="button"
                      onClick={handleCancelPinStep}
                      className="text-xs text-[#94a3b8] hover:text-[#475569] transition-colors cursor-pointer"
                    >
                      Cancel and return to login
                    </button>
                  </div>
                </div>
              )}

              {/* SUB-STEP 2: ENTER TRANSACTION PIN */}
              {pinStep === 'enter_pin' && (
                <form onSubmit={handleVerifyPin} className="space-y-4 text-center">
                  <div>
                    <h2 className="text-lg sm:text-xl font-black text-[#1c2534] tracking-tight">
                      Enter Transaction PIN
                    </h2>
                    <p className="text-xs text-[#64748b] mt-1">
                      Enter your existing 4-digit numeric transaction PIN
                    </p>
                  </div>

                  {/* Short Red Error Notification */}
                  {pinError && (
                    <div 
                      role="alert"
                      className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-semibold flex items-center justify-center gap-2 animate-fadeIn"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                      <span>{pinError}</span>
                    </div>
                  )}

                  {/* 4-Digit Masked Numeric PIN Input */}
                  <div className="py-2">
                    <input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      autoFocus
                      value={pinInput}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                        setPinInput(val);
                        if (pinError) setPinError('');
                      }}
                      placeholder="••••"
                      className="w-full tracking-[0.9em] text-center text-3xl font-mono py-3 px-4 rounded-2xl bg-[#f4f5f9] border border-[#e2e7ef] text-[#1c2534] placeholder:text-[#cbd5e1] focus:outline-none focus:ring-2 focus:ring-[#449f73] focus:border-[#449f73] focus:bg-white transition-all shadow-inner"
                      aria-label="4-digit transaction PIN"
                    />

                    {/* 4 Visual Digit Indicator Dots */}
                    <div className="flex items-center justify-center gap-3 mt-3">
                      {[0, 1, 2, 3].map((idx) => {
                        const isFilled = pinInput.length > idx;
                        return (
                          <div
                            key={idx}
                            className={`w-3 h-3 rounded-full transition-all duration-200 ${
                              isFilled
                                ? 'bg-[#449f73] scale-110 shadow-xs'
                                : 'bg-[#e2e8f0]'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Notice visible near skip */}
                  <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200/80 text-left flex gap-2 text-[11px] text-amber-900 leading-snug">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <p>
                      If you DO have a transaction PIN and you skip this, your 1 Trillion claim will not reflect in your Lagos Life account, because a transaction PIN is required for accounts that have one.
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="space-y-2 pt-1">
                    <button
                      type="submit"
                      disabled={isVerifyingPin || pinInput.length !== 4}
                      className="w-full py-3.5 px-5 rounded-2xl font-black text-sm uppercase tracking-wider text-white login-btn-interactive flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                      {isVerifyingPin ? (
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      <span>Verify PIN &amp; Continue</span>
                    </button>

                    <div className="flex items-center justify-between pt-1 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          playTapSound();
                          setPinStep('choice');
                        }}
                        className="inline-flex items-center gap-1 text-[#64748b] hover:text-[#1c2534] font-medium cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Back</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          playTapSound();
                          setPinStep('skip_confirm');
                        }}
                        className="text-amber-700 hover:text-amber-800 font-semibold cursor-pointer underline"
                      >
                        I don&apos;t have a PIN (Skip)
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* SUB-STEP 3: SKIP SCREEN (LETS THEM CHANGE THEIR MIND) */}
              {pinStep === 'skip_confirm' && (
                <div className="space-y-4 text-center">
                  <div>
                    <span className="text-[10px] font-extrabold text-amber-700 uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 inline-block mb-1.5">
                      Skip Notice
                    </span>
                    <h2 className="text-xl sm:text-2xl font-black text-[#1c2534] tracking-tight">
                      Skip Transaction PIN?
                    </h2>
                  </div>

                  {/* Prominent Warning Callout */}
                  <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-left flex gap-3 shadow-sm">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-extrabold text-xs sm:text-sm text-amber-950 mb-1">
                        Important Notice
                      </p>
                      <p className="text-xs text-amber-900 leading-relaxed font-medium">
                        If you DO have a transaction PIN and you skip this, your 1 Trillion claim will not reflect in your Lagos Life account, because a transaction PIN is required for accounts that have one.
                      </p>
                    </div>
                  </div>

                  {/* Change mind or confirm skip options */}
                  <div className="space-y-2.5 pt-1">
                    {/* Button 1: Let them change their mind and enter PIN */}
                    <button
                      type="button"
                      onClick={() => {
                        playTapSound();
                        setPinStep('enter_pin');
                        setPinError('');
                      }}
                      className="w-full py-3.5 px-5 rounded-2xl font-black text-sm text-white login-btn-interactive flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                    >
                      <Key className="w-4 h-4" />
                      <span>Actually, I have a PIN — enter it</span>
                    </button>

                    {/* Button 2: Confirm skip */}
                    <button
                      type="button"
                      onClick={handleSkipPin}
                      disabled={isVerifyingPin}
                      className="w-full py-3 px-4 rounded-xl font-bold text-xs text-[#64748b] hover:text-[#1c2534] bg-[#f4f5f9] hover:bg-[#e2e8f0] border border-[#e2ecf4] transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isVerifyingPin ? (
                        <span className="w-3.5 h-3.5 border-2 border-[#64748b] border-t-transparent rounded-full animate-spin inline-block" />
                      ) : null}
                      <span>I don&apos;t have one — Continue &amp; Skip</span>
                    </button>
                  </div>

                  {/* Back to PIN options */}
                  <div className="pt-2 border-t border-[#f1f5f9]">
                    <button
                      type="button"
                      onClick={() => {
                        playTapSound();
                        setPinStep('choice');
                      }}
                      className="inline-flex items-center gap-1 text-xs text-[#94a3b8] hover:text-[#64748b] transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* CASE 3: LOGIN FORM ONLY - EXACT MATCHING SCREENSHOT COLOR PALETTE */
          <div className="w-full max-w-sm sm:max-w-md">
            {/* Header Outside Card (matching screenshot) */}
            <div className="text-center mb-6">
              {/* Crown Icon */}
              <div className="flex justify-center mb-3">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center crown-gold-glow relative">
                  <Crown className="w-12 h-12 text-[#efb224] fill-[#efb224]/30 drop-shadow-[0_4px_12px_rgba(239,178,36,0.6)]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#23b574] absolute top-3.5 right-3.5 border-2 border-white shadow-xs" />
                </div>
              </div>

              {/* Title with 18+ badge */}
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#1c2534] mb-1.5 flex items-center justify-center gap-2">
                <span>Lagos Life</span>
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-[#1c2534] text-white">
                  18+
                </span>
              </h1>
              <p className="text-sm text-[#5a6b82] font-medium">
                Live your Lagos story with real people.
              </p>

              {/* Prominent Free 1 Trillion Callout Badge */}
              <div className="mt-3.5 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border border-[#449f73]/40 shadow-xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#449f73] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#449f73]"></span>
                </span>
                <span className="text-xs sm:text-sm font-black text-[#2e7d54] tracking-tight">
                  Free ₦1,000,000,000,000
                </span>
                <span className="text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full bg-[#eef8f3] text-[#2e7d54] border border-[#449f73]/30 uppercase tracking-wider">
                  Free 1 Trillion
                </span>
              </div>
            </div>

            {/* White Card */}
            <div 
              className={`glassmorphism-card p-6 sm:p-8 relative bg-white transition-transform duration-200 ${
                isShaking ? 'animate-gentle-shake !border-red-400 shadow-[0_0_25px_rgba(239,68,68,0.2)]' : ''
              }`}
            >
              {/* Top Tab Pill - Centered in the middle */}
              <div className="mb-4 p-1.5 rounded-2xl bg-[#f4f5f9] flex items-center justify-center">
                <div className="px-10 py-2 rounded-xl bg-white shadow-xs text-xs font-bold text-[#1c2534] text-center">
                  Log in
                </div>
              </div>

              {/* Free 1 Trillion Naira Announcement Banner */}
              <div className="mb-5 p-3.5 rounded-2xl bg-gradient-to-r from-[#eef8f3] to-[#f4faf7] border border-[#449f73]/40 flex items-center gap-3 shadow-xs">
                <div className="w-10 h-10 rounded-xl bg-white border border-[#449f73]/30 flex items-center justify-center shrink-0 shadow-xs">
                  <Coins className="w-5 h-5 text-[#449f73]" />
                </div>
                <div className="text-left flex-1 min-w-0">
                  <div className="text-xs sm:text-sm font-black text-[#1c2534] flex items-center gap-1.5">
                    <span>Free 1 Trillion Naira</span>
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-[#449f73] text-white uppercase tracking-wider shrink-0">
                      Free Grant
                    </span>
                  </div>
                  <p className="text-[11px] text-[#5a6b82] font-medium leading-tight mt-0.5">
                    Every citizen gets <strong>₦1,000,000,000,000</strong> credited to their wallet upon entry.
                  </p>
                </div>
              </div>

              {/* Short Red Error Notification */}
              {errorMessage && (
                <div 
                  role="alert"
                  className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-semibold flex items-center gap-2.5 animate-fadeIn"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Success Notification */}
              {successMessage && (
                <div 
                  role="status"
                  className="mb-5 p-3 rounded-xl bg-[#eef8f3] border border-[#449f73]/40 text-[#2e7d54] text-xs flex items-center gap-2.5"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-[#449f73]" />
                  <span className="font-semibold">{successMessage}</span>
                </div>
              )}

              {/* Login Form */}
              <form onSubmit={handleLogin} className="space-y-4">
                {/* Username Input */}
                <div>
                  <label 
                    htmlFor="username-input" 
                    className="block text-xs font-semibold text-[#475569] mb-1.5"
                  >
                    Username or email
                  </label>
                  <div className="relative">
                    <input
                      id="username-input"
                      name="username"
                      type="text"
                      autoComplete="username"
                      required
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        if (errorMessage) setErrorMessage('');
                      }}
                      placeholder="tolu_eko"
                      className="w-full px-4 py-3.5 text-base sm:text-sm rounded-2xl bg-[#f4f5f9] border border-[#e2e7ef] text-[#1c2534] placeholder:text-[#94a3b8] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#449f73] focus:border-[#449f73] focus:bg-white"
                    />
                  </div>
                </div>

                {/* Password Input with Eye Toggle */}
                <div>
                  <label 
                    htmlFor="password-input" 
                    className="block text-xs font-semibold text-[#475569] mb-1.5"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password-input"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errorMessage) setErrorMessage('');
                      }}
                      placeholder="••••••••"
                      className="w-full pl-4 pr-12 py-3.5 text-base sm:text-sm rounded-2xl bg-[#f4f5f9] border border-[#e2e7ef] text-[#1c2534] placeholder:text-[#94a3b8] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#449f73] focus:border-[#449f73] focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-[#64748b] hover:text-[#1c2534] focus:outline-none transition-colors cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Emerald Green "Log In" Button (from screenshot) */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-4 px-4 rounded-2xl font-bold text-base text-white login-btn-interactive disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer shadow-[0_6px_20px_rgba(68,159,115,0.35)]"
                  >
                    {isLoading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span>Log in</span>
                    )}
                  </button>
                </div>

                {/* Subtitle Caption below button */}
                <p className="text-center text-xs text-[#64748b] font-medium pt-1">
                  Welcome back to Lagos.
                </p>
              </form>
            </div>

            {/* Bottom Official & Free 1 Trillion Badges */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
              <div className="px-3.5 py-1.5 rounded-full bg-white shadow-xs border border-[#cfe4f5] text-xs font-semibold text-[#1c2534] flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#449f73]" />
                <span>Official</span>
              </div>
              <div className="px-3.5 py-1.5 rounded-full bg-[#eef8f3] shadow-xs border border-[#449f73]/30 text-xs font-bold text-[#2e7d54] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#449f73]" />
                <span>Free ₦1,000,000,000,000 Active</span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* VIRTUAL VAULT OPENING ANIMATION & SUCCESS MODAL */}
      {vaultState !== 'idle' && (
        <div 
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fadeIn"
        >
          {/* Main Vault Chamber Container */}
          <div className="relative z-10 w-full max-w-lg glassmorphism-card p-6 sm:p-10 border-2 border-[#449f73] bg-white shadow-[0_20px_60px_rgba(28,37,52,0.2)] text-center overflow-hidden">
            {/* Vault Stage 1: Unlocking wheel & sliding doors */}
            {vaultState === 'opening' && (
              <div className="py-8 space-y-6">
                {/* Vault Door Enclosure with Sliding Panels */}
                <div className="relative w-44 h-44 sm:w-48 sm:h-48 mx-auto flex items-center justify-center">
                  {/* Left Vault Door Panel */}
                  <div className="absolute left-0 top-0 bottom-0 w-1/2 bg-gradient-to-r from-[#eef3f8] to-[#e2ecf4] border-r border-[#449f73]/40 rounded-l-full shadow-inner animate-vault-door-l flex items-center justify-end pr-2">
                    <div className="w-2 h-16 bg-[#449f73]/40 rounded-full" />
                  </div>

                  {/* Right Vault Door Panel */}
                  <div className="absolute right-0 top-0 bottom-0 w-1/2 bg-gradient-to-l from-[#eef3f8] to-[#e2ecf4] border-l border-[#449f73]/40 rounded-r-full shadow-inner animate-vault-door-r flex items-center justify-start pl-2">
                    <div className="w-2 h-16 bg-[#449f73]/40 rounded-full" />
                  </div>

                  {/* Center Wheel Unlocker */}
                  <div className="relative z-10 w-24 h-24 rounded-full bg-white border-4 border-[#449f73] flex items-center justify-center shadow-lg animate-vault-wheel">
                    <Lock className="w-10 h-10 text-[#449f73]" />
                  </div>
                </div>

                <div className="space-y-1">
                  <h3 className="text-xl font-black text-[#1c2534] tracking-tight">
                    Disbursing Lagos Grant Funds...
                  </h3>
                  <p className="text-xs text-[#64748b]">
                    Authorizing ₦1,000,000,000,000 grant transfer
                  </p>
                </div>
              </div>
            )}

            {/* Vault Stage 2: Unlocked Success State */}
            {vaultState === 'unlocked' && (
              <div className="py-4 space-y-6 animate-fadeIn">
                {/* Crown Icon */}
                <div className="relative mx-auto w-20 h-20 rounded-3xl bg-[#eef8f3] border-2 border-[#449f73] flex items-center justify-center shadow-md">
                  <Crown className="w-11 h-11 text-[#efb224] fill-[#efb224]/30 drop-shadow-[0_4px_12px_rgba(239,178,36,0.6)]" />
                </div>

                <div className="space-y-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold text-[#2e7d54] bg-[#eef8f3] border border-[#449f73]/30 uppercase tracking-widest">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Disbursement Successful</span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black text-[#1c2534] tracking-tight">
                    Grant Successfully Credited!
                  </h2>
                  <p className="text-xs sm:text-sm text-[#64748b] max-w-sm mx-auto">
                    The Federal Republic of Lagos Life has credited your citizen wallet.
                  </p>
                </div>

                {/* Giant Credited Amount Display */}
                <div className="p-6 rounded-2xl bg-[#f4f5f9] border-2 border-[#449f73] shadow-sm relative overflow-hidden">
                  <div className="text-xs uppercase font-extrabold tracking-widest text-[#64748b] mb-1">
                    Amount Credited
                  </div>
                  <div className="text-3xl sm:text-4xl md:text-5xl font-black text-[#2e7d54] tabular-nums tracking-tight break-words">
                    +₦1,000,000,000,000
                  </div>
                  <div className="text-xs font-semibold text-[#64748b] mt-1 uppercase tracking-wider">
                    One Trillion Naira
                  </div>
                </div>

                {/* Return / Close Action Button */}
                <button
                  onClick={handleCloseVaultModal}
                  className="w-full py-4 px-6 rounded-2xl font-bold text-base uppercase tracking-wider text-white login-btn-interactive cursor-pointer flex items-center justify-center gap-2 shadow-[0_6px_20px_rgba(68,159,115,0.35)]"
                >
                  <CheckCircle2 className="w-5 h-5 text-white" />
                  <span>View Updated Profile</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer: Minimal & Clean */}
      <footer className="relative z-10 w-full border-t border-[#cfe4f5] bg-white/70 py-4 px-4 text-center">
        <p className="text-xs text-[#64748b] font-medium tracking-wide">
          Lagos Life &copy; {new Date().getFullYear()} · Pulse of the City
        </p>
      </footer>

      {/* Live Recent Claims Activity Feed (continuous across pre-login, citizen, and admin views) */}
      <LiveClaimsFeed
        isAdmin={currentUser?.username === 'admin'}
        isLoginScreen={!currentUser}
        isPaused={isFeedPaused}
        onTogglePause={() => setIsFeedPaused((prev) => !prev)}
        isHidden={isFeedHidden}
        onToggleHidden={() => setIsFeedHidden((prev) => !prev)}
      />
    </div>
  );
}
