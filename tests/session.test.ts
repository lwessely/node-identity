import { afterAll, beforeAll, expect, test } from "@jest/globals"
import knex from "knex"
import {
  Session,
  SessionExpiredError,
  SessionInvalidError,
  SessionRenewalError,
} from "../src/session"
import { User, UserAuthenticationError } from "../src/user"

let sessionId = -1
let sessionToken: string = ""
let db: knex.Knex

beforeAll(async () => {
  db = knex({
    client: "mysql2",
    connection: {
      user: "test",
      password: "test",
      host: "127.0.0.1",
      port: 3306,
      database: "users_test",
    },
  })
})

afterAll(async () => {
  await User.remove("session-test-user")
  await db.destroy()
})

test("Sets up the session database correctly", async () => {
  await Session.connect(db)
  const sessionSchemaResult = await db
    .select("schema_version")
    .from("session_schema")
  expect(sessionSchemaResult).toStrictEqual([
    { schema_version: 1 },
    { schema_version: 2 },
    { schema_version: 3 },
  ])
  expect(await db.schema.hasTable("session_tokens")).toBe(true)
})

test("Session database is not set up twice accidentally", async () => {
  await Session.connect(db)
  const sessionSchemaResult = await db
    .select("schema_version")
    .from("session_schema")
  expect(sessionSchemaResult).toStrictEqual([
    { schema_version: 1 },
    { schema_version: 2 },
    { schema_version: 3 },
  ])
})

test("Creates a session", async () => {
  const session = await Session.create()
  sessionId = session.getId()
  expect(typeof sessionId).toBe("number")
  expect(session.getUserId()).toBe(null)
  sessionToken = session.getToken()
  expect(typeof sessionToken).toBe("string")
  expect(sessionToken.length).toBe(40)
})

test("Opens a session", async () => {
  {
    const session = await Session.open(sessionToken)
    expect(session.getId()).toBe(sessionId)
    expect(session.getUserId()).toBe(null)
    expect(session.getToken()).toBe(sessionToken)
  }
  {
    const session = await Session.create({ seconds: -1 })

    try {
      await Session.open(session.getToken())
      expect(true).toBe(false)
    } catch (e) {
      expect(e).toBeInstanceOf(SessionExpiredError)
    }

    await session.destroy()
  }
})

test("Sets a session's user id", async () => {
  User.connect(db)
  const user = await User.create("session-test-user")
  const session = await Session.open(sessionToken)
  expect(session.getUserId()).toBe(null)
  await session.setUserId(user.getId())
  expect(session.getUserId()).toBe(user.getId())
  const sessionCopy = await Session.open(sessionToken)
  expect(sessionCopy.getUserId()).toBe(user.getId())
})

test("Discards a session's user id", async () => {
  const session = await Session.open(sessionToken)
  const user = await User.get("session-test-user")
  expect(session.getUserId()).toBe(user.getId())
  await session.discardUserId()
  expect(session.getUserId()).toBe(null)
  const sessionCopy = await Session.open(sessionToken)
  expect(sessionCopy.getUserId()).toBe(null)
})

test("Logs in a user", async () => {
  const user = await User.get("session-test-user")
  expect(user.isAuthenticated()).toBe(false)
  const session = await Session.open(sessionToken)
  expect(session.getUserId()).toBe(null)
  await user.setPassword("test-password")

  try {
    expect(await user.login(session, "wrong-password"))
    expect(true).toBe(false)
  } catch (e) {
    expect(e).toBeInstanceOf(UserAuthenticationError)
    expect(session.getUserId()).toBe(null)
  }

  await user.login(session, "test-password")
  expect(session.getUserId()).toBe(user.getId())
  expect(user.isAuthenticated()).toBe(true)

  const sessionCopy = Session.open(sessionToken)
  expect((await sessionCopy).getUserId()).toBe(user.getId())
})

test("Gets a user from a session", async () => {
  const session = await Session.open(sessionToken)
  const user = await User.fromSession(session)
  expect(session.getUserId()).toBe(user.getId())
  expect(user.getUsername()).toBe("session-test-user")
  expect(user.isAuthenticated()).toBe(true)
})

