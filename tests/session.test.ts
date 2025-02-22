import { afterAll, beforeAll, expect, test } from "@jest/globals"
import knex from "knex"
import {
  Session,
  SessionAdmin,
  SessionExpiredError,
  SessionInvalidError,
  SessionRenewalError,
} from "../src/session"
import { Group, GroupAdmin } from "../src/group"
import { User, UserAdmin, UserAuthenticationError } from "../src/user"

let sessionId = -1
let sessionToken: string = ""
let db: knex.Knex
let userAdmin: UserAdmin
let groupAdmin: GroupAdmin
let sessionAdmin: SessionAdmin

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

  userAdmin = new UserAdmin(db)
  await userAdmin.schema.build()

  groupAdmin = new GroupAdmin(db)
  await groupAdmin.schema.build()

  sessionAdmin = new SessionAdmin(db)
  await sessionAdmin.schema.build()
})

afterAll(async () => {
  await userAdmin.remove("session-test-user")
  await groupAdmin.remove("session-test-group1")
  await groupAdmin.remove("session-test-group2")
  await groupAdmin.remove("session-test-group3")
  await db.destroy()
})

test("Session database is not set up twice accidentally", async () => {
  const sessionSchemaResult = await db
    .select("migration_number")
    .from("session_schema")
  expect(sessionSchemaResult).toStrictEqual([{ migration_number: 1 }])
})

test("Creates a session", async () => {
  const session = await sessionAdmin.create()
  sessionId = session.getId()
  expect(typeof sessionId).toBe("number")
  expect(session.getUserId()).toBe(null)
  sessionToken = session.getToken()
  expect(typeof sessionToken).toBe("string")
  expect(sessionToken.length).toBe(40)
})

test("Opens a session", async () => {
  {
    const session = await sessionAdmin.open(sessionToken)
    expect(session.getId()).toBe(sessionId)
    expect(session.getUserId()).toBe(null)
    expect(session.getToken()).toBe(sessionToken)
  }
  {
    const session = await sessionAdmin.create({ seconds: -1 })

    try {
      await sessionAdmin.open(session.getToken())
      expect(true).toBe(false)
    } catch (e) {
      expect(e).toBeInstanceOf(SessionExpiredError)
    }

    await session.destroy()
  }
})

test("Sets a session's user id", async () => {
  const user = await userAdmin.create("session-test-user")
  const session = await sessionAdmin.open(sessionToken)
  expect(session.getUserId()).toBe(null)
  await session.setUserId(user.getId())
  expect(session.getUserId()).toBe(user.getId())
  const sessionCopy = await sessionAdmin.open(sessionToken)
  expect(sessionCopy.getUserId()).toBe(user.getId())
})

test("Discards a session's user id", async () => {
  const session = await sessionAdmin.open(sessionToken)
  const user = await userAdmin.get("session-test-user")
  expect(session.getUserId()).toBe(user.getId())
  await session.discardUserId()
  expect(session.getUserId()).toBe(null)
  const sessionCopy = await sessionAdmin.open(sessionToken)
  expect(sessionCopy.getUserId()).toBe(null)
})

test("Logs in a user", async () => {
  const user = await userAdmin.get("session-test-user")
  expect(user.isAuthenticated()).toBe(false)
  const session = await sessionAdmin.open(sessionToken)
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

  const sessionCopy = sessionAdmin.open(sessionToken)
  expect((await sessionCopy).getUserId()).toBe(user.getId())
})

test("Gets a user from a session", async () => {
  const group1 = await groupAdmin.create("session-test-group1")
  await groupAdmin.create("session-test-group2")
  const group3 = await groupAdmin.create("session-test-group3")
  {
    const user = await userAdmin.get("session-test-user")
    group1.addMember(user)
    group3.addMember(user)
  }
  {
    const session = await sessionAdmin.open(sessionToken)
    const user = await userAdmin.fromSession(session)
    expect(session.getUserId()).toBe(user.getId())
    expect(user.getUsername()).toBe("session-test-user")
    expect(user.isAuthenticated()).toBe(true)
    expect(user.listGroups()).toStrictEqual([
      "session-test-group1",
      "session-test-group3",
    ])
  }
})

