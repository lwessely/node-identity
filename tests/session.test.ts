import { afterAll, beforeAll, expect, test } from "@jest/globals"
import knex from "knex"
import { Session, SessionInvalidError } from "../src/session"
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
  expect(sessionSchemaResult).toStrictEqual([{ schema_version: 1 }])
  expect(await db.schema.hasTable("session_tokens")).toBe(true)
})

test("Session database is not set up twice accidentally", async () => {
  await Session.connect(db)
  const sessionSchemaResult = await db
    .select("schema_version")
    .from("session_schema")
  expect(sessionSchemaResult).toStrictEqual([{ schema_version: 1 }])
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
  const session = await Session.open(sessionToken)
  expect(session.getId()).toBe(sessionId)
  expect(session.getUserId()).toBe(null)
  expect(session.getToken()).toBe(sessionToken)
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
