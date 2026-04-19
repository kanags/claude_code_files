// @vitest-environment node
import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock server-only so the module can be imported in tests
vi.mock("server-only", () => ({}));

// Shared cookie store mock
const cookieStoreMock = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve(cookieStoreMock)),
}));

// Must import after mocks are set up
const { createSession, getSession, deleteSession, verifySession } = await import("../auth");

const VALID_USER_ID = "user-123";
const VALID_EMAIL = "test@example.com";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── createSession ────────────────────────────────────────────────────────────

describe("createSession", () => {
  test("sets an httpOnly cookie with a JWT token", async () => {
    await createSession(VALID_USER_ID, VALID_EMAIL);

    expect(cookieStoreMock.set).toHaveBeenCalledOnce();
    const [name, token, options] = cookieStoreMock.set.mock.calls[0];
    expect(name).toBe("auth-token");
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3); // JWT format: header.payload.signature
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
  });

  test("sets cookie expiry ~7 days in the future", async () => {
    const before = Date.now();
    await createSession(VALID_USER_ID, VALID_EMAIL);
    const after = Date.now();

    const { expires } = cookieStoreMock.set.mock.calls[0][2];
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(expires.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
    expect(expires.getTime()).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
  });
});

// ─── getSession ───────────────────────────────────────────────────────────────

describe("getSession", () => {
  test("returns null when no cookie is present", async () => {
    cookieStoreMock.get.mockReturnValue(undefined);
    const session = await getSession();
    expect(session).toBeNull();
  });

  test("returns null for a tampered/invalid token", async () => {
    cookieStoreMock.get.mockReturnValue({ value: "not.a.valid.jwt" });
    const session = await getSession();
    expect(session).toBeNull();
  });

  test("returns session payload for a valid token created by createSession", async () => {
    // Step 1: capture the token written by createSession
    let capturedToken = "";
    cookieStoreMock.set.mockImplementation((_name: string, token: string) => {
      capturedToken = token;
    });
    await createSession(VALID_USER_ID, VALID_EMAIL);

    // Step 2: feed that token back for getSession to verify
    cookieStoreMock.get.mockReturnValue({ value: capturedToken });
    const session = await getSession();

    expect(session).not.toBeNull();
    expect(session!.userId).toBe(VALID_USER_ID);
    expect(session!.email).toBe(VALID_EMAIL);
  });
});

// ─── deleteSession ────────────────────────────────────────────────────────────

describe("deleteSession", () => {
  test("deletes the auth-token cookie", async () => {
    await deleteSession();
    expect(cookieStoreMock.delete).toHaveBeenCalledWith("auth-token");
  });
});

// ─── verifySession ────────────────────────────────────────────────────────────

describe("verifySession", () => {
  function makeRequest(token?: string) {
    const cookieMap = new Map(token ? [["auth-token", { value: token }]] : []);
    return {
      cookies: { get: (name: string) => cookieMap.get(name) },
    } as any;
  }

  test("returns null when request has no auth-token cookie", async () => {
    const session = await verifySession(makeRequest());
    expect(session).toBeNull();
  });

  test("returns null for an invalid token", async () => {
    const session = await verifySession(makeRequest("bad.token.value"));
    expect(session).toBeNull();
  });

  test("returns session payload for a valid token", async () => {
    // Capture a real token
    let capturedToken = "";
    cookieStoreMock.set.mockImplementation((_name: string, token: string) => {
      capturedToken = token;
    });
    await createSession(VALID_USER_ID, VALID_EMAIL);

    const session = await verifySession(makeRequest(capturedToken));
    expect(session).not.toBeNull();
    expect(session!.userId).toBe(VALID_USER_ID);
    expect(session!.email).toBe(VALID_EMAIL);
  });
});