test("Prevents logging out user from wrong session", async () => {
  const session = await sessionAdmin.open(sessionToken)
  const user = await userAdmin.fromSession(session)
  const wrongSession = await sessionAdmin.create()
  const newUser = await userAdmin.create("new-session-test-user")
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

  await userAdmin.remove("new-session-test-user")
  await wrongSession.destroy()
})

test("Logs out a user", async () => {
  const session = await sessionAdmin.open(sessionToken)
  const user = await userAdmin.fromSession(session)
  expect(session.getUserId()).toBe(user.getId())
  expect(user.isAuthenticated()).toBe(true)
  await user.logout(session)
  expect(session.getUserId()).toBe(null)
  expect(user.isAuthenticated()).toBe(false)

  const sessionCopy = await sessionAdmin.open(sessionToken)
  expect(sessionCopy.getUserId()).toBe(null)
})

test("Sets and gets a session's expiration and renewal date", async () => {
  const session = await sessionAdmin.create(
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
    expect(
      expectedExpirationDate.getTime() -
        (expirationDate?.getTime() as number)
    ).toBeGreaterThanOrEqual(0)
    const renewableUntilDate = session.getRenewableUntilDate()
    expect(
      expectedRenewableUntilDate.getTime() -
        (renewableUntilDate?.getTime() as number)
    ).toBeLessThan(1000)
    expect(
      expectedRenewableUntilDate.getTime() -
        (renewableUntilDate?.getTime() as number)
    ).toBeGreaterThanOrEqual(0)
  }
  {
    const sessionCopy = await sessionAdmin.open(session.getToken())

    const expirationDate = sessionCopy.getExpirationDate()
    expect(
      expectedExpirationDate.getTime() -
        (expirationDate?.getTime() as number)
    ).toBeLessThan(1000)
    expect(
      expectedExpirationDate.getTime() -
        (expirationDate?.getTime() as number)
    ).toBeGreaterThanOrEqual(0)

    const renewableUntilDate = sessionCopy.getRenewableUntilDate()
    expect(
      expectedRenewableUntilDate.getTime() -
        (renewableUntilDate?.getTime() as number)
    ).toBeLessThan(1000)
    expect(
      expectedRenewableUntilDate.getTime() -
        (renewableUntilDate?.getTime() as number)
    ).toBeGreaterThanOrEqual(0)
  }
  await session.destroy()
})

test("Changes a session's lifespan and renewal period", async () => {
  const session = await sessionAdmin.create({ days: 1 }, { days: 2 })

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
    expect(
      expectedExpirationDate.getTime() -
        (expirationDate?.getTime() as number)
    ).toBeGreaterThanOrEqual(0)
    const renewableUntilDate = session.getRenewableUntilDate()
    expect(
      expectedRenewableUntilDate.getTime() -
        (renewableUntilDate?.getTime() as number)
    ).toBeLessThan(1000)
    expect(
      expectedRenewableUntilDate.getTime() -
        (renewableUntilDate?.getTime() as number)
    ).toBeGreaterThanOrEqual(0)
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
    expect(
      expectedExpirationDate.getTime() -
        (expirationDate?.getTime() as number)
    ).toBeGreaterThanOrEqual(0)
    const renewableUntilDate = session.getRenewableUntilDate()
    expect(
      expectedRenewableUntilDate.getTime() -
        (renewableUntilDate?.getTime() as number)
    ).toBeLessThan(1000)
    expect(
      expectedRenewableUntilDate.getTime() -
        (renewableUntilDate?.getTime() as number)
    ).toBeGreaterThanOrEqual(0)

    const sessionCopy = await sessionAdmin.open(session.getToken())
    const expirationDateCopy = sessionCopy.getExpirationDate()
    expect(
      expectedExpirationDate.getTime() -
        (expirationDateCopy?.getTime() as number)
    ).toBeLessThan(1000)
    expect(
      expectedExpirationDate.getTime() -
        (expirationDateCopy?.getTime() as number)
    ).toBeGreaterThanOrEqual(0)
    const renewableUntilDateCopy = sessionCopy.getRenewableUntilDate()
    expect(
      expectedRenewableUntilDate.getTime() -
        (renewableUntilDateCopy?.getTime() as number)
    ).toBeLessThan(1000)
    expect(
      expectedRenewableUntilDate.getTime() -
        (renewableUntilDateCopy?.getTime() as number)
    ).toBeGreaterThanOrEqual(0)
  }
  await session.destroy()
})

