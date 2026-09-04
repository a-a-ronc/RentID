/**
 * Mock auth service — local only, NOT real authentication.
 *
 * Mirrors the slice of the Supabase auth API the app uses (session, signUp,
 * signInWithPassword, signOut, onAuthStateChange) so that switching to real
 * auth is a change inside this file plus `src/lib/auth.tsx`.
 */
import { commit, getDb, latency, logAudit, nowIso, uuid } from "@/lib/mock/db";
import { DEMO_ACCOUNTS } from "@/lib/mock/seed";
import type { AppRole, Profile, User, UUID } from "@/lib/types";

export type MockSession = { user: User; roles: AppRole[] };

const SESSION_KEY = "rentid.mock.session.v1";

let session: MockSession | null = null;
let hydrated = false;
const listeners = new Set<(s: MockSession | null) => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { user_id: UUID };
      const user = getDb().users.find((u) => u.id === parsed.user_id) ?? null;
      session = user ? { user, roles: rolesFor(user.id) } : null;
    }
  } catch {
    session = null;
  }
}

function persist() {
  if (typeof window === "undefined") return;
  if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify({ user_id: session.user.id }));
  else window.localStorage.removeItem(SESSION_KEY);
}

function emit() {
  persist();
  listeners.forEach((l) => l(session));
}

function rolesFor(userId: UUID): AppRole[] {
  return getDb()
    .user_roles.filter((r) => r.user_id === userId)
    .map((r) => r.role);
}

export function getSession(): MockSession | null {
  hydrate();
  return session;
}

export function onAuthStateChange(listener: (s: MockSession | null) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function signIn(email: string, password: string): Promise<MockSession> {
  const db = getDb();
  const normalized = email.trim().toLowerCase();
  const cred = db.credentials.find((c) => c.email.toLowerCase() === normalized);
  if (!cred || cred.password !== password) {
    throw new Error("Incorrect email or password.");
  }
  const user = db.users.find((u) => u.id === cred.user_id)!;
  user.last_sign_in_at = nowIso();
  session = { user, roles: rolesFor(user.id) };
  commit();
  emit();
  return latency(session, 220);
}

export async function signUp(input: {
  email: string;
  password: string;
  fullName: string;
  role: AppRole;
}): Promise<MockSession> {
  const db = getDb();
  const normalized = input.email.trim().toLowerCase();
  if (db.credentials.some((c) => c.email.toLowerCase() === normalized)) {
    throw new Error("An account with that email already exists.");
  }
  const now = nowIso();
  const user: User = { id: uuid(), email: normalized, created_at: now, last_sign_in_at: now };
  db.users.push(user);
  db.credentials.push({ user_id: user.id, email: normalized, password: input.password });
  db.profiles.push({
    id: user.id,
    full_name: input.fullName.trim() || null,
    email: normalized,
    phone: null,
    avatar_url: null,
    onboarded: false,
    created_at: now,
    updated_at: now,
  });
  db.user_roles.push({ id: uuid(), user_id: user.id, role: input.role, created_at: now });
  logAudit({ actor_id: user.id, actor_role: input.role, action: "auth.signup", entity_type: "user", entity_id: user.id });
  session = { user, roles: [input.role] };
  commit();
  emit();
  return latency(session, 260);
}

export async function signOut() {
  session = null;
  emit();
  return latency(true, 80);
}

export async function getProfile(userId: UUID): Promise<Profile | null> {
  return latency(getDb().profiles.find((p) => p.id === userId) ?? null, 90);
}

export async function updateProfile(
  userId: UUID,
  patch: Partial<Pick<Profile, "full_name" | "phone" | "onboarded" | "avatar_url">>,
): Promise<Profile> {
  const profile = getDb().profiles.find((p) => p.id === userId);
  if (!profile) throw new Error("Profile not found.");
  Object.assign(profile, patch, { updated_at: nowIso() });
  commit();
  return latency(profile, 140);
}

export async function getRoles(userId: UUID): Promise<AppRole[]> {
  return latency(rolesFor(userId), 80);
}

export async function addRole(userId: UUID, role: AppRole) {
  const db = getDb();
  if (!db.user_roles.some((r) => r.user_id === userId && r.role === role)) {
    db.user_roles.push({ id: uuid(), user_id: userId, role, created_at: nowIso() });
    commit();
    if (session?.user.id === userId) {
      session = { ...session, roles: rolesFor(userId) };
      emit();
    }
  }
  return latency(true, 80);
}

export { DEMO_ACCOUNTS };
