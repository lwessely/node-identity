import { afterAll, beforeAll, expect, test } from "@jest/globals"
import knex from "knex"
import { User, UserAdmin } from "../src/user"
import {
  Group,
  GroupAdmin,
  GroupExistsError,
  GroupInvalidError,
  GroupNotAMemberError,
} from "../src/group"

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
  await userAdmin.remove("group-test-user-1")
  await userAdmin.remove("group-test-user-2")
  await userAdmin.remove("group-test-user-3")
  await db.destroy()
})

test("Group database is not set up twice accidentally", async () => {
  const groupSchemaResult = await db
    .select("migration_number")
    .from("group_schema")
  expect(groupSchemaResult).toStrictEqual([{ migration_number: 2 }])
})

test("Creates a group", async () => {
  const group = await groupAdmin.create("test-group")
  expect(group).toBeInstanceOf(Group)

  try {
    await groupAdmin.create("test-group")
    expect(true).toBe(false)
  } catch (e) {
    expect(e).toBeInstanceOf(GroupExistsError)
  }
})

test("Lists groups", async () => {
  await groupAdmin.create("b-test-group")
  await groupAdmin.create("a-test-group")

  {
    const groupNames = await groupAdmin.list(0, 10)
    expect(groupNames).toEqual([
      "a-test-group",
      "b-test-group",
      "test-group",
    ])
  }
  {
    const groupNames = await groupAdmin.list(0, 1)
    expect(groupNames).toEqual(["a-test-group"])
  }
  {
    const groupNames = await groupAdmin.list(1, 1)
    expect(groupNames).toEqual(["b-test-group"])
  }
  {
    const groupNames = await groupAdmin.list(1, 2)
    expect(groupNames).toEqual(["b-test-group", "test-group"])
  }

  await groupAdmin.remove("b-test-group")
  await groupAdmin.remove("a-test-group")
})

test("Gets a group", async () => {
  const group = await groupAdmin.get("test-group")
  expect(group).toBeInstanceOf(Group)
  expect(typeof group.getId()).toBe("number")
  expect(typeof group.getName()).toBe("string")

  try {
    await groupAdmin.get("non-existant-group")
    expect(true).toBe(false)
  } catch (e) {
    expect(e).toBeInstanceOf(GroupInvalidError)
  }

  const newGroup = await groupAdmin.create("new-group")
  expect(typeof newGroup.getId()).toBe("number")
  expect(newGroup.getName()).toBe("new-group")

  const newGroupCopy = await groupAdmin.get("new-group")
  expect(newGroupCopy.getId()).toBe(newGroup.getId())
  expect(newGroupCopy.getName()).toBe(newGroup.getName())

  await groupAdmin.remove("new-group")
})

test("Adds members to a group", async () => {
  const user1 = await userAdmin.create("group-test-user-1")
  const user2 = await userAdmin.create("group-test-user-2")
  await userAdmin.create("group-test-user-3")

  const group = await groupAdmin.get("test-group")
  await group.addMember(user1)
  await group.addMember(user2)
})

test("Checks if user is member of a group", async () => {
  const user1 = await userAdmin.get("group-test-user-1")
  const user2 = await userAdmin.get("group-test-user-2")
  const user3 = await userAdmin.get("group-test-user-3")

  const group = await groupAdmin.get("test-group")

  expect(await group.hasMember(user1)).toBe(true)
  expect(await group.hasMember(user2)).toBe(true)
  expect(await group.hasMember(user3)).toBe(false)
})

test("Removes members from a group", async () => {
  const user1 = await userAdmin.get("group-test-user-1")
  const group = await groupAdmin.get("test-group")
  await group.removeMember(user1)

  try {
    await group.removeMember(user1)
    expect(true).toBe(false)
  } catch (e) {
    expect(e).toBeInstanceOf(GroupNotAMemberError)
  }
})

test("Lists group members", async () => {
  const group = await groupAdmin.get("test-group")
  const members = await group.listMembers()
  expect(members).toStrictEqual(["group-test-user-2"])
})

test("Checks if a group exists", async () => {
  expect(await groupAdmin.exists("test-group")).toBe(true)
  expect(await groupAdmin.exists("non-existant-group")).toBe(false)
})

test("Removes a group", async () => {
  const group2 = await groupAdmin.create("second-test-group")
  await groupAdmin.remove("test-group")

  try {
    await groupAdmin.get("test-group")
    expect(true).toBe(false)
  } catch (e) {
    expect(e).toBeInstanceOf(GroupInvalidError)
  }

  await groupAdmin.get("second-test-group")
  await groupAdmin.remove(group2.getName())
})
