import { afterAll, beforeAll, expect, test } from "@jest/globals"
import {
  UserAdmin,
  User,
  UserAuthenticationError,
  UserInvalidError,
} from "../src/user"
import { GroupAdmin } from "../src/group"
import knex from "knex"

let db: knex.Knex
let userAdmin: UserAdmin
let groupAdmin: GroupAdmin

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
})

afterAll(async () => {
  await db.destroy()
})

test("User database is not set up twice accidentally", async () => {
  await userAdmin.schema.build()
  const userSchemaResult = await db
    .select("migration_number")
    .from("user_schema")
  expect(userSchemaResult).toStrictEqual([{ migration_number: 2 }])
})

test("Creates a user", async () => {
  const user = await userAdmin.create("test-user")
  expect(user).toBeInstanceOf(User)
})

test("Checks if user exists", async () => {
  expect(await userAdmin.exists("test-user")).toBe(true)
  expect(await userAdmin.exists("bad-user")).toBe(false)
})

test("Gets a user", async () => {
  const user = await userAdmin.get("test-user")
  expect(typeof user.getId()).toBe("number")
  expect(user.getUsername()).toBe("test-user")
  expect(user.isAuthenticated()).toBe(false)
})

test("Sets a user's password", async () => {
  const user = await userAdmin.get("test-user")
  await user.setPassword("test-password")
})

test("Checks a user's password", async () => {
  const user = await userAdmin.get("test-user")
  expect(await user.verifyPassword("test-password")).toBe(true)
  expect(await user.verifyPassword("wrong-password")).toBe(false)
})

test("Authenticates a user", async () => {
  const user = await userAdmin.get("test-user")
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

test("Associates data with a user", async () => {
  const user1 = await userAdmin.get("test-user")
  await user1.setItems({ lorem: 1, ipsum: "user1-data", dolor: true })
  await user1.setItems({
    lorem: 2,
    amet: "123",
    consectetur: "xyz",
    adipiscing: false,
  })

  const user2 = await userAdmin.create("second-test-user")
  await user2.setItems({
    lorem: 5,
    ipsum: "second-user-data",
    dolor: false,
  })
  await user2.setItems({
    ipsum: "second-user-data-changed",
    sit: "foo",
    amet: "bar",
    foo: "baz",
  })
})

test("Deletes data associated with a user", async () => {
  const user1 = await userAdmin.get("test-user")
  await user1.removeItems(["amet"])

  const user2 = await userAdmin.get("second-test-user")
  await user2.removeItems(["foo"])
})

test("Gets data associated with a user", async () => {
  const user1 = await userAdmin.get("test-user")
  expect(
    await user1.getItems(["lorem", "ipsum", "dolor", "amet"])
  ).toStrictEqual({
    lorem: 2,
    ipsum: "user1-data",
    dolor: true,
  })

  const user2 = await userAdmin.get("second-test-user")
  expect(
    await user2.getItems(["lorem", "ipsum", "dolor", "amet", "foo"])
  ).toStrictEqual({
    lorem: 5,
    ipsum: "second-user-data-changed",
    dolor: false,
    amet: "bar",
  })
})

test("List names of groups the user is a member of", async () => {
  const group1 = await groupAdmin.create("user-test-group1")
  await groupAdmin.create("user-test-group2")
  const group3 = await groupAdmin.create("user-test-group3")

  {
    const user = await userAdmin.get("test-user")
    await group1.addMember(user)
    await group3.addMember(user)
  }

  const user = await userAdmin.get("test-user")
  const groupNames = user.listGroups()
  expect(groupNames).toStrictEqual([
    "user-test-group1",
    "user-test-group3",
  ])

  await groupAdmin.remove("user-test-group1")
  await groupAdmin.remove("user-test-group2")
  await groupAdmin.remove("user-test-group3")
})

test("Removes a user", async () => {
  await userAdmin.remove("test-user")

  try {
    await userAdmin.get("test-user")
    expect(true).toBe(false)
  } catch (e) {
    expect(e).toBeInstanceOf(UserInvalidError)
  }

  await userAdmin.remove("second-test-user")

  try {
    await userAdmin.get("second-test-user")
    expect(true).toBe(false)
  } catch (e) {
    expect(e).toBeInstanceOf(UserInvalidError)
  }
})
