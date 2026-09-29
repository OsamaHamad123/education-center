import { APIError, isAPIError } from "better-auth/api";
import { describe, expect, it } from "vitest";
import { LOGIN_LOCKOUT } from "@/shared/config/constants";
import { err, ok, type Result } from "@/shared/lib/result";
import {
  recordSignInOutcome,
  refuseIfLockedOut,
  signInIdentifier,
  type LockoutStore,
} from "./login-lockout-hooks";

/** Records every call, and reports "locked" for the names in `locked`. */
function fakeStore(locked: string[] = []) {
  const calls: string[] = [];
  const store: LockoutStore = {
    assertNotLockedOut(identifier): Promise<Result<null>> {
      calls.push(`check:${identifier}`);
      return Promise.resolve(locked.includes(identifier) ? err("RATE_LIMITED", "locked message") : ok(null));
    },
    recordFailedLogin(identifier) {
      calls.push(`fail:${identifier}`);
      return Promise.resolve();
    },
    clearFailedLogins(identifier) {
      calls.push(`clear:${identifier}`);
      return Promise.resolve();
    },
  };
  return { store, calls };
}

describe("signInIdentifier", () => {
  it("reads the username on username sign-in, normalised", () => {
    expect(signInIdentifier("/sign-in/username", { username: "  Admin_NSR ", password: "x" })).toBe(
      "admin_nsr",
    );
  });

  it("guards email sign-in too, so it is not a way around the lockout", () => {
    expect(signInIdentifier("/sign-in/email", { email: "A@x.test", password: "x" })).toBe("a@x.test");
  });

  it("ignores every other endpoint and malformed bodies", () => {
    expect(signInIdentifier("/get-session", { username: "admin_nsr" })).toBeNull();
    expect(signInIdentifier(undefined, { username: "admin_nsr" })).toBeNull();
    expect(signInIdentifier("/sign-in/username", null)).toBeNull();
    expect(signInIdentifier("/sign-in/username", { username: 42 })).toBeNull();
    expect(signInIdentifier("/sign-in/username", { username: "   " })).toBeNull();
  });
});

describe("refuseIfLockedOut", () => {
  it("lets an unlocked account through to the password check", async () => {
    const { store, calls } = fakeStore();

    await expect(
      refuseIfLockedOut(store, "/sign-in/username", { username: "admin_nsr" }),
    ).resolves.toBeUndefined();
    expect(calls).toEqual(["check:admin_nsr"]);
  });

  it("refuses a locked account with a 429 the form can recognise", async () => {
    const { store } = fakeStore(["admin_nsr"]);

    const error = await refuseIfLockedOut(store, "/sign-in/username", { username: "Admin_NSR" }).then(
      () => null,
      (thrown: unknown) => thrown,
    );

    expect(isAPIError(error)).toBe(true);
    if (!isAPIError(error)) return;
    expect(error.statusCode).toBe(429);
    expect(error.body).toMatchObject({ code: LOGIN_LOCKOUT.errorCode, message: "locked message" });
  });

  it("does nothing for requests that are not sign-ins", async () => {
    const { store, calls } = fakeStore(["admin_nsr"]);

    await refuseIfLockedOut(store, "/get-session", { username: "admin_nsr" });
    expect(calls).toEqual([]);
  });
});

describe("recordSignInOutcome", () => {
  const body = { username: "admin_nsr", password: "x" };

  it("clears the account's failures when the attempt created a session", async () => {
    const { store, calls } = fakeStore();

    await recordSignInOutcome(store, "/sign-in/username", body, {
      newSession: { session: {} },
      returned: {},
    });
    expect(calls).toEqual(["clear:admin_nsr"]);
  });

  it("counts a refused attempt against the account", async () => {
    const { store, calls } = fakeStore();
    const refused = APIError.from("UNAUTHORIZED", { code: "INVALID_USERNAME_OR_PASSWORD", message: "no" });

    await recordSignInOutcome(store, "/sign-in/username", body, { newSession: null, returned: refused });
    expect(calls).toEqual(["fail:admin_nsr"]);
  });

  it("records nothing for other endpoints", async () => {
    const { store, calls } = fakeStore();

    await recordSignInOutcome(store, "/sign-out", body, {
      newSession: null,
      returned: new APIError("UNAUTHORIZED"),
    });
    expect(calls).toEqual([]);
  });
});
