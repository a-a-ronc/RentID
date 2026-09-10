/**
 * In-memory mock database with localStorage persistence.
 *
 * This is a stand-in for Postgres while the Supabase project is unavailable.
 * Only `src/lib/services/*` may touch it — UI code always goes through the
 * service layer, so swapping this for real queries touches no components.
 */
import type {
  AppRole,
  AuditLog,
  Conversation,
  Document,
  Lease,
  Listing,
  MaintenanceRequest,
  ManagementAssignment,
  Message,
  Notification,
  Organization,
  OrganizationMember,
  OwnerAccount,
  Payment,
  PaymentSchedule,
  Profile,
  Property,
  RentalApplication,
  Review,
  ReviewDispute,
  Tenancy,
  TenantInvitation,
  Unit,
  User,
  UUID,
  VerificationRecord,
} from "@/lib/types";
import { seedDatabase } from "@/lib/mock/seed";

export type Credential = { user_id: UUID; email: string; password: string };
export type UserRole = { id: UUID; user_id: UUID; role: AppRole; created_at: string };

export type MockDatabase = {
  users: User[];
  credentials: Credential[];
  profiles: Profile[];
  user_roles: UserRole[];
  organizations: Organization[];
  organization_members: OrganizationMember[];
  properties: Property[];
  units: Unit[];
  tenancies: Tenancy[];
  leases: Lease[];
  tenant_invitations: TenantInvitation[];
  documents: Document[];
  payments: Payment[];
  payment_schedules: PaymentSchedule[];
  maintenance_requests: MaintenanceRequest[];
  conversations: Conversation[];
  messages: Message[];
  reviews: Review[];
  review_disputes: ReviewDispute[];
  verification_records: VerificationRecord[];
  notifications: Notification[];
  audit_logs: AuditLog[];
  listings: Listing[];
  rental_applications: RentalApplication[];
  owner_accounts: OwnerAccount[];
  management_assignments: ManagementAssignment[];
};

const STORAGE_KEY = "rentid.mock.db.v1";

let db: MockDatabase | null = null;
const listeners = new Set<() => void>();

function load(): MockDatabase {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as MockDatabase;
    } catch {
      /* corrupt payload — fall through to a fresh seed */
    }
  }
  return seedDatabase();
}

export function getDb(): MockDatabase {
  if (!db) db = load();
  return db;
}

/** Persist the current snapshot and notify subscribers. */
export function commit() {
  if (typeof window !== "undefined" && db) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      /* storage full or unavailable — keep the in-memory copy */
    }
  }
  listeners.forEach((l) => l());
}

export function subscribeDb(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Wipe local changes and restore the demo portfolio. */
export function resetDb() {
  db = seedDatabase();
  commit();
}

/** RFC-4122-shaped v4 id so mock rows look like real Postgres uuids. */
export function uuid(): UUID {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function nowIso() {
  return new Date().toISOString();
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Simulated network latency so loading states are exercised realistically. */
export function latency<T>(value: T, ms = 180): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function logAudit(entry: {
  organization_id?: UUID | null;
  actor_id?: UUID | null;
  actor_role?: AppRole | null;
  action: string;
  entity_type: string;
  entity_id?: UUID | null;
  metadata?: Record<string, unknown> | null;
}) {
  getDb().audit_logs.unshift({
    id: uuid(),
    organization_id: entry.organization_id ?? null,
    actor_id: entry.actor_id ?? null,
    actor_role: entry.actor_role ?? null,
    action: entry.action,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id ?? null,
    metadata: entry.metadata ?? null,
    created_at: nowIso(),
  });
}
