import crypto from "crypto";
import fs from "fs";
import path from "path";

export type PortalRole = "admin" | "invited_user" | "auditor";

export interface PortalUser {
  id: string;
  email: string;
  name: string;
  role: PortalRole;
  passwordHash?: string;
  passwordSalt?: string;
  invitedBy?: string;
  createdAt: string;
  lastLoginAt?: string;
  isActive: boolean;
}

export interface PortalInvitation {
  id: string;
  token: string;
  email: string;
  role: PortalRole;
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
  isUsed: boolean;
  usedAt?: string;
  note?: string;
}

export interface PortalSession {
  userId: string;
  email: string;
  name: string;
  role: PortalRole;
  issuedAt: number;
  expiresAt: number;
}

const DATA_DIR = path.resolve(__dirname, "../../data");
const USERS_FILE = path.join(DATA_DIR, "portal-users.json");
const INVITES_FILE = path.join(DATA_DIR, "portal-invites.json");

// Secret used for signing session tokens
const PORTAL_SECRET =
  process.env.PORTAL_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "rentmaikar-backend-portal-auth-secret-key-2026-secure-salt";

// Configurable master admin credentials
const DEFAULT_ADMIN_EMAIL = (process.env.PORTAL_ADMIN_EMAIL || "admin@rentmaikar.com").toLowerCase();
const DEFAULT_ADMIN_PASS = process.env.PORTAL_ADMIN_PASSWORD || "RentmaikarAdmin2026!#";
const MASTER_ADMIN_KEY = process.env.PORTAL_MASTER_KEY || "rm-master-admin-key-2026";

class PortalAuthService {
  private users: Map<string, PortalUser> = new Map();
  private invites: Map<string, PortalInvitation> = new Map();

  constructor() {
    this.ensureDataDir();
    this.loadState();
    this.seedDefaultAdmin();
  }

