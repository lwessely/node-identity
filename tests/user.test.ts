import { afterAll, beforeAll, expect, test } from "@jest/globals"
import {
  User,
  UserAuthenticationError,
  UserInvalidError,
} from "../src/user"
import knex from "knex"

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
  await db.destroy()
})

test("Sets up the user database correctly", async () => {
  await User.connect(db)
  const userSchemaResult = await db
    .select("schema_version")
    .from("user_schema")
  expect(userSchemaResult).toStrictEqual([{ schema_version: 1 }])
  expect(await db.schema.hasTable("user_accounts")).toBe(true)
})

test("User database is not set up twice accidentally", async () => {
  await User.connect(db)
  const userSchemaResult = await db
    .select("schema_version")
    .from("user_schema")
  expect(userSchemaResult).toStrictEqual([{ schema_version: 1 }])
})

test("Creates a user", async () => {
  const user = await User.create("test-user")
  expect(user).toBeInstanceOf(User)
})

test("Checks if user exists", async () => {
  expect(await User.exists("test-user")).toBe(true)
  expect(await User.exists("bad-user")).toBe(false)
})

test("Gets a user", async () => {
  const user = await User.get("test-user")
  expect(typeof user.getId()).toBe("number")
  expect(user.getUsername()).toBe("test-user")
  expect(user.isAuthenticated()).toBe(false)
})

test("Sets a user's password", async () => {
  const user = await User.get("test-user")
  await user.setPassword("test-password")
})

test("Checks a user's password", async () => {
  const user = await User.get("test-user")
  expect(await user.verifyPassword("test-password")).toBe(true)
  expect(await user.verifyPassword("wrong-password")).toBe(false)
})

test("Authenticates a user", async () => {
  const user = await User.get("test-user")
  expect(user.isAuthenticated()).toBe(false)

  try {
    await user.authenticate("wrong-password")
    expect(true).toBe(false)
  } catch (e) {
    expect(e).toBeInstanceOf(UserAuthenticationError)
    expect(user.isAuthenticated()).toBe(false)
  }

  await user.authenticate("test-password")
  expect(user.isAuthenticated()).toBe(true)
})

test("Removes a user", async () => {
  await User.remove("test-user")

  try {
    await User.get("test-user")
    expect(true).toBe(false)
  } catch (e) {
    expect(e).toBeInstanceOf(UserInvalidError)
  }
})
