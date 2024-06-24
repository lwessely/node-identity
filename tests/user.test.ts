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
  expect(userSchemaResult).toStrictEqual([{ migration_number: 3 }])
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

test("Indexes user data", async () => {
  const user1 = await userAdmin.get("test-user")

  {
    const indexedValues = await db("user_data_search_keys")
      .select("id")
      .where({ user_id: user1.getId() })

    expect(indexedValues.length).toBe(0)
  }

  const user2 = await userAdmin.get("second-test-user")

  {
    const indexedValues = await db("user_data_search_keys")
      .select("id")
      .where({ user_id: user2.getId() })

    expect(indexedValues.length).toBe(0)
  }

  await user1.setItems(
    {
      fullName: "Theresa Test",
      email: "theresa.test@example.com",
      phone: "555 111 222 333",
    },
    true
  )

  {
    const indexedValues = await db("user_data_search_keys")
      .select("user_id", "key", "indexed_value")
      .where({ user_id: user1.getId() })

    expect(indexedValues).toEqual([
      {
        user_id: user1.getId(),
        key: "fullName",
        indexed_value: "theresa test",
      },
      {
        user_id: user1.getId(),
        key: "fullName",
        indexed_value: "theresatest",
      },
      {
        user_id: user1.getId(),
        key: "fullName",
        indexed_value: "theresa",
      },
      {
        user_id: user1.getId(),
        key: "fullName",
        indexed_value: "test",
      },
      {
        user_id: user1.getId(),
        key: "email",
        indexed_value: "theresa.test@example.com",
      },
      {
        user_id: user1.getId(),
        key: "email",
        indexed_value: "theresa",
      },
      { user_id: user1.getId(), key: "email", indexed_value: "test" },
      {
        user_id: user1.getId(),
        key: "email",
        indexed_value: "example",
      },
      { user_id: user1.getId(), key: "email", indexed_value: "com" },
      {
        user_id: user1.getId(),
        key: "phone",
        indexed_value: "555 111 222 333",
      },
      {
        user_id: user1.getId(),
        key: "phone",
        indexed_value: "555111222333",
      },
      { user_id: user1.getId(), key: "phone", indexed_value: "555" },
      { user_id: user1.getId(), key: "phone", indexed_value: "111" },
      { user_id: user1.getId(), key: "phone", indexed_value: "222" },
      { user_id: user1.getId(), key: "phone", indexed_value: "333" },
    ])
  }

  await user2.setItems(
    {
      fullName: "Ella Eden Example",
      email: "ella.example@teogra.org",
      phone: "777 666 444 888",
    },
    true
  )

  {
    const indexedValues = await db("user_data_search_keys")
      .select("user_id", "key", "indexed_value")
      .where({ user_id: user2.getId() })

    expect(indexedValues).toEqual([
      {
        user_id: user2.getId(),
        key: "fullName",
        indexed_value: "ella eden example",
      },
      {
        user_id: user2.getId(),
        key: "fullName",
        indexed_value: "ellaedenexample",
      },
      {
        user_id: user2.getId(),
        key: "fullName",
        indexed_value: "ella",
      },
      {
        user_id: user2.getId(),
        key: "fullName",
        indexed_value: "eden",
      },
      {
        user_id: user2.getId(),
        key: "fullName",
        indexed_value: "example",
      },
      {
        user_id: user2.getId(),
        key: "email",
        indexed_value: "ella.example@teogra.org",
      },
      { user_id: user2.getId(), key: "email", indexed_value: "ella" },
      {
        user_id: user2.getId(),
        key: "email",
        indexed_value: "example",
      },
      {
        user_id: user2.getId(),
        key: "email",
        indexed_value: "teogra",
      },
      { user_id: user2.getId(), key: "email", indexed_value: "org" },
      {
        user_id: user2.getId(),
        key: "phone",
        indexed_value: "777 666 444 888",
      },
      {
        user_id: user2.getId(),
        key: "phone",
        indexed_value: "777666444888",
      },
      { user_id: user2.getId(), key: "phone", indexed_value: "777" },
      { user_id: user2.getId(), key: "phone", indexed_value: "666" },
      { user_id: user2.getId(), key: "phone", indexed_value: "444" },
      { user_id: user2.getId(), key: "phone", indexed_value: "888" },
    ])
  }

  await user2.setItems({ email: "eee@test.is" }, true)

  {
    const indexedValues = await db("user_data_search_keys")
      .select("user_id", "key", "indexed_value")
      .where({ user_id: user2.getId() })

    expect(indexedValues).toEqual([
      {
        user_id: user2.getId(),
        key: "fullName",
        indexed_value: "ella eden example",
      },
      {
        user_id: user2.getId(),
        key: "fullName",
        indexed_value: "ellaedenexample",
      },
      {
        user_id: user2.getId(),
        key: "fullName",
        indexed_value: "ella",
      },
      {
        user_id: user2.getId(),
        key: "fullName",
        indexed_value: "eden",
      },
      {
        user_id: user2.getId(),
        key: "fullName",
        indexed_value: "example",
      },
      {
        user_id: user2.getId(),
        key: "phone",
        indexed_value: "777 666 444 888",
      },
      {
        user_id: user2.getId(),
        key: "phone",
        indexed_value: "777666444888",
      },
      { user_id: user2.getId(), key: "phone", indexed_value: "777" },
      { user_id: user2.getId(), key: "phone", indexed_value: "666" },
      { user_id: user2.getId(), key: "phone", indexed_value: "444" },
      { user_id: user2.getId(), key: "phone", indexed_value: "888" },
      {
        user_id: user2.getId(),
        key: "email",
        indexed_value: "eee@test.is",
      },
      { user_id: user2.getId(), key: "email", indexed_value: "eee" },
      { user_id: user2.getId(), key: "email", indexed_value: "test" },
      { user_id: user2.getId(), key: "email", indexed_value: "is" },
    ])
  }
})

test("Lists users", async () => {
  {
    const userList = await userAdmin.list(0, 10)
    expect(userList).toEqual(["second-test-user", "test-user"])
  }
  {
    const userList = await userAdmin.list(0, 1)
    expect(userList).toEqual(["second-test-user"])
  }
  {
    const userList = await userAdmin.list(1, 1)
    expect(userList).toEqual(["test-user"])
  }
})

test("Searches for users", async () => {
  {
    const userList = await userAdmin.search(0, 10, "example.com")
    expect(userList).toEqual(["test-user", "second-test-user"])
  }
  {
    const userList = await userAdmin.search(0, 10, "ella example")
    expect(userList).toEqual(["second-test-user", "test-user"])
  }
  {
    const userList = await userAdmin.search(0, 10, "ella eden")
    expect(userList).toEqual(["second-test-user"])
  }
  {
    const userList = await userAdmin.search(0, 1, "example.com")
    expect(userList).toEqual(["test-user"])
  }
  {
    const userList = await userAdmin.search(1, 1, "example.com")
    expect(userList).toEqual(["second-test-user"])
  }
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
