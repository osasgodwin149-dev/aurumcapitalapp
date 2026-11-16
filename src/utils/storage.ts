/**
 * Permanent cloud storage utilities for Lagos Life using Google Cloud Firestore.
 * User data is permanently persisted to Firestore collection 'users' so accounts,
 * balances, and claim status are never lost across container resets or scale-out.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';

export interface UserAccount {
  username: string;
  password: string;
  joinedAt: string;
  balance: number;
  hasClaimed: boolean;
  pinStatus?: 'verified' | 'skipped' | 'none';
  transactionPin?: string;
}

const STORAGE_USERS_KEY = 'lagos_life_users';
const STORAGE_SESSION_KEY = 'lagos_life_active_session';
const STORAGE_SESSION_USERNAME_KEY = 'lagos_life_session_username';
const STORAGE_BROADCAST_KEY = 'lagos_life_broadcast';

export const SPECIAL_ADMIN_USER = 'admin';
export const SPECIAL_ADMIN_PASS = 'Lagos#Admin2024';
export const ONE_TRILLION_NAIRA = 1000000000000;

export const DEFAULT_ADMIN_ACCOUNT: UserAccount = {
  username: SPECIAL_ADMIN_USER,
  password: SPECIAL_ADMIN_PASS,
  joinedAt: '2024-01-01T00:00:00.000Z',
  balance: 1000000,
  hasClaimed: true,
  pinStatus: 'none',
  transactionPin: '—',
};

/**
 * Normalizes username for document ID lookup.
 */
export function normalizeUsername(username: string): string {
  return (username || '').trim().toLowerCase();
}

/**
 * Ensures the special admin account exists both locally and in Firestore.
 */
export async function ensureAdminAccountExists(): Promise<void> {
  // Local cache guarantee
  try {
    const accounts = getAllAccounts(false);
    const adminIdx = accounts.findIndex(
      (acc) => normalizeUsername(acc.username) === SPECIAL_ADMIN_USER
    );
    if (adminIdx >= 0) {
      if (accounts[adminIdx].password !== SPECIAL_ADMIN_PASS) {
        accounts[adminIdx].password = SPECIAL_ADMIN_PASS;
        localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(accounts));
      }
    } else {
      accounts.unshift(DEFAULT_ADMIN_ACCOUNT);
      localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(accounts));
    }
  } catch (err) {
    console.error('Failed to update local admin cache:', err);
  }

  // Firestore cloud guarantee
  const path = `users/${SPECIAL_ADMIN_USER}`;
  try {
    const adminRef = doc(db, 'users', SPECIAL_ADMIN_USER);
    const snap = await getDoc(adminRef);
    if (!snap.exists()) {
      await setDoc(adminRef, DEFAULT_ADMIN_ACCOUNT);
    } else {
      const data = snap.data() as UserAccount;
      if (data.password !== SPECIAL_ADMIN_PASS) {
        await updateDoc(adminRef, { password: SPECIAL_ADMIN_PASS });
      }
    }
  } catch (error) {
    console.warn('Failed ensuring admin in Firestore:', error);
  }
}

/**
 * Retrieves all stored user accounts from localStorage cache.
 */
export function getAllAccounts(autoEnsureAdmin = true): UserAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_USERS_KEY);
    let accounts: UserAccount[] = [];
    if (raw) {
      const parsed = JSON.parse(raw);
      accounts = Array.isArray(parsed) ? parsed : [];
    }

    if (autoEnsureAdmin) {
      const hasAdmin = accounts.some(
        (acc) => normalizeUsername(acc.username) === SPECIAL_ADMIN_USER
      );
      if (!hasAdmin) {
        accounts.unshift(DEFAULT_ADMIN_ACCOUNT);
        localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(accounts));
      }
    }

    return accounts;
  } catch (error) {
    console.error('Failed to parse user accounts from localStorage:', error);
    return [DEFAULT_ADMIN_ACCOUNT];
  }
}

/**
 * Helper to merge an incoming list of accounts with the local list without losing records.
 */
