import { afterAll, beforeAll, expect, test } from "@jest/globals"
import { Schema } from "../src/schema"
import knex from "knex"

let db: knex.Knex
let schema: Schema

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

  schema = new Schema(db, "test_schema", [
    {
      up: async (db) => {
        await db.schema.createTable("test_table_1", (table) => {
          table.increments("id")
          table.string("test")
          table.index("test", "string_index")
        })
      },
      down: async (db) => {
        await db.schema.dropTable("test_table_1")
      },
    },
    {
      up: async (db) => {
        await db.schema.createTable("test_table_2", (table) => {
          table.increments("id")
          table
            .integer("foreign_id")
            .unsigned()
            .references("id")
            .inTable("test_table_1")
          table.integer("test_int")
          table.index("test_int", "test_int_index")
        })
      },
      down: async (db) => {
        await db.schema.dropTable("test_table_2")
      },
    },
  ])
})

afterAll(async () => {
  db.schema.dropTable("test_schema")
  await db.destroy()
})

test("Migrates to latest migration", async () => {
  await schema.build()
  const schemaResult = await db("test_schema").select(
    "migration_number"
  )

  expect(schemaResult.length).toBe(1)
  expect(schemaResult[0].migration_number).toBe(2)
  expect(await db.schema.hasTable("test_table_1")).toBe(true)
  expect(await db.schema.hasTable("test_table_2")).toBe(true)
})

test("Reverts all migrations", async () => {
  await schema.teardown()
  const schemaResult = await db("test_schema").select(
    "migration_number"
  )

  expect(schemaResult.length).toBe(1)
  expect(schemaResult[0].migration_number).toBe(0)
  expect(await db.schema.hasTable("test_table_1")).toBe(false)
  expect(await db.schema.hasTable("test_table_2")).toBe(false)
})
