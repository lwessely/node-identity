import { afterAll, beforeAll, expect, test } from "@jest/globals"
import knex from "knex"
import { User } from "../src/user"
import {
  Group,
  GroupExistsError,
  GroupInvalidError,
} from "../src/group"

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
  await User.connect(db)
})

afterAll(async () => {
  await User.remove("group-test-user-1")
  await User.remove("group-test-user-2")
  await User.remove("group-test-user-3")
  await db.destroy()
})

test("Sets up the group database correctly", async () => {
  await Group.connect(db)
  const groupSchemaResult = await db
    .select("schema_version")
    .from("group_schema")
  expect(groupSchemaResult).toStrictEqual([{ schema_version: 1 }])
})

test("Group database is not set up twice accidentally", async () => {
  await Group.connect(db)
  const groupSchemaResult = await db
    .select("schema_version")
    .from("group_schema")
  expect(groupSchemaResult).toStrictEqual([{ schema_version: 1 }])
})

test("Creates a group", async () => {
  const group = await Group.create("test-group")
  expect(group).toBeInstanceOf(Group)

  try {
    await Group.create("test-group")
    expect(true).toBe(false)
  } catch (e) {
    expect(e).toBeInstanceOf(GroupExistsError)
  }
})

test("Gets a group", async () => {
  const group = await Group.get("test-group")
  expect(group).toBeInstanceOf(Group)
  expect(typeof group.getId()).toBe("number")
  expect(typeof group.getName()).toBe("string")

  try {
    await Group.get("non-existant-group")
    expect(true).toBe(false)
  } catch (e) {
    expect(e).toBeInstanceOf(GroupInvalidError)
  }

  const newGroup = await Group.create("new-group")
  expect(typeof newGroup.getId()).toBe("number")
  expect(newGroup.getName()).toBe("new-group")

  const newGroupCopy = await Group.get("new-group")
  expect(newGroupCopy.getId()).toBe(newGroup.getId())
  expect(newGroupCopy.getName()).toBe(newGroup.getName())

  await Group.remove("new-group")
})

test("Adds members to a group", async () => {
  const user1 = await User.create("group-test-user-1")
  const user2 = await User.create("group-test-user-2")
  await User.create("group-test-user-3")

  const group = await Group.get("test-group")
  await group.addMember(user1)
  await group.addMember(user2)
})

test("Checks if user is member of a group", async () => {
  const user1 = await User.get("group-test-user-1")
  const user2 = await User.get("group-test-user-2")
  const user3 = await User.get("group-test-user-3")

  const group = await Group.get("test-group")

  expect(await group.hasMember(user1)).toBe(true)
  expect(await group.hasMember(user2)).toBe(true)
  expect(await group.hasMember(user3)).toBe(false)
})

test("Removes members from a group", async () => {
  const user1 = await User.get("group-test-user-1")
  const group = await Group.get("test-group")
  await group.removeMember(user1)
})

test("Lists group members", async () => {
  const group = await Group.get("test-group")
  const members = await group.listMembers()
  expect(members).toStrictEqual(["group-test-user-2"])
})

test("Checks if a group exists", async () => {
  expect(await Group.exists("test-group")).toBe(true)
  expect(await Group.exists("non-existant-group")).toBe(false)
})

test("Removes a group", async () => {
  const group2 = await Group.create("second-test-group")
  await Group.remove("test-group")

  try {
    await Group.get("test-group")
    expect(true).toBe(false)
  } catch (e) {
    expect(e).toBeInstanceOf(GroupInvalidError)
  }

  await Group.get("second-test-group")
  await Group.remove(group2.getName())
})