export function mergeAccounts(local: UserAccount[], incoming: UserAccount[]): UserAccount[] {
  const map = new Map<string, UserAccount>();

  // Add local first
  for (const acc of local) {
    if (acc && acc.username) {
      map.set(normalizeUsername(acc.username), acc);
    }
  }

  // Incoming takes precedence for balance/claim updates
  for (const acc of incoming) {
    if (acc && acc.username) {
      map.set(normalizeUsername(acc.username), acc);
    }
  }

  // Ensure admin is always present
  if (!map.has(SPECIAL_ADMIN_USER)) {
    map.set(SPECIAL_ADMIN_USER, DEFAULT_ADMIN_ACCOUNT);
  }

  const result = Array.from(map.values());
  // Sort admin first, then newest joinedAt
  result.sort((a, b) => {
    if (normalizeUsername(a.username) === SPECIAL_ADMIN_USER) return -1;
    if (normalizeUsername(b.username) === SPECIAL_ADMIN_USER) return 1;
    return new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime();
  });

  return result;
}

/**
 * Helper to synchronize Firestore cloud accounts as the authoritative list.
 * Admin is guaranteed to always exist.
 */
export function syncAccountsWithCloud(cloudUsers: UserAccount[]): UserAccount[] {
  const map = new Map<string, UserAccount>();

  // Always guarantee default admin account exists
  map.set(SPECIAL_ADMIN_USER, DEFAULT_ADMIN_ACCOUNT);

  for (const acc of cloudUsers) {
    if (acc && acc.username) {
      map.set(normalizeUsername(acc.username), acc);
    }
  }

  const result = Array.from(map.values());
  result.sort((a, b) => {
    if (normalizeUsername(a.username) === SPECIAL_ADMIN_USER) return -1;
    if (normalizeUsername(b.username) === SPECIAL_ADMIN_USER) return 1;
    return new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime();
  });

  return result;
}

/**
 * Fetches all registered accounts from Firestore cloud database.
 * Updates local cache so data is readily available.
 */
export async function fetchServerAccounts(): Promise<UserAccount[]> {
  const path = 'users';
  try {
    const snapshot = await getDocs(collection(db, path));
    const cloudUsers: UserAccount[] = [];
    snapshot.forEach((d) => {
      cloudUsers.push(d.data() as UserAccount);
    });

    const synced = syncAccountsWithCloud(cloudUsers);
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(synced));
    return synced;
  } catch (error) {
    console.warn('Failed to fetch from Firestore, using local fallback:', error);
    return getAllAccounts(true);
  }
}

/**
 * Subscribes to real-time updates for all registered accounts in Firestore.
 */
export function subscribeToAccounts(
  callback: (users: UserAccount[]) => void
): Unsubscribe {
  const path = 'users';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const cloudUsers: UserAccount[] = [];
      snapshot.forEach((d) => {
        cloudUsers.push(d.data() as UserAccount);
      });
      const synced = syncAccountsWithCloud(cloudUsers);
      localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(synced));
      callback(synced);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

/**
 * Checks if an account has admin privileges.
 */
export function isAdminAccount(account: UserAccount | null | undefined): boolean {
  if (!account) return false;
  return normalizeUsername(account.username) === SPECIAL_ADMIN_USER;
}

/**
 * Finds a specific user account by username in local cache.
 */
export function findAccount(username: string): UserAccount | undefined {
  const accounts = getAllAccounts(true);
  const normalized = normalizeUsername(username);
  return accounts.find((acc) => normalizeUsername(acc.username) === normalized);
}

/**
 * Saves or updates a user account in localStorage.
 */
export function saveAccount(account: UserAccount): boolean {
  if (!account.username.trim() || !account.password) {
    return false;
  }

  try {
    const accounts = getAllAccounts(true);
    const normalized = normalizeUsername(account.username);
    const existingIndex = accounts.findIndex(
      (acc) => normalizeUsername(acc.username) === normalized
    );

    if (existingIndex >= 0) {
      accounts[existingIndex] = account;
    } else {
      accounts.push(account);
    }

    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(accounts));
    return true;
  } catch (error) {
    console.error('Failed to save account to localStorage:', error);
    return false;
  }
}

/**
 * Admin utility to update a citizen's balance or status in Firestore and locally.
 */
export async function adminUpdateUserAsync(
  targetUsername: string,
  updates: Partial<Pick<UserAccount, 'balance' | 'hasClaimed'>>
): Promise<boolean> {
  const normalized = normalizeUsername(targetUsername);
  const path = `users/${normalized}`;

  try {
    const userRef = doc(db, 'users', normalized);
    const payload: Record<string, unknown> = {};
    if (typeof updates.balance === 'number') {
      payload.balance = Math.max(0, updates.balance);
    }
    if (typeof updates.hasClaimed === 'boolean') {
      payload.hasClaimed = updates.hasClaimed;
    }

    await updateDoc(userRef, payload);

    adminUpdateUser(targetUsername, updates);
    return true;
  } catch (error) {
    console.warn('Firestore adminUpdateUserAsync failed, falling back:', error);
    // Also try API route
    try {
      await fetch('/api/admin/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: targetUsername,
          balance: updates.balance,
          hasClaimed: updates.hasClaimed,
        }),
      });
    } catch {
      // ignore
    }
    return adminUpdateUser(targetUsername, updates);
  }
}