test("Renews a session", async () => {
  {
    const session = await sessionAdmin.create(
      { days: -1 },
      { days: 2 }
    )

    try {
      await sessionAdmin.open(session.getToken())
      expect(true).toBe(false)
    } catch (e) {
      expect(e).toBeInstanceOf(SessionExpiredError)
    }

    const renewedSession = await sessionAdmin.renew(
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
    expect(
      expectedExpirationDate.getTime() -
        (expirationDate?.getTime() as number)
    ).toBeGreaterThanOrEqual(0)
    const renewableUntilDate = renewedSession.getRenewableUntilDate()
    expect(
      expectedRenewableUntilDate.getTime() -
        (renewableUntilDate?.getTime() as number)
    ).toBeLessThan(1000)
    expect(
      expectedRenewableUntilDate.getTime() -
        (renewableUntilDate?.getTime() as number)
    ).toBeGreaterThanOrEqual(0)

    expect(renewedSession.getToken()).not.toBe(session.getToken())
    expect(renewedSession.getRenewalToken()).not.toBe(
      session.getRenewalToken()
    )

    await sessionAdmin.open(renewedSession.getToken())
    session.destroy()
  }
  {
    const session = await sessionAdmin.create(
      { days: -10 },
      { days: 5 }
    )
    try {
      await sessionAdmin.renew(
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
      await sessionAdmin.renew("x", { days: 10 }, "y", { days: 10 })
      expect(true).toBe(false)
    } catch (e) {
      expect(e).toBeInstanceOf(SessionRenewalError)
    }
  }
})

test("Purges dead sessions", async () => {
  const survivor1 = await sessionAdmin.create(
    { days: 5 },
    { days: 10 }
  )
  const survivor2 = await sessionAdmin.create(
    { days: -3 },
    { days: 5 }
  )
  const purged1 = await sessionAdmin.create({ days: -5 }, { days: 4 })
  const purged2 = await sessionAdmin.create(
    { days: -10 },
    { days: 8 }
  )

  await sessionAdmin.open(survivor1.getToken())

  try {
    await sessionAdmin.open(survivor2.getToken())
    expect(true).toBe(false)
  } catch (e) {
    expect(e).toBeInstanceOf(SessionExpiredError)
  }

  try {
    await sessionAdmin.open(purged1.getToken())
    expect(true).toBe(false)
  } catch (e) {
    expect(e).toBeInstanceOf(SessionExpiredError)
  }

  try {
    await sessionAdmin.open(purged2.getToken())
    expect(true).toBe(false)
  } catch (e) {
    expect(e).toBeInstanceOf(SessionExpiredError)
  }

  await sessionAdmin.purge()

  await sessionAdmin.open(survivor1.getToken())

  try {
    await sessionAdmin.open(survivor2.getToken())
    expect(true).toBe(false)
  } catch (e) {
    expect(e).toBeInstanceOf(SessionExpiredError)
  }

  try {
    await sessionAdmin.open(purged1.getToken())
    expect(true).toBe(false)
  } catch (e) {
    expect(e).toBeInstanceOf(SessionInvalidError)
  }

  try {
    await sessionAdmin.open(purged2.getToken())
    expect(true).toBe(false)
  } catch (e) {
    expect(e).toBeInstanceOf(SessionInvalidError)
  }

  await survivor1.destroy()
  survivor2.destroy()
})

test("Destroys a session", async () => {
  const session = await sessionAdmin.open(sessionToken)
  await session.destroy()

  try {
    await sessionAdmin.open(sessionToken)
    expect(true).toBe(false)
  } catch (e) {
    expect(e).toBeInstanceOf(SessionInvalidError)
  }
})
