import { afterAll, beforeAll, expect, test } from "@jest/globals"
import {
  Session,
  SessionExpiredError,
  SessionInvalidError,
} from "../src/session"
import {
  User,
  UserAuthenticationError,
  UserInvalidError,
} from "../src/user"
import {
  requireSession,
  requireLogin,
  RequestWithIdentity,
  requireAnyGroup,
  requireCondition,
  requireAllGroups,
} from "../src/routes"
import { Group } from "../src/group"
import express, { NextFunction, Request, Response } from "express"
import { Server } from "http"
import knex from "knex"
import bodyParser from "body-parser"

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

  await User.connect(db)
  await Session.connect(db)
  await Group.connect(db)
  const user = await User.create("route-test-user")
  await user.setPassword("test-password")

  app = express()

  app.use(bodyParser.json())

  app.use("/session-required", requireSession())

  app.use(
    "/session-required-custom-response",
    requireSession({
      responseCode: 418,
      headers: {
        "Content-type": "text/plain; charset=utf-8",
      },
      responseData: "Bad session!",
    })
  )

  app.use(
    "/session-required-custom-callback",
    requireSession({
      responseCallback: (
        req: Request,
        res: Response,
        error: Error
      ) => {
        res.status(418)
        if (error instanceof SessionInvalidError) {
          res.json({ error: "session invalid" })
          return
        } else if (error instanceof SessionExpiredError) {
          res.json({ error: "session expired" })
          return
        }
        throw error
      },
    })
  )

  app.use("/login-required", requireLogin())

  app.use(
    "/login-required-custom-response",
    requireLogin({
      responseCode: 418,
      headers: {
        "Content-type": "text/plain; charset=utf-8",
      },
      responseData: "Bad user!",
    })
  )

  app.use(
    "/login-required-custom-callback",
    requireLogin({
      responseCallback: (
        req: Request,
        res: Response,
        error: Error
      ) => {
        res.status(418)
        if (error instanceof SessionInvalidError) {
          res.json({ error: "session invalid" })
          return
        } else if (error instanceof SessionExpiredError) {
          res.json({ error: "session expired" })
          return
        } else if (error instanceof UserAuthenticationError) {
          res.json({ error: "user authentication error" })
          return
        } else if (error instanceof UserInvalidError) {
          res.json({ error: "user invalid error" })
          return
        }
        throw error
      },
    })
  )

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

  app.all(
    "/session-required-custom-response",
    (req: Request, res: Response) => {
      res.json({
        status: "session ok",
        session: (req as RequestWithIdentity).session,
        user: (req as RequestWithIdentity).user,
      })
    }
  )

  app.all(
    "/session-required-custom-callback",
    (req: Request, res: Response) => {
      res.json({
        status: "session ok",
        session: (req as RequestWithIdentity).session,
        user: (req as RequestWithIdentity).user,
      })
    }
  )

  app.all("/login-required", (req: Request, res: Response) => {
    res.json({
      status: "user ok",
      session: (req as RequestWithIdentity).session,
      user: (req as RequestWithIdentity).user,
    })
  })

  app.all(
    "/login-required-custom-response",
    (req: Request, res: Response) => {
      res.json({
        status: "user ok",
        session: (req as RequestWithIdentity).session,
        user: (req as RequestWithIdentity).user,
      })
    }
  )

  app.all(
    "/login-required-custom-callback",
    (req: Request, res: Response) => {
      res.json({
        status: "user ok",
        session: (req as RequestWithIdentity).session,
        user: (req as RequestWithIdentity).user,
      })
    }
  )

  app.use(
    "/session-required-extend-lifetime",
    requireSession({
      update: { lifetime: { years: 1 }, renewalPeriod: { years: 3 } },
    })
  )

  app.all(
    "/session-required-extend-lifetime",
    (req: Request, res: Response) => {
      res.send()
    }
  )

  app.use(
    "/login-required-extend-lifetime",
    requireLogin({
      update: { lifetime: { years: 1 }, renewalPeriod: { years: 3 } },
    })
  )

  app.all(
    "/login-required-extend-lifetime",
    (req: Request, res: Response) => {
      res.send()
    }
  )

  app.use(
    "/session-required-throw",
    requireSession({
      responseCallback: (
        req: Request,
        res: Response,
        error: Error
      ) => {
        throw new Error(
          "This is an intentional error from the callback, to test error handling."
        )
      },
    })
  )

  app.use(
    "/session-required-throw-async",
    requireSession({
      responseCallback: async (
        req: Request,
        res: Response,
        error: Error
      ) => {
        await new Promise((resolve, reject) => {
          setTimeout(() => {
            reject(
              new Error(
                "This is an intentional error from the callback, to test error handling."
              )
            )
          }, 1)
        })
      },
    })
  )

  app.use(
    "/login-required-throw",
    requireLogin({
      responseCallback: (
        req: Request,
        res: Response,
        error: Error
      ) => {
        throw new Error(
          "This is an intentional error from the callback, to test error handling."
        )
      },
    })
  )

  app.use(
    "/login-required-throw-async",
    requireLogin({
      responseCallback: async (
        req: Request,
        res: Response,
        error: Error
      ) => {
        await new Promise((resolve, reject) => {
          setTimeout(() => {
            reject(
              new Error(
                "This is an intentional error from the callback, to test error handling."
              )
            )
          }, 1)
        })
      },
    })
  )

  app.use(
    "/require-any-group",
    requireAnyGroup(["required-1", "required-2"], {
      responseCallback: (
        req: Request,
        res: Response,
        error: Error
      ) => {
        const data = req.body
        if (data?.throw) {
          throw new Error(
            "This is an intentional error from the callback, to test error handling."
          )
        }
        res.status(418)
        res.json({})
      },
    })
  )

  app.all(
    "/require-any-group",
    (req: RequestWithIdentity, res: Response) => {
      const { session, user } = req
      res.status(200)
      res.json({ session, user })
    }
  )

  app.use(
    "/require-all-groups",
    requireAllGroups(["required-1", "required-2"], {
      responseCallback: (
        req: Request,
        res: Response,
        error: Error
      ) => {
        const data = req.body
        if (data?.throw) {
          throw new Error(
            "This is an intentional error from the callback, to test error handling."
          )
        }
        res.status(418)
        res.json({})
      },
    })
  )

  app.all(
    "/require-all-groups",
    (req: RequestWithIdentity, res: Response) => {
      const { session, user } = req
      res.status(200)
      res.json({ session, user })
    }
  )

  app.use(
    "/require-condition",
    requireCondition((req: Request, res: Response) => {
      const data = req.body

      if (data?.throw) {
        throw new Error(
          "This is an intentional error from the callback, to test error handling."
        )
      }

      if (data.authorize !== true) {
        throw new UserAuthenticationError("Custom condition not met!")
      }
    })
  )

  app.all(
    "/require-condition",
    (req: RequestWithIdentity, res: Response) => {
      const { session, user } = req
      res.status(200)
      res.json({ session, user })
    }
  )

  app.use(
    "/require-any-group-extend-lifetime",
    requireAnyGroup(["required-1", "required-2"], {
      update: { lifetime: { years: 1 }, renewalPeriod: { years: 3 } },
    })
  )

  app.all(
    "/require-any-group-extend-lifetime",
    (req: Request, res: Response) => {
      res.send()
    }
  )

  app.use(
    "/require-all-groups-extend-lifetime",
    requireAllGroups(["required-1", "required-2"], {
      update: { lifetime: { years: 1 }, renewalPeriod: { years: 3 } },
    })
  )

  app.all(
    "/require-all-groups-extend-lifetime",
    (req: Request, res: Response) => {
      res.send()
    }
  )

  app.use(
    "/require-condition-extend-lifetime",
    requireCondition(
      (req: Request, res: Response) => {
        throw new UserAuthenticationError(
          "This error is intended to be thrown."
        )
      },
      {
        update: {
          lifetime: { years: 1 },
          renewalPeriod: { years: 3 },
        },
      }
    )
  )

  app.all(
    "/require-condition-extend-lifetime",
    (req: Request, res: Response) => {
      res.send()
    }
  )

  app.use(
    (err: Error, req: Request, res: Response, next: NextFunction) => {
      res.status(500)
      res.json({ error: err.message })
    }
  )

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