test("Prevents logging out user from wrong session", async () => {
  const session = await Session.open(sessionToken)
  const user = await User.fromSession(session)
  const wrongSession = await Session.create()
  const newUser = await User.create("new-session-test-user")
  await newUser.setPassword("123")
  await newUser.login(wrongSession, "123")

  try {
    await user.logout(wrongSession)
    expect(true).toBe(false)
  } catch (e) {
    expect(e).toBeInstanceOf(SessionInvalidError)
  }

  expect(wrongSession.getUserId()).toBe(newUser.getId())
  expect(session.getUserId()).toBe(user.getId())

  await User.remove("new-session-test-user")
  await wrongSession.destroy()
})

test("Logs out a user", async () => {
  const session = await Session.open(sessionToken)
  const user = await User.fromSession(session)
  expect(session.getUserId()).toBe(user.getId())
  expect(user.isAuthenticated()).toBe(true)
  await user.logout(session)
  expect(session.getUserId()).toBe(null)
  expect(user.isAuthenticated()).toBe(false)

  const sessionCopy = await Session.open(sessionToken)
  expect(sessionCopy.getUserId()).toBe(null)
})

test("Sets and gets a session's expiration and renewal date", async () => {
  const session = await Session.create(
    {
      years: 1,
      months: 3,
      weeks: 2,
      days: 5,
      hours: 3,
      minutes: 15,
      seconds: 40,
      milliseconds: 400,
    },
    {
      days: 2,
    }
  )
  const expectedExpirationDate = new Date(
    new Date().getTime() + 41094940400
  )
  const expectedRenewableUntilDate = new Date(
    expectedExpirationDate.getTime() + 2 * 24 * 60 * 60 * 1000
  )

  {
    const expirationDate = session.getExpirationDate()
    expect(
      expectedExpirationDate.getTime() -
        (expirationDate?.getTime() as number)
    ).toBeLessThan(1000)
    const renewableUntilDate = session.getRenewableUntilDate()
    expect(
      expectedRenewableUntilDate.getTime() -
        (renewableUntilDate?.getTime() as number)
    ).toBeLessThan(1000)
  }
  {
    const sessionCopy = await Session.open(session.getToken())

    const expirationDate = sessionCopy.getExpirationDate()
    expect(
      expectedExpirationDate.getTime() -
        (expirationDate?.getTime() as number)
    ).toBeLessThan(1000)

    const renewableUntilDate = sessionCopy.getRenewableUntilDate()
    expect(
      expectedRenewableUntilDate.getTime() -
        (renewableUntilDate?.getTime() as number)
    ).toBeLessThan(1000)
  }
  await session.destroy()
})

test("Changes a session's lifespan and renewal period", async () => {
  const session = await Session.create({ days: 1 }, { days: 2 })

  {
    const expectedExpirationDate = new Date(
      new Date().getTime() + 24 * 60 * 60 * 1000
    )
    const expectedRenewableUntilDate = new Date(
      expectedExpirationDate.getTime() + 2 * 24 * 60 * 60 * 1000
    )
    const expirationDate = session.getExpirationDate()
    expect(
      expectedExpirationDate.getTime() -
        (expirationDate?.getTime() as number)
    ).toBeLessThan(1000)
    const renewableUntilDate = session.getRenewableUntilDate()
    expect(
      expectedRenewableUntilDate.getTime() -
        (renewableUntilDate?.getTime() as number)
    ).toBeLessThan(1000)
  }
  {
    await session.updateLifetime({ days: 5 }, { days: 15 })
    const expectedExpirationDate = new Date(
      new Date().getTime() + 5 * 24 * 60 * 60 * 1000
    )
    const expectedRenewableUntilDate = new Date(
      expectedExpirationDate.getTime() + 15 * 24 * 60 * 60 * 1000
    )
    const expirationDate = session.getExpirationDate()
    expect(
      expectedExpirationDate.getTime() -
        (expirationDate?.getTime() as number)
    ).toBeLessThan(1000)
    const renewableUntilDate = session.getRenewableUntilDate()
    expect(
      expectedRenewableUntilDate.getTime() -
        (renewableUntilDate?.getTime() as number)
    ).toBeLessThan(1000)

    const sessionCopy = await Session.open(session.getToken())
    const expirationDateCopy = sessionCopy.getExpirationDate()
    expect(
      expectedExpirationDate.getTime() -
        (expirationDateCopy?.getTime() as number)
    ).toBeLessThan(1000)
    const renewableUntilDateCopy = sessionCopy.getRenewableUntilDate()
    expect(
      expectedRenewableUntilDate.getTime() -
        (renewableUntilDateCopy?.getTime() as number)
    ).toBeLessThan(1000)
  }
  await session.destroy()
})