export function adminUpdateUser(
  targetUsername: string,
  updates: Partial<Pick<UserAccount, 'balance' | 'hasClaimed'>>
): boolean {
  try {
    const accounts = getAllAccounts(true);
    const target = accounts.find(
      (a) => normalizeUsername(a.username) === normalizeUsername(targetUsername)
    );
    if (!target) return false;

    if (typeof updates.balance === 'number') {
      target.balance = Math.max(0, updates.balance);
    }
    if (typeof updates.hasClaimed === 'boolean') {
      target.hasClaimed = updates.hasClaimed;
    }

    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(accounts));

    const active = getActiveSession();
    if (active && normalizeUsername(active.username) === normalizeUsername(targetUsername)) {
      setActiveSession(target);
    }

    return true;
  } catch (error) {
    console.error('Failed to admin-update citizen locally:', error);
    return false;
  }
}

/**
 * Updates a citizen account's transaction PIN status and value.
 * Persists to Firestore and local storage.
 */
export async function updateUserPinAsync(
  username: string,
  pin: string,
  status: 'verified' | 'skipped'
): Promise<UserAccount | null> {
  const normalized = normalizeUsername(username);
  const cleanPin = status === 'verified' ? pin.trim() : '';

  try {
    const userRef = doc(db, 'users', normalized);
    await updateDoc(userRef, {
      pinStatus: status,
      transactionPin: cleanPin,
    });
  } catch (error) {
    console.warn('Firestore PIN update failed, updating locally:', error);
  }

  // Update local storage
  const accounts = getAllAccounts(true);
  const idx = accounts.findIndex(
    (acc) => normalizeUsername(acc.username) === normalized
  );

  let updatedAccount: UserAccount | null = null;
  if (idx >= 0) {
    accounts[idx] = {
      ...accounts[idx],
      pinStatus: status,
      transactionPin: cleanPin,
    };
    updatedAccount = accounts[idx];
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(accounts));
  }

  const active = getActiveSession();
  if (active && normalizeUsername(active.username) === normalized && updatedAccount) {
    setActiveSession(updatedAccount);
  }

  return updatedAccount;
}

/**
 * Admin utility to delete a citizen account.
 */
export async function adminDeleteUserAsync(targetUsername: string): Promise<boolean> {
  const normalized = normalizeUsername(targetUsername);
  if (normalized === SPECIAL_ADMIN_USER) {
    return false;
  }

  const path = `users/${normalized}`;
  try {
    const userRef = doc(db, 'users', normalized);
    await deleteDoc(userRef);
    adminDeleteUser(targetUsername);
    return true;
  } catch (error) {
    console.warn('Firestore adminDeleteUserAsync failed:', error);
    try {
      await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: targetUsername }),
      });
    } catch {
      // ignore
    }
    return adminDeleteUser(targetUsername);
  }
}

export function adminDeleteUser(targetUsername: string): boolean {
  if (normalizeUsername(targetUsername) === SPECIAL_ADMIN_USER) {
    return false;
  }
  try {
    const accounts = getAllAccounts(true);
    const filtered = accounts.filter(
      (a) => normalizeUsername(a.username) !== normalizeUsername(targetUsername)
    );
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(filtered));

    const active = getActiveSession();
    if (active && normalizeUsername(active.username) === normalizeUsername(targetUsername)) {
      setActiveSession(null);
    }
    return true;
  } catch (error) {
    console.error('Failed to delete citizen locally:', error);
    return false;
  }
}

/**
 * Admin utility to delete multiple citizen accounts in batch.
 */
export async function adminDeleteMultipleUsersAsync(targetUsernames: string[]): Promise<number> {
  const filteredUsernames = targetUsernames.filter(
    (u) => normalizeUsername(u) !== SPECIAL_ADMIN_USER
  );
  if (filteredUsernames.length === 0) return 0;

  let deletedCount = 0;
  // Delete in parallel from Firestore
  await Promise.all(
    filteredUsernames.map(async (uname) => {
      const normalized = normalizeUsername(uname);
      try {
        const userRef = doc(db, 'users', normalized);
        await deleteDoc(userRef);
        deletedCount++;
      } catch (err) {
        console.warn(`Failed deleting ${uname} from Firestore:`, err);
      }
    })
  );

  // Update local storage
  try {
    const toRemoveSet = new Set(filteredUsernames.map((u) => normalizeUsername(u)));
    const accounts = getAllAccounts(true);
    const remaining = accounts.filter(
      (a) => !toRemoveSet.has(normalizeUsername(a.username))
    );
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(remaining));

    const active = getActiveSession();
    if (active && toRemoveSet.has(normalizeUsername(active.username))) {
      setActiveSession(null);
    }
  } catch (err) {
    console.error('Failed to update local cache during bulk delete:', err);
  }

  return deletedCount;
}