  private ensureDataDir(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
    } catch (err) {
      console.warn("[PortalAuth] Could not create data directory:", err);
    }
  }

  private hashPassword(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
  }

  private loadState(): void {
    try {
      if (fs.existsSync(USERS_FILE)) {
        const raw = fs.readFileSync(USERS_FILE, "utf-8");
        const list: PortalUser[] = JSON.parse(raw);
        list.forEach((u) => this.users.set(u.email.toLowerCase(), u));
      }
      if (fs.existsSync(INVITES_FILE)) {
        const raw = fs.readFileSync(INVITES_FILE, "utf-8");
        const list: PortalInvitation[] = JSON.parse(raw);
        list.forEach((inv) => this.invites.set(inv.token, inv));
      }
    } catch (err) {
      console.warn("[PortalAuth] Error loading users/invites from disk:", err);
    }
  }

  private saveState(): void {
    try {
      this.ensureDataDir();
      fs.writeFileSync(USERS_FILE, JSON.stringify(Array.from(this.users.values()), null, 2), "utf-8");
      fs.writeFileSync(INVITES_FILE, JSON.stringify(Array.from(this.invites.values()), null, 2), "utf-8");
    } catch (err) {
      console.warn("[PortalAuth] Error persisting users/invites to disk:", err);
    }
  }

  private seedDefaultAdmin(): void {
    if (!this.users.has(DEFAULT_ADMIN_EMAIL)) {
      const salt = crypto.randomBytes(16).toString("hex");
      const hash = this.hashPassword(DEFAULT_ADMIN_PASS, salt);
      const admin: PortalUser = {
        id: "usr-admin-root",
        email: DEFAULT_ADMIN_EMAIL,
        name: "Platform Administrator",
        role: "admin",
        passwordHash: hash,
        passwordSalt: salt,
        createdAt: new Date().toISOString(),
        isActive: true,
      };
      this.users.set(DEFAULT_ADMIN_EMAIL, admin);
      this.saveState();
      console.info(`[PortalAuth] Seeded primary Admin account (${DEFAULT_ADMIN_EMAIL})`);
    }
  }

  /**
   * Authenticate with email + password or master key
   */
  public login(
    emailOrKey: string,
    password?: string
  ): { success: boolean; token?: string; user?: Omit<PortalUser, "passwordHash" | "passwordSalt">; error?: string } {
    const trimmed = (emailOrKey || "").trim();

    // 1. Direct Master Key Login
    if (trimmed === MASTER_ADMIN_KEY || (password && password === MASTER_ADMIN_KEY)) {
      const adminUser: PortalUser = this.users.get(DEFAULT_ADMIN_EMAIL) || {
        id: "usr-master",
        email: DEFAULT_ADMIN_EMAIL,
        name: "Master Administrator",
        role: "admin",
        createdAt: new Date().toISOString(),
        isActive: true,
      };
      const token = this.createSessionToken({
        userId: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        role: "admin",
      });
      return {
        success: true,
        token,
        user: {
          id: adminUser.id,
          email: adminUser.email,
          name: adminUser.name,
          role: "admin",
          createdAt: adminUser.createdAt,
          isActive: true,
        },
      };
    }

    // 2. Email + Password
    const email = trimmed.toLowerCase();
    const user = this.users.get(email);
    if (!user || !user.isActive) {
      return { success: false, error: "Invalid credentials or account inactive" };
    }

    if (!user.passwordHash || !user.passwordSalt || !password) {
      return { success: false, error: "Password not set for this account. Use invitation link." };
    }

    const testHash = this.hashPassword(password, user.passwordSalt);
    if (testHash !== user.passwordHash) {
      return { success: false, error: "Invalid email or password" };
    }

    user.lastLoginAt = new Date().toISOString();
    this.saveState();

    const token = this.createSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    const { passwordHash: _h, passwordSalt: _s, ...safeUser } = user;
    return { success: true, token, user: safeUser };
  }

  /**
   * Create an invitation for a new user
   */
  public createInvitation(params: {
    email: string;
    role: PortalRole;
    invitedBy: string;
    expiresInHours?: number;
    note?: string;
  }): { success: boolean; invitation?: PortalInvitation; error?: string } {
    const email = params.email.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return { success: false, error: "Valid email address is required" };
    }

    const token = "inv_" + crypto.randomBytes(24).toString("hex");
    const expiresHours = params.expiresInHours && params.expiresInHours > 0 ? params.expiresInHours : 168; // 7 days default
    const expiresAt = new Date(Date.now() + expiresHours * 3600 * 1000).toISOString();

    const invitation: PortalInvitation = {
      id: "inv-" + Date.now(),
      token,
      email,
      role: params.role || "invited_user",
      invitedBy: params.invitedBy,
      createdAt: new Date().toISOString(),
      expiresAt,
      isUsed: false,
      note: params.note,
    };

    this.invites.set(token, invitation);
    this.saveState();

    return { success: true, invitation };
  }

  /**
   * Redeem an invitation to create/activate a user account
   */
  public acceptInvitation(params: {
    token: string;
    name: string;
    password?: string;
  }): { success: boolean; token?: string; user?: Omit<PortalUser, "passwordHash" | "passwordSalt">; error?: string } {
    const invite = this.invites.get(params.token.trim());
    if (!invite) {
      return { success: false, error: "Invitation not found or invalid" };
    }

    if (invite.isUsed) {
      return { success: false, error: "This invitation has already been redeemed" };
    }

    if (new Date(invite.expiresAt).getTime() < Date.now()) {
      return { success: false, error: "This invitation has expired" };
    }

    const email = invite.email.toLowerCase();
    let salt: string | undefined;
    let hash: string | undefined;

    if (params.password && params.password.length >= 8) {
      salt = crypto.randomBytes(16).toString("hex");
      hash = this.hashPassword(params.password, salt);
    }

    const existingUser = this.users.get(email);
    const userId = existingUser ? existingUser.id : "usr-" + Date.now();

    const user: PortalUser = {
      id: userId,
      email,
      name: params.name?.trim() || email.split("@")[0],
      role: invite.role,
      passwordHash: hash || existingUser?.passwordHash,
      passwordSalt: salt || existingUser?.passwordSalt,
      invitedBy: invite.invitedBy,
      createdAt: existingUser ? existingUser.createdAt : new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      isActive: true,
    };

    this.users.set(email, user);

    invite.isUsed = true;
    invite.usedAt = new Date().toISOString();
    this.saveState();

    const sessionToken = this.createSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    const { passwordHash: _h, passwordSalt: _s, ...safeUser } = user;
    return { success: true, token: sessionToken, user: safeUser };
  }

  /**
   * Revoke an invitation
   */
  public revokeInvitation(token: string): boolean {
    const invite = this.invites.get(token);
    if (!invite) return false;
    invite.isUsed = true;
    invite.expiresAt = new Date(0).toISOString();
    this.saveState();
    return true;
  }

  /**
   * List all invitations
   */
  public listInvitations(): PortalInvitation[] {
    return Array.from(this.invites.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * List all portal users
   */
  public listUsers(): Omit<PortalUser, "passwordHash" | "passwordSalt">[] {
    return Array.from(this.users.values()).map(({ passwordHash: _h, passwordSalt: _s, ...safe }) => safe);
  }

  /**
   * Toggle user active status
   */
  public setUserActive(userId: string, isActive: boolean): boolean {
    for (const u of this.users.values()) {
      if (u.id === userId) {
        if (u.email === DEFAULT_ADMIN_EMAIL && !isActive) {
          throw new Error("Cannot deactivate primary root Administrator");
        }
        u.isActive = isActive;
        this.saveState();
        return true;
      }
    }
    return false;
  }

  /**
   * Cryptographically sign a session payload
   */
  public createSessionToken(payload: {
    userId: string;
    email: string;
    name: string;
    role: PortalRole;
  }): string {
    const session: PortalSession = {
      ...payload,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    };

    const encoded = Buffer.from(JSON.stringify(session)).toString("base64url");
    const signature = crypto.createHmac("sha256", PORTAL_SECRET).update(encoded).digest("base64url");
    return `rm_portal.${encoded}.${signature}`;
  }

  /**
   * Verify and decode a session token
   */
  public verifySessionToken(token: string): PortalSession | null {
    if (!token || !token.startsWith("rm_portal.")) return null;

    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [, encoded, signature] = parts;
    const expected = crypto.createHmac("sha256", PORTAL_SECRET).update(encoded).digest("base64url");

    if (signature !== expected) return null;

    try {
      const session: PortalSession = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8"));
      if (session.expiresAt < Date.now()) return null;
      return session;
    } catch {
      return null;
    }
  }
}

export const portalAuthService = new PortalAuthService();
