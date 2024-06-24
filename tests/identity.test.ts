import { beforeAll, afterAll, test, expect } from "@jest/globals"
import knex from "knex"
import { Identity } from "../src/identity"

let db: knex.Knex
let identity: Identity
let sessionToken = ""

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

  identity = new Identity(db)
  await identity.user.schema.build()
  await identity.group.schema.build()
  await identity.session.schema.build()
})

afterAll(async () => {
  await identity.user.remove("identity-atomic-test-user")
  await identity.group.remove("identity-atomic-test-group")
  const session = await identity.session.open(sessionToken)
  await session.destroy()
  await db.destroy()
})

test("Makes operations atomic", async () => {
  await identity.atomicOperation(async (atomic) => {
    const user = await atomic.user.create("identity-atomic-test-user")
    await user.setPassword("123")
    await user.setItems({
      foo: "bar",
      lorem: "ipsum",
    })

    const group = await atomic.group.create(
      "identity-atomic-test-group"
    )
    await group.addMember(user)

    const session = await atomic.session.create()
    await user.login(session, "123")

    sessionToken = session.getToken()
  })

  const user = await identity.user.get("identity-atomic-test-user")
  const group = await identity.group.get("identity-atomic-test-group")
  const session = await identity.session.open(sessionToken)

  expect(await group.hasMember(user)).toBe(true)
  expect(session.getUserId()).toBe(user.getId())

  try {
    await identity.atomicOperation(async (atomic) => {
      await atomic.user.create("this-user-should-not-exist")
      await atomic.user.remove("identity-atomic-test-user")
      await atomic.group.remove("identity-atomic-test-group")
      const session = await atomic.session.open(sessionToken)
      await session.destroy()

      throw Error("Roll it back!")
    })
    expect(true).toBe(false)
  } catch (e) {
    if ((e as Error).message !== "Roll it back!") {
      throw e
    }
  }

  expect(
    await identity.user.exists("this-user-should-not-exist")
  ).toBe(false)
})