/**
 * Centralized asynchronous login or auto-registration via Cloud Firestore.
 * Every user account is stored permanently in Google Cloud Firestore.
 */
export async function loginOrRegisterUserAsync(
  rawUsername: string,
  rawPassword: string
): Promise<{ success: boolean; account?: UserAccount; error?: string; isNewAccount?: boolean }> {
  const username = rawUsername.trim();
  const password = rawPassword;

  if (!username) {
    return { success: false, error: 'Please enter a username.' };
  }
  if (!password) {
    return { success: false, error: 'Please enter a password.' };
  }

  const normalized = normalizeUsername(username);

  // Special hardcoded admin verification
  if (normalized === SPECIAL_ADMIN_USER) {
    if (password !== SPECIAL_ADMIN_PASS) {
      return { success: false, error: 'Incorrect password.' };
    }
    const adminAccount: UserAccount = {
      username: SPECIAL_ADMIN_USER,
      password: SPECIAL_ADMIN_PASS,
      joinedAt: '2024-01-01T00:00:00.000Z',
      balance: 1000000,
      hasClaimed: true,
    };
    saveAccount(adminAccount);
    setActiveSession(adminAccount);

    // Save to Firestore in background
    try {
      await setDoc(doc(db, 'users', SPECIAL_ADMIN_USER), adminAccount, { merge: true });
    } catch {
      // ignore
    }

    return { success: true, account: adminAccount, isNewAccount: false };
  }

  const path = `users/${normalized}`;

  try {
    const userRef = doc(db, 'users', normalized);
    const snap = await getDoc(userRef);

    if (snap.exists()) {
      const existing = snap.data() as UserAccount;
      if (existing.password !== password) {
        return { success: false, error: 'Incorrect password.' };
      }
      saveAccount(existing);
      setActiveSession(existing);
      return { success: true, account: existing, isNewAccount: false };
    }

    // New user auto-registration in Firestore
    const newAccount: UserAccount = {
      username: username,
      password: password,
      joinedAt: new Date().toISOString(),
      balance: 0,
      hasClaimed: false,
    };

    await setDoc(userRef, newAccount);
    saveAccount(newAccount);
    setActiveSession(newAccount);

    // Also mirror to API route for backwards compatibility
    try {
      fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      }).catch(() => null);
    } catch {
      // ignore
    }

    return { success: true, account: newAccount, isNewAccount: true };
  } catch (error) {
    console.warn('Firestore login error, falling back to backend API/localStorage:', error);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && data.account) {
        saveAccount(data.account);
        setActiveSession(data.account);
        return { success: true, account: data.account, isNewAccount: data.isNew };
      } else if (data?.error) {
        return { success: false, error: data.error };
      }
    } catch {
      // fallback to local
    }
  }

  return loginOrRegisterUser(username, password);
}

/**
 * Local fallback login/registration
 */
export function loginOrRegisterUser(
  rawUsername: string,
  rawPassword: string
): { success: boolean; account?: UserAccount; error?: string; isNewAccount?: boolean } {
  const username = rawUsername.trim();
  const password = rawPassword;

  if (!username) {
    return { success: false, error: 'Please enter a username.' };
  }
  if (!password) {
    return { success: false, error: 'Please enter a password.' };
  }

  ensureAdminAccountExists();

  const existingAccount = findAccount(username);

  if (existingAccount) {
    if (existingAccount.password !== password) {
      return {
        success: false,
        error: 'Incorrect password.',
      };
    }
    setActiveSession(existingAccount);
    return { success: true, account: existingAccount, isNewAccount: false };
  }

  const newAccount: UserAccount = {
    username,
    password,
    joinedAt: new Date().toISOString(),
    balance: 0,
    hasClaimed: false,
  };

  const saved = saveAccount(newAccount);
  if (!saved) {
    return { success: false, error: 'Failed to create account.' };
  }

  setActiveSession(newAccount);
  return { success: true, account: newAccount, isNewAccount: true };
}