test("Gets 418 from session route with custom options", async () => {
  {
    const response = await fetch(
      "http://127.0.0.1:3000/session-required-custom-response"
    )
    const data = await response.text()
    expect(response.status).toBe(418)
    expect(response.headers.get("Content-type")).toBe(
      "text/plain; charset=utf-8"
    )
    expect(data).toBe("Bad session!")
  }
  {
    const response = await fetch(
      "http://127.0.0.1:3000/session-required-custom-response",
      { headers: { Authorization: "Bearer 123" } }
    )
    const data = await response.text()
    expect(response.status).toBe(418)
    expect(response.headers.get("Content-type")).toBe(
      "text/plain; charset=utf-8"
    )
    expect(data).toBe("Bad session!")
  }
  {
    const session = await Session.create({ seconds: -1 })
    const response = await fetch(
      "http://127.0.0.1:3000/session-required-custom-response",
      {
        headers: { Authorization: `Bearer ${session.getToken()}` },
      }
    )
    const data = await response.text()
    expect(response.status).toBe(418)
    expect(response.headers.get("Content-type")).toBe(
      "text/plain; charset=utf-8"
    )
    expect(data).toBe("Bad session!")
    await session.destroy()
  }
})

test("Gets 418 from session route with custom callback", async () => {
  {
    const response = await fetch(
      "http://127.0.0.1:3000/session-required-custom-callback"
    )
    const data = await response.json()
    expect(response.status).toBe(418)
    expect(data.error).toBe("session invalid")
  }
  {
    const response = await fetch(
      "http://127.0.0.1:3000/session-required-custom-callback",
      { headers: { Authorization: "Bearer 123" } }
    )
    const data = await response.json()
    expect(response.status).toBe(418)
    expect(data.error).toBe("session invalid")
  }
  {
    const session = await Session.create({ seconds: -1 })
    const response = await fetch(
      "http://127.0.0.1:3000/session-required-custom-callback",
      {
        headers: { Authorization: `Bearer ${session.getToken()}` },
      }
    )
    const data = await response.json()
    expect(response.status).toBe(418)
    expect(data.error).toBe("session expired")
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
    const response = await fetch(
      "http://127.0.0.1:3000/session-required-custom-response",
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
    const response = await fetch(
      "http://127.0.0.1:3000/session-required-custom-callback",
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
  {
    const user = await User.get("route-test-user")
    await user.login(session, "test-password")
    const response = await fetch(
      "http://127.0.0.1:3000/session-required-custom-response",
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
  {
    const user = await User.get("route-test-user")
    await user.login(session, "test-password")
    const response = await fetch(
      "http://127.0.0.1:3000/session-required-custom-callback",
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
    await expiredSession.destroy()
  }
  await session.destroy()
})

test("Gets 403 from user route with custom response", async () => {
  const session = await Session.create()
  {
    const response = await fetch(
      "http://127.0.0.1:3000/login-required-custom-response"
    )
    const data = await response.text()
    expect(response.status).toBe(418)
    expect(response.headers.get("Content-type")).toBe(
      "text/plain; charset=utf-8"
    )
    expect(data).toBe("Bad user!")
  }
  {
    const response = await fetch(
      "http://127.0.0.1:3000/login-required-custom-response",
      {
        headers: { Authorization: `Bearer abc` },
      }
    )
    const data = await response.text()
    expect(response.status).toBe(418)
    expect(response.headers.get("Content-type")).toBe(
      "text/plain; charset=utf-8"
    )
    expect(data).toBe("Bad user!")
  }
  {
    const response = await fetch(
      "http://127.0.0.1:3000/login-required-custom-response",
      {
        headers: { Authorization: `Bearer ${session.getToken()}` },
      }
    )
    const data = await response.text()
    expect(response.status).toBe(418)
    expect(response.headers.get("Content-type")).toBe(
      "text/plain; charset=utf-8"
    )
    expect(data).toBe("Bad user!")
  }
  {
    const user = await User.get("route-test-user")
    const expiredSession = await Session.create({ seconds: -1 })
    user.login(expiredSession, "test-password")
    const response = await fetch(
      "http://127.0.0.1:3000/login-required-custom-response",
      {
        headers: {
          Authorization: `Bearer ${expiredSession.getToken()}`,
        },
      }
    )
    const data = await response.text()
    expect(response.status).toBe(418)
    expect(response.headers.get("Content-type")).toBe(
      "text/plain; charset=utf-8"
    )
    expect(data).toBe("Bad user!")
    await expiredSession.destroy()
  }
  await session.destroy()
})

test("Gets 403 from user route with custom callback", async () => {
  const session = await Session.create()
  {
    const response = await fetch(
      "http://127.0.0.1:3000/login-required-custom-callback"
    )
    const data = await response.json()
    expect(response.status).toBe(418)
    expect(data.error).toBe("session invalid")
  }
  {
    const response = await fetch(
      "http://127.0.0.1:3000/login-required-custom-callback",
      {
        headers: { Authorization: `Bearer abc` },
      }
    )
    const data = await response.json()
    expect(response.status).toBe(418)
    expect(data.error).toBe("session invalid")
  }
  {
    const response = await fetch(
      "http://127.0.0.1:3000/login-required-custom-callback",
      {
        headers: { Authorization: `Bearer ${session.getToken()}` },
      }
    )
    const data = await response.json()
    expect(response.status).toBe(418)
    expect(data.error).toBe("user authentication error")
  }
  {
    const user = await User.get("route-test-user")
    const expiredSession = await Session.create({ seconds: -1 })
    user.login(expiredSession, "test-password")
    const response = await fetch(
      "http://127.0.0.1:3000/login-required-custom-callback",
      {
        headers: {
          Authorization: `Bearer ${expiredSession.getToken()}`,
        },
      }
    )
    const data = await response.json()
    expect(response.status).toBe(418)
    expect(data.error).toBe("session expired")
    await expiredSession.destroy()
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

test("Extends valid session for session route", async () => {
  const session = await Session.create({ hours: 1 }, { hours: 3 })

  {
    const expectedExpirationDate = new Date(
      new Date().getTime() + 60 * 60 * 1000
    )
    const expectedRenewabelUntilDate = new Date(
      expectedExpirationDate.getTime() + 3 * 60 * 60 * 1000
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
      expectedRenewabelUntilDate.getTime() -
        (renewableUntilDate?.getTime() as number)
    ).toBeLessThan(1000)
    expect(
      expectedRenewabelUntilDate.getTime() -
        (renewableUntilDate?.getTime() as number)
    ).toBeGreaterThanOrEqual(0)
  }
  {
    const response = await fetch(
      "http://127.0.0.1:3000/session-required-extend-lifetime",
      { headers: { Authorization: `Bearer ${session.getToken()}` } }
    )
    const expectedExpirationDate = new Date(
      new Date().getTime() + 365 * 24 * 60 * 60 * 1000
    )
    const expectedRenewabelUntilDate = new Date(
      expectedExpirationDate.getTime() + 3 * 365 * 24 * 60 * 60 * 1000
    )
    expect(response.status).toBe(200)
    const sessionCopy = await Session.open(session.getToken())
    const expirationDate = sessionCopy.getExpirationDate()
    expect(
      expectedExpirationDate.getTime() -
        (expirationDate?.getTime() as number)
    ).toBeLessThan(5000)
    expect(
      expectedExpirationDate.getTime() -
        (expirationDate?.getTime() as number)
    ).toBeGreaterThanOrEqual(0)
    const renewableUntilDate = sessionCopy.getRenewableUntilDate()
    expect(
      expectedRenewabelUntilDate.getTime() -
        (renewableUntilDate?.getTime() as number)
    ).toBeLessThan(5000)
    expect(
      expectedRenewabelUntilDate.getTime() -
        (renewableUntilDate?.getTime() as number)
    ).toBeGreaterThanOrEqual(0)
  }

  await session.destroy()
})

test("Extends valid session for user route", async () => {
  const session = await Session.create({ hours: 1 }, { hours: 3 })

  {
    const expectedExpirationDate = new Date(
      new Date().getTime() + 60 * 60 * 1000
    )
    const expectedRenewabelUntilDate = new Date(
      expectedExpirationDate.getTime() + 3 * 60 * 60 * 1000
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
      expectedRenewabelUntilDate.getTime() -
        (renewableUntilDate?.getTime() as number)
    ).toBeLessThan(1000)
    expect(
      expectedRenewabelUntilDate.getTime() -
        (renewableUntilDate?.getTime() as number)
    ).toBeGreaterThanOrEqual(0)
  }
  {
    const response = await fetch(
      "http://127.0.0.1:3000/login-required-extend-lifetime",
      { headers: { Authorization: `Bearer ${session.getToken()}` } }
    )
    const expectedExpirationDate = new Date(
      new Date().getTime() + 365 * 24 * 60 * 60 * 1000
    )
    const expectedRenewableUntilDate = new Date(
      expectedExpirationDate.getTime() + 3 * 365 * 24 * 60 * 60 * 1000
    )
    expect(response.status).toBe(403)
    const sessionCopy = await Session.open(session.getToken())
    const expirationDate = sessionCopy.getExpirationDate()
    expect(
      expectedExpirationDate.getTime() -
        (expirationDate?.getTime() as number)
    ).toBeLessThan(5000)
    expect(
      expectedExpirationDate.getTime() -
        (expirationDate?.getTime() as number)
    ).toBeGreaterThanOrEqual(0)
    const renewableUntilDate = sessionCopy.getRenewableUntilDate()
    expect(
      expectedRenewableUntilDate.getTime() -
        (renewableUntilDate?.getTime() as number)
    ).toBeLessThan(5000)
    expect(
      expectedRenewableUntilDate.getTime() -
        (renewableUntilDate?.getTime() as number)
    ).toBeGreaterThanOrEqual(0)
  }

  await session.updateLifetime({ hours: 1 }, { hours: 3 })
  const user = await User.get("route-test-user")
  await user.login(session, "test-password")

  {
    const expectedExpirationDate = new Date(
      new Date().getTime() + 60 * 60 * 1000
    )
    const expectedRenewabelUntilDate = new Date(
      expectedExpirationDate.getTime() + 3 * 60 * 60 * 1000
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
      expectedRenewabelUntilDate.getTime() -
        (renewableUntilDate?.getTime() as number)
    ).toBeLessThan(1000)
    expect(
      expectedRenewabelUntilDate.getTime() -
        (renewableUntilDate?.getTime() as number)
    ).toBeGreaterThanOrEqual(0)
  }
  {
    const response = await fetch(
      "http://127.0.0.1:3000/login-required-extend-lifetime",
      { headers: { Authorization: `Bearer ${session.getToken()}` } }
    )
    const expectedExpirationDate = new Date(
      new Date().getTime() + 365 * 24 * 60 * 60 * 1000
    )
    const expectedRenewableUntilDate = new Date(
      expectedExpirationDate.getTime() + 3 * 365 * 24 * 60 * 60 * 1000
    )
    expect(response.status).toBe(200)
    const sessionCopy = await Session.open(session.getToken())
    const expirationDate = sessionCopy.getExpirationDate()
    expect(
      expectedExpirationDate.getTime() -
        (expirationDate?.getTime() as number)
    ).toBeLessThan(5000)
    expect(
      expectedExpirationDate.getTime() -
        (expirationDate?.getTime() as number)
    ).toBeGreaterThanOrEqual(0)
    const renewableUntilDate = sessionCopy.getRenewableUntilDate()
    expect(
      expectedRenewableUntilDate.getTime() -
        (renewableUntilDate?.getTime() as number)
    ).toBeLessThan(5000)
    expect(
      expectedRenewableUntilDate.getTime() -
        (renewableUntilDate?.getTime() as number)
    ).toBeGreaterThanOrEqual(0)
  }

  await session.destroy()
})

test("Gets 418 from route requiring any group", async () => {
  {
    const response = await fetch(
      "http://127.0.0.1:3000/require-any-group"
    )
    expect(response.status).toBe(418)
  }
  {
    const user = await User.get("route-test-user")
    await user.setPassword("123")
    const group1 = await Group.create("not-required-1")
    const group2 = await Group.create("not-required-2")

    await group1.addMember(user)
    await group2.addMember(user)

    const session = await Session.create()
    await user.login(session, "123")

    const response = await fetch(
      "http://127.0.0.1:3000/require-any-group",
      { headers: { Authorization: `Bearer ${session.getToken()}` } }
    )
    expect(response.status).toBe(418)

    const sessionCopy = await Session.open(session.getToken())
    expect(
      (sessionCopy.getExpirationDate()?.getTime() as number) / 1000
    ).toBe(
      Math.floor(
        (session.getExpirationDate()?.getTime() as number) / 1000
      )
    )

    await Group.remove("not-required-1")
    await Group.remove("not-required-2")
    await session.destroy()
  }
})

test("Gets 200 from route requiring any group", async () => {
  const user = await User.get("route-test-user")
  await user.setPassword("123")
  const group1 = await Group.create("required-2")
  const group2 = await Group.create("not-required-1")

  await group1.addMember(user)
  await group2.addMember(user)

  const session = await Session.create()
  await user.login(session, "123")

  {
    const response = await fetch(
      "http://127.0.0.1:3000/require-any-group",
      { headers: { Authorization: `Bearer ${session.getToken()}` } }
    )
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.session.id).toBe(session.getId())
    expect(data.user.id).toBe(user.getId())

    const sessionCopy = await Session.open(session.getToken())
    expect(
      (sessionCopy.getExpirationDate()?.getTime() as number) / 1000
    ).toBe(
      Math.floor(
        (session.getExpirationDate()?.getTime() as number) / 1000
      )
    )
  }

  const group3 = await Group.create("required-1")
  group3.addMember(user)

  {
    const response = await fetch(
      "http://127.0.0.1:3000/require-any-group",
      { headers: { Authorization: `Bearer ${session.getToken()}` } }
    )
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.session.id).toBe(session.getId())
    expect(data.user.id).toBe(user.getId())

    const sessionCopy = await Session.open(session.getToken())
    expect(
      (sessionCopy.getExpirationDate()?.getTime() as number) / 1000
    ).toBe(
      Math.floor(
        (session.getExpirationDate()?.getTime() as number) / 1000
      )
    )
  }

  await Group.remove("required-1")
  await Group.remove("required-2")
  await Group.remove("not-required-1")
  await session.destroy()
})

test("Gets 418 from route requiring all groups", async () => {
  {
    const response = await fetch(
      "http://127.0.0.1:3000/require-all-groups"
    )
    expect(response.status).toBe(418)
  }
  {
    const user = await User.get("route-test-user")
    await user.setPassword("123")
    const group1 = await Group.create("required-1")
    const group2 = await Group.create("not-required-2")

    await group1.addMember(user)
    await group2.addMember(user)

    const session = await Session.create()
    await user.login(session, "123")

    const response = await fetch(
      "http://127.0.0.1:3000/require-all-groups",
      { headers: { Authorization: `Bearer ${session.getToken()}` } }
    )
    expect(response.status).toBe(418)

    const sessionCopy = await Session.open(session.getToken())
    expect(
      (sessionCopy.getExpirationDate()?.getTime() as number) / 1000
    ).toBe(
      Math.floor(
        (session.getExpirationDate()?.getTime() as number) / 1000
      )
    )

    await Group.remove("required-1")
    await Group.remove("not-required-2")
    await session.destroy()
  }
})

test("Gets 200 from route requiring all groups", async () => {
  {
    const user = await User.get("route-test-user")
    await user.setPassword("123")
    const group1 = await Group.create("required-1")
    const group2 = await Group.create("not-required-2")
    const group3 = await Group.create("required-2")

    await group1.addMember(user)
    await group2.addMember(user)
    await group3.addMember(user)

    const session = await Session.create()
    await user.login(session, "123")

    const response = await fetch(
      "http://127.0.0.1:3000/require-all-groups",
      { headers: { Authorization: `Bearer ${session.getToken()}` } }
    )
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.session.id).toBe(session.getId())
    expect(data.user.id).toBe(user.getId())

    const sessionCopy = await Session.open(session.getToken())
    expect(
      (sessionCopy.getExpirationDate()?.getTime() as number) / 1000
    ).toBe(
      Math.floor(
        (session.getExpirationDate()?.getTime() as number) / 1000
      )
    )

    await Group.remove("required-1")
    await Group.remove("not-required-2")
    await Group.remove("required-2")
    await session.destroy()
  }
})

test("Gets 403 from route requiring condition", async () => {
  {
    const user = await User.get("route-test-user")
    await user.setPassword("123")
    const group1 = await Group.create("required-1")
    const group2 = await Group.create("not-required-2")

    await group1.addMember(user)
    await group2.addMember(user)

    const session = await Session.create()
    await user.login(session, "123")

    const response = await fetch(
      "http://127.0.0.1:3000/require-condition",
      {
        method: "POST",
        body: JSON.stringify({ authorize: false }),
        headers: {
          Authorization: `Bearer ${session.getToken()}`,
          "Content-type": "application/json",
        },
      }
    )
    expect(response.status).toBe(403)

    const sessionCopy = await Session.open(session.getToken())
    expect(
      (sessionCopy.getExpirationDate()?.getTime() as number) / 1000
    ).toBe(
      Math.floor(
        (session.getExpirationDate()?.getTime() as number) / 1000
      )
    )

    await Group.remove("required-1")
    await Group.remove("not-required-2")
    await session.destroy()
  }
})

test("Gets 200 from route requiring condition", async () => {
  {
    const user = await User.get("route-test-user")
    await user.setPassword("123")
    const group1 = await Group.create("required-1")
    const group2 = await Group.create("not-required-2")

    await group1.addMember(user)
    await group2.addMember(user)

    const session = await Session.create()
    await user.login(session, "123")

    const response = await fetch(
      "http://127.0.0.1:3000/require-condition",
      {
        method: "POST",
        body: JSON.stringify({ authorize: true }),
        headers: {
          Authorization: `Bearer ${session.getToken()}`,
          "Content-type": "application/json",
        },
      }
    )
    expect(response.status).toBe(200)

    const sessionCopy = await Session.open(session.getToken())
    expect(
      (sessionCopy.getExpirationDate()?.getTime() as number) / 1000
    ).toBe(
      Math.floor(
        (session.getExpirationDate()?.getTime() as number) / 1000
      )
    )

    const data = await response.json()
    expect(data.session.id).toBe(session.getId())
    expect(data.user.id).toBe(user.getId())

    await Group.remove("required-1")
    await Group.remove("not-required-2")
    await session.destroy()
  }
})

test("Route requiring any group correctly extends session", async () => {
  const session = await Session.create({ hours: 1 }, { hours: 3 })
  const expectedExpirationDate = new Date(
    new Date().getTime() + 60 * 60 * 1000
  )
  const expectedRenewableUntilDate = new Date(
    expectedExpirationDate.getTime() + 3 * 60 * 60 * 1000
  )
  const expirationDate = session.getExpirationDate() as Date
  const renewableUntilDate = session.getRenewableUntilDate() as Date
  expect(
    expectedExpirationDate.getTime() - expirationDate.getTime()
  ).toBeLessThan(500)
  expect(
    expectedExpirationDate.getTime() - expirationDate.getTime()
  ).toBeGreaterThanOrEqual(0)
  expect(
    expectedRenewableUntilDate.getTime() -
      renewableUntilDate.getTime()
  ).toBeLessThan(500)
  expect(
    expectedRenewableUntilDate.getTime() -
      renewableUntilDate.getTime()
  ).toBeGreaterThanOrEqual(0)

  const response = await fetch(
    "http://127.0.0.1:3000/require-any-group-extend-lifetime",
    {
      headers: { Authorization: `Bearer ${session.getToken()}` },
    }
  )
  const newExpectedExpirationDate = new Date(
    new Date().getTime() + 365 * 24 * 60 * 60 * 1000
  )
  const newExpectedRenewabelUntilDate = new Date(
    newExpectedExpirationDate.getTime() +
      3 * 365 * 24 * 60 * 60 * 1000
  )

  expect(response.status).toBe(403)

  const sessionCopy = await Session.open(session.getToken())
  const newExpirationDate = sessionCopy.getExpirationDate() as Date
  const newRenewableUntilDate =
    sessionCopy.getRenewableUntilDate() as Date

  expect(
    newExpectedExpirationDate.getTime() - newExpirationDate.getTime()
  ).toBeLessThan(1000)
  expect(
    newExpectedExpirationDate.getTime() - newExpirationDate.getTime()
  ).toBeGreaterThanOrEqual(0)
  expect(
    newExpectedRenewabelUntilDate.getTime() -
      newRenewableUntilDate.getTime()
  ).toBeLessThan(1000)
  expect(
    newExpectedRenewabelUntilDate.getTime() -
      newRenewableUntilDate.getTime()
  ).toBeGreaterThanOrEqual(0)

  await session.destroy()
})

test("Route requiring all groups correctly extends session", async () => {
  const session = await Session.create({ hours: 1 }, { hours: 3 })
  const expectedExpirationDate = new Date(
    new Date().getTime() + 60 * 60 * 1000
  )
  const expectedRenewableUntilDate = new Date(
    expectedExpirationDate.getTime() + 3 * 60 * 60 * 1000
  )
  const expirationDate = session.getExpirationDate() as Date
  const renewableUntilDate = session.getRenewableUntilDate() as Date
  expect(
    expectedExpirationDate.getTime() - expirationDate.getTime()
  ).toBeLessThan(500)
  expect(
    expectedExpirationDate.getTime() - expirationDate.getTime()
  ).toBeGreaterThanOrEqual(0)
  expect(
    expectedRenewableUntilDate.getTime() -
      renewableUntilDate.getTime()
  ).toBeLessThan(500)
  expect(
    expectedRenewableUntilDate.getTime() -
      renewableUntilDate.getTime()
  ).toBeGreaterThanOrEqual(0)

  const response = await fetch(
    "http://127.0.0.1:3000/require-all-groups-extend-lifetime",
    {
      headers: { Authorization: `Bearer ${session.getToken()}` },
    }
  )
  const newExpectedExpirationDate = new Date(
    new Date().getTime() + 365 * 24 * 60 * 60 * 1000
  )
  const newExpectedRenewabelUntilDate = new Date(
    newExpectedExpirationDate.getTime() +
      3 * 365 * 24 * 60 * 60 * 1000
  )

  expect(response.status).toBe(403)

  const sessionCopy = await Session.open(session.getToken())
  const newExpirationDate = sessionCopy.getExpirationDate() as Date
  const newRenewableUntilDate =
    sessionCopy.getRenewableUntilDate() as Date

  expect(
    newExpectedExpirationDate.getTime() - newExpirationDate.getTime()
  ).toBeLessThan(1000)
  expect(
    newExpectedExpirationDate.getTime() - newExpirationDate.getTime()
  ).toBeGreaterThanOrEqual(0)
  expect(
    newExpectedRenewabelUntilDate.getTime() -
      newRenewableUntilDate.getTime()
  ).toBeLessThan(1000)
  expect(
    newExpectedRenewabelUntilDate.getTime() -
      newRenewableUntilDate.getTime()
  ).toBeGreaterThanOrEqual(0)

  await session.destroy()
})

test("Route requiring condition correctly extends session", async () => {
  const session = await Session.create({ hours: 1 }, { hours: 3 })
  const expectedExpirationDate = new Date(
    new Date().getTime() + 60 * 60 * 1000
  )
  const expectedRenewableUntilDate = new Date(
    expectedExpirationDate.getTime() + 3 * 60 * 60 * 1000
  )
  const expirationDate = session.getExpirationDate() as Date
  const renewableUntilDate = session.getRenewableUntilDate() as Date
  expect(
    expectedExpirationDate.getTime() - expirationDate.getTime()
  ).toBeLessThan(500)
  expect(
    expectedExpirationDate.getTime() - expirationDate.getTime()
  ).toBeGreaterThanOrEqual(0)
  expect(
    expectedRenewableUntilDate.getTime() -
      renewableUntilDate.getTime()
  ).toBeLessThan(500)
  expect(
    expectedRenewableUntilDate.getTime() -
      renewableUntilDate.getTime()
  ).toBeGreaterThanOrEqual(0)

  const response = await fetch(
    "http://127.0.0.1:3000/require-condition-extend-lifetime",
    {
      headers: { Authorization: `Bearer ${session.getToken()}` },
    }
  )
  const newExpectedExpirationDate = new Date(
    new Date().getTime() + 365 * 24 * 60 * 60 * 1000
  )
  const newExpectedRenewabelUntilDate = new Date(
    newExpectedExpirationDate.getTime() +
      3 * 365 * 24 * 60 * 60 * 1000
  )

  expect(response.status).toBe(403)

  const sessionCopy = await Session.open(session.getToken())
  const newExpirationDate = sessionCopy.getExpirationDate() as Date
  const newRenewableUntilDate =
    sessionCopy.getRenewableUntilDate() as Date

  expect(
    newExpectedExpirationDate.getTime() - newExpirationDate.getTime()
  ).toBeLessThan(1000)
  expect(
    newExpectedExpirationDate.getTime() - newExpirationDate.getTime()
  ).toBeGreaterThanOrEqual(0)
  expect(
    newExpectedRenewabelUntilDate.getTime() -
      newRenewableUntilDate.getTime()
  ).toBeLessThan(1000)
  expect(
    newExpectedRenewabelUntilDate.getTime() -
      newRenewableUntilDate.getTime()
  ).toBeGreaterThanOrEqual(0)

  await session.destroy()
})

test("Handles throws in route callback correctly", async () => {
  {
    const response = await fetch(
      "http://127.0.0.1:3000/session-required-throw"
    )
    const data = await response.json()
    expect(response.status).toBe(500)
    expect(data.error).toBe(
      "This is an intentional error from the callback, to test error handling."
    )
  }
  {
    const response = await fetch(
      "http://127.0.0.1:3000/session-required-throw-async"
    )
    const data = await response.json()
    expect(response.status).toBe(500)
    expect(data.error).toBe(
      "This is an intentional error from the callback, to test error handling."
    )
  }
  {
    const response = await fetch(
      "http://127.0.0.1:3000/login-required-throw"
    )
    const data = await response.json()
    expect(response.status).toBe(500)
    expect(data.error).toBe(
      "This is an intentional error from the callback, to test error handling."
    )
  }
  {
    const response = await fetch(
      "http://127.0.0.1:3000/login-required-throw-async"
    )
    const data = await response.json()
    expect(response.status).toBe(500)
    expect(data.error).toBe(
      "This is an intentional error from the callback, to test error handling."
    )
  }
  {
    const response = await fetch(
      "http://127.0.0.1:3000/require-any-group",
      {
        method: "POST",
        headers: {
          "Content-type": "application/json",
        },
        body: JSON.stringify({ throw: true }),
      }
    )
    const data = await response.json()
    expect(response.status).toBe(500)
    expect(data.error).toBe(
      "This is an intentional error from the callback, to test error handling."
    )
  }
  {
    const response = await fetch(
      "http://127.0.0.1:3000/require-all-groups",
      {
        method: "POST",
        headers: {
          "Content-type": "application/json",
        },
        body: JSON.stringify({ throw: true }),
      }
    )
    const data = await response.json()
    expect(response.status).toBe(500)
    expect(data.error).toBe(
      "This is an intentional error from the callback, to test error handling."
    )
  }
  {
    const response = await fetch(
      "http://127.0.0.1:3000/require-condition",
      {
        method: "POST",
        headers: {
          "Content-type": "application/json",
        },
        body: JSON.stringify({ throw: true }),
      }
    )
    const data = await response.json()
    expect(response.status).toBe(500)
    expect(data.error).toBe(
      "This is an intentional error from the callback, to test error handling."
    )
  }
})