test("Renews a session", async () => {
  {
    const session = await Session.create({ days: -1 }, { days: 2 })

    try {
      await Session.open(session.getToken())
      expect(true).toBe(false)
    } catch (e) {
      expect(e).toBeInstanceOf(SessionExpiredError)
    }

    const renewedSession = await Session.renew(
      session.getToken(),
      { days: 5 },
      session.getRenewalToken() as string,
      { days: 10 }
    )
    const expectedExpirationDate = new Date(
      new Date().getTime() + 5 * 24 * 60 * 60 * 1000
    )
    const expectedRenewableUntilDate = new Date(
      expectedExpirationDate.getTime() + 10 * 24 * 60 * 60 * 1000
    )

    const expirationDate = renewedSession.getExpirationDate()
    expect(
      expectedExpirationDate.getTime() -
        (expirationDate?.getTime() as number)
    ).toBeLessThan(1000)
    const renewableUntilDate = renewedSession.getRenewableUntilDate()
    expect(
      expectedRenewableUntilDate.getTime() -
        (renewableUntilDate?.getTime() as number)
    ).toBeLessThan(1000)

    expect(renewedSession.getToken()).not.toBe(session.getToken())
    expect(renewedSession.getRenewalToken()).not.toBe(
      session.getRenewalToken()
    )

    await Session.open(renewedSession.getToken())
    session.destroy()
  }
  {
    const session = await Session.create({ days: -10 }, { days: 5 })
    try {
      await Session.renew(
        session.getToken(),
        { days: 10 },
        session.getRenewalToken() as string,
        { days: 10 }
      )
      expect(true).toBe(false)
    } catch (e) {
      expect(e).toBeInstanceOf(SessionRenewalError)
    }
    await session.destroy()
  }
  {
    try {
      await Session.renew("x", { days: 10 }, "y", { days: 10 })
      expect(true).toBe(false)
    } catch (e) {
      expect(e).toBeInstanceOf(SessionRenewalError)
    }
  }
})

test("Purges dead sessions", async () => {
  const survivor1 = await Session.create({ days: 5 }, { days: 10 })
  const survivor2 = await Session.create({ days: -3 }, { days: 5 })
  const purged1 = await Session.create({ days: -5 }, { days: 4 })
  const purged2 = await Session.create({ days: -10 }, { days: 8 })

  await Session.open(survivor1.getToken())

  try {
    await Session.open(survivor2.getToken())
    expect(true).toBe(false)
  } catch (e) {
    expect(e).toBeInstanceOf(SessionExpiredError)
  }

  try {
    await Session.open(purged1.getToken())
    expect(true).toBe(false)
  } catch (e) {
    expect(e).toBeInstanceOf(SessionExpiredError)
  }

  try {
    await Session.open(purged2.getToken())
    expect(true).toBe(false)
  } catch (e) {
    expect(e).toBeInstanceOf(SessionExpiredError)
  }

  await Session.purge()

  await Session.open(survivor1.getToken())

  try {
    await Session.open(survivor2.getToken())
    expect(true).toBe(false)
  } catch (e) {
    expect(e).toBeInstanceOf(SessionExpiredError)
  }

  try {
    await Session.open(purged1.getToken())
    expect(true).toBe(false)
  } catch (e) {
    expect(e).toBeInstanceOf(SessionInvalidError)
  }

  try {
    await Session.open(purged2.getToken())
    expect(true).toBe(false)
  } catch (e) {
    expect(e).toBeInstanceOf(SessionInvalidError)
  }

  await survivor1.destroy()
  survivor2.destroy()
})

test("Destroys a session", async () => {
  const session = await Session.open(sessionToken)
  await session.destroy()

  try {
    await Session.open(sessionToken)
    expect(true).toBe(false)
  } catch (e) {
    expect(e).toBeInstanceOf(SessionInvalidError)
  }
})
