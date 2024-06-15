import { afterAll, beforeAll, expect, test } from "@jest/globals"
import { Session } from "../src/session"
import { User } from "../src/user"
import {
  requireSession,
  requireLogin,
  RequestWithIdentity,
} from "../src/routes"
import express, { Request, Response } from "express"
import { Server } from "http"
import knex from "knex"

let app: express.Express
let server: Server
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

  await Session.connect(db)
  await User.connect(db)
  const user = await User.create("route-test-user")
  await user.setPassword("test-password")

  app = express()

  app.use("/session-required/", requireSession())
  app.use("/login-required/", requireLogin())

  app.all("/unprotected", (req: Request, res: Response) => {
    res.json({
      status: "ok",
      session: (req as RequestWithIdentity).session,
      user: (req as RequestWithIdentity).user,
    })
  })

  app.all("/session-required", (req: Request, res: Response) => {
    res.json({
      status: "session ok",
      session: (req as RequestWithIdentity).session,
      user: (req as RequestWithIdentity).user,
    })
  })

  app.all("/login-required", (req: Request, res: Response) => {
    res.json({
      status: "user ok",
      session: (req as RequestWithIdentity).session,
      user: (req as RequestWithIdentity).user,
    })
  })

  return await new Promise<void>((resolve) => {
    server = app.listen(3000, () => {
      resolve()
    })
  })
})

afterAll(async () => {
  await User.remove("route-test-user")
  await db.destroy()
  server.close()
})

test("Gets 200 from unprotected route", async () => {
  const response = await fetch("http://127.0.0.1:3000/unprotected")
  const data = await response.json()
  expect(response.status).toBe(200)
  expect(data.status).toBe("ok")
  expect(data.session).toBe(undefined)
  expect(data.user).toBe(undefined)
})

test("Gets 401 from session route", async () => {
  {
    const response = await fetch(
      "http://127.0.0.1:3000/session-required"
    )
    const data = await response.json()
    expect(response.status).toBe(401)
    expect(data.error).toBe(401)
  }
  {
    const response = await fetch(
      "http://127.0.0.1:3000/session-required",
      { headers: { Authorization: "Bearer 123" } }
    )
    const data = await response.json()
    expect(response.status).toBe(401)
    expect(data.error).toBe(401)
  }
  {
    const session = await Session.create({ seconds: -1 })
    const response = await fetch(
      "http://127.0.0.1:3000/session-required",
      {
        headers: { Authorization: `Bearer ${session.getToken()}` },
      }
    )
    const data = await response.json()
    expect(response.status).toBe(401)
    expect(data.error).toBe(401)
    await session.destroy()
  }
})

test("Gets 200 from session route", async () => {
  const session = await Session.create()
  {
    const response = await fetch(
      "http://127.0.0.1:3000/session-required",
      {
        headers: { Authorization: `Bearer ${session.getToken()}` },
      }
    )
    const data = await response.json()
    expect(response.status).toBe(200)
    expect(data.status).toBe("session ok")
    expect(data.session.id).toBe(session.getId())
    expect(data.session.token).toBe(session.getToken())
    expect(data.session.userId).toBe(null)
    expect(data.user).toBe(undefined)
  }
  {
    const user = await User.get("route-test-user")
    await user.login(session, "test-password")
    const response = await fetch(
      "http://127.0.0.1:3000/session-required",
      {
        headers: { Authorization: `Bearer ${session.getToken()}` },
      }
    )
    const data = await response.json()
    expect(response.status).toBe(200)
    expect(data.status).toBe("session ok")
    expect(data.session.id).toBe(session.getId())
    expect(data.session.token).toBe(session.getToken())
    expect(data.session.userId).toBe(user.getId())
    expect(data.user).toBe(undefined)
  }
  await session.destroy()
})

test("Gets 403 from user route", async () => {
  const session = await Session.create()
  {
    const response = await fetch(
      "http://127.0.0.1:3000/login-required"
    )
    const data = await response.json()
    expect(response.status).toBe(403)
    expect(data.error).toBe(403)
  }
  {
    const response = await fetch(
      "http://127.0.0.1:3000/login-required",
      {
        headers: { Authorization: `Bearer abc` },
      }
    )
    const data = await response.json()
    expect(response.status).toBe(403)
    expect(data.error).toBe(403)
  }
  {
    const response = await fetch(
      "http://127.0.0.1:3000/login-required",
      {
        headers: { Authorization: `Bearer ${session.getToken()}` },
      }
    )
    const data = await response.json()
    expect(response.status).toBe(403)
    expect(data.error).toBe(403)
  }
  {
    const user = await User.get("route-test-user")
    const expiredSession = await Session.create({ seconds: -1 })
    user.login(expiredSession, "test-password")
    const response = await fetch(
      "http://127.0.0.1:3000/login-required",
      {
        headers: {
          Authorization: `Bearer ${expiredSession.getToken()}`,
        },
      }
    )
    const data = await response.json()
    expect(response.status).toBe(403)
    expect(data.error).toBe(403)
  }
  await session.destroy()
})

test("Gets 200 from user route", async () => {
  const session = await Session.create()
  const user = await User.get("route-test-user")
  await user.login(session, "test-password")
  const response = await fetch(
    "http://127.0.0.1:3000/login-required",
    {
      headers: { Authorization: `Bearer ${session.getToken()}` },
    }
  )
  const data = await response.json()
  expect(response.status).toBe(200)
  expect(data.status).toBe("user ok")
  expect(data.session.id).toBe(session.getId())
  expect(data.session.token).toBe(session.getToken())
  expect(data.session.userId).toBe(user.getId())
  expect(data.user.id).toBe(user.getId())
  expect(data.user.username).toBe(user.getUsername())
  expect(data.user.authenticated).toBe(user.isAuthenticated())
  await session.destroy()
})