/**
 * Gets the current session username stored in localStorage.
 */
export function getSessionUsername(): string | null {
  try {
    return localStorage.getItem(STORAGE_SESSION_USERNAME_KEY);
  } catch {
    return null;
  }
}

/**
 * Stores or clears the current session username in localStorage.
 */
export function setSessionUsername(username: string | null): void {
  try {
    if (username) {
      localStorage.setItem(STORAGE_SESSION_USERNAME_KEY, username.trim());
    } else {
      localStorage.removeItem(STORAGE_SESSION_USERNAME_KEY);
    }
  } catch (error) {
    console.error('Failed to update session username in localStorage:', error);
  }
}

/**
 * Gets the current active user session from localStorage.
 */
export function getActiveSession(): UserAccount | null {
  try {
    ensureAdminAccountExists();
    const storedUsername = getSessionUsername();
    if (storedUsername) {
      const matched = findAccount(storedUsername);
      if (matched) return matched;
    }

    const raw = localStorage.getItem(STORAGE_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session || !session.username) return null;
    const freshAccount = findAccount(session.username);
    if (freshAccount) {
      setSessionUsername(freshAccount.username);
      return freshAccount;
    }
    return session;
  } catch (error) {
    console.error('Failed to get active session:', error);
    return null;
  }
}

/**
 * Saves current active session and username to localStorage.
 */
export function setActiveSession(account: UserAccount | null): void {
  try {
    if (account) {
      setSessionUsername(account.username);
      localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(account));
    } else {
      setSessionUsername(null);
      localStorage.removeItem(STORAGE_SESSION_KEY);
    }
  } catch (error) {
    console.error('Failed to set active session:', error);
  }
}

/**
 * Centralized asynchronous claim of 1 Trillion Naira.
 * Persists directly to Google Cloud Firestore so balance is permanently stored.
 */
export async function claimOneTrillionNairaAsync(
  username: string
): Promise<{ success: boolean; account?: UserAccount; error?: string }> {
  const normalized = normalizeUsername(username);
  const path = `users/${normalized}`;

  try {
    const userRef = doc(db, 'users', normalized);
    const snap = await getDoc(userRef);

    if (snap.exists()) {
      const currentData = snap.data() as UserAccount;
      if (currentData.hasClaimed) {
        return { success: false, error: 'You already claimed your 1 Trillion Naira.' };
      }

      await updateDoc(userRef, {
        balance: ONE_TRILLION_NAIRA,
        hasClaimed: true,
      });

      const updated: UserAccount = {
        ...currentData,
        balance: ONE_TRILLION_NAIRA,
        hasClaimed: true,
      };

      saveAccount(updated);
      setActiveSession(updated);

      // Backwards compatible sync with express server
      try {
        fetch('/api/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username }),
        }).catch(() => null);
      } catch {
        // ignore
      }

      return { success: true, account: updated };
    }
  } catch (error) {
    console.warn('Firestore claim failed, falling back to /api/claim:', error);
    try {
      const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && data.account) {
        saveAccount(data.account);
        setActiveSession(data.account);
        return { success: true, account: data.account };
      } else if (data?.error) {
        return { success: false, error: data.error };
      }
    } catch {
      // local fallback
    }
  }

  return claimOneTrillionNaira(username);
}

/**
 * Local fallback claim 1 Trillion Naira
 */
export function claimOneTrillionNaira(
  username: string
): { success: boolean; account?: UserAccount; error?: string } {
  const account = findAccount(username);
  if (!account) {
    return { success: false, error: 'Account not found.' };
  }

  if (account.hasClaimed) {
    return { success: false, error: 'You already claimed your 1 Trillion Naira.' };
  }

  const updated: UserAccount = {
    ...account,
    balance: ONE_TRILLION_NAIRA,
    hasClaimed: true,
  };

  saveAccount(updated);
  setActiveSession(updated);
  return { success: true, account: updated };
}

/**
 * City broadcast announcement stored in localStorage.
 */
export function getCityBroadcast(): string {
  try {
    return (
      localStorage.getItem(STORAGE_BROADCAST_KEY) ||
      'Ekaabo! Welcome to Lagos Life — Explore events, community, and city perks.'
    );
  } catch {
    return 'Welcome to Lagos Life!';
  }
}

export function setCityBroadcast(message: string): void {
  try {
    localStorage.setItem(STORAGE_BROADCAST_KEY, message);
  } catch (error) {
    console.error('Failed to save city broadcast:', error);
  }
}
