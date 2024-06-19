import express, { Request, Response, NextFunction } from "express"
import bodyParser from "body-parser"
import knex from "knex"

import {
  User,
  Group,
  Session,
  requireLogin,
  requireSession,
  requireAnyGroup,
  requireAllGroups,
  requireCondition,
  UserInvalidError,
  UserAuthenticationError,
  SessionInvalidError,
  SessionExpiredError,
  RequestWithIdentity,
  GroupNotAMemberError,
  GroupHasMemberError,
  SessionRenewalError,
} from "../src/index"

const app = express()
app.use(bodyParser.json())

const db = knex({
  client: "mysql2",
  connection: {
    user: "test",
    password: "test",
    host: "127.0.0.1",
    port: 3306,
    database: "users_test",
  },
})

async function init() {
  await User.connect(db)
  await Session.connect(db)
  await Group.connect(db)

  const admin = await User.create("admin")
  await admin.setPassword("password")

  const adminGroup = await Group.create("administrators")
  await adminGroup.addMember(admin)

  const user = await User.create("user")
  await user.setPassword("guest")

  const userGroup = await Group.create("users")
  await userGroup.addMember(user)

  const logGroup = await Group.create("log")
  await logGroup.addMember(user)

  await Group.create("banned")

  console.log("Example users initialized")
}

class BannedError extends Error {}

/* Unauthenticated route */
app.get("/", (req: Request, res: Response) => {
  res.send({
    api: "Identity Example API",
  })
})

/* Start a session */
app.get(
  "/session",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await Session.create({ days: 3 }, { days: 30 })

      res.status(201)
      res.json({
        success: true,
        sessionToken: session.getToken(),
        renewalToken: session.getRenewalToken(),
      })
    } catch (e) {
      next(e)
    }
  }
)

/* Renew a session */
app.put("/session", async (req: Request, res: Response) => {
  const { sessionToken, renewalToken } = req.body

  try {
    const session = await Session.renew(
      sessionToken,
      { days: 3 },
      renewalToken,
      {
        days: 30,
      }
    )

    res.json({
      success: true,
      sessionToken: session.getToken(),
      renewalToken: session.getRenewalToken(),
    })
  } catch (e) {
    if (!(e instanceof SessionRenewalError)) {
      throw e
    }

    res.status(403)
    res.json({
      success: false,
      error: "session-renewal-failed",
    })
  }
})

/* Require session for all routes after this */
app.use(
  "/",
  requireSession({
    responseCallback: (req: Request, res: Response, error: Error) => {
      let responseData = {
        success: false,
        error: "",
      }

      switch (error.constructor) {
        case SessionInvalidError:
          responseData.error = "session-invalid"
          break
        case SessionExpiredError:
          responseData.error = "session-expired"
        default:
          throw error
      }

      res.send(responseData)
    },
  })
)

/* Destroy a session */
app.delete(
  "/session",
  async (
    req: RequestWithIdentity,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const session = req.session as Session
      await session.destroy()
      res.json({ success: true })
    } catch (e) {
      next(e)
    }
  }
)

/* Log in a user */
app.post(
  "/login",
  async (
    req: RequestWithIdentity,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const session = req.session as Session
      const responseData = {
        success: false,
        error: "",
      }
      const { username, password } = req.body

      try {
        const user = await User.get(username)
        await user.login(session, password)
        responseData.success = true
      } catch (e) {
        switch ((e as Error).constructor) {
          case UserInvalidError:
            responseData.error = "username-invalid"
            break
          case UserAuthenticationError:
            responseData.error = "password-invalid"
            break
          default:
            throw e
        }
      }

      res.json(responseData)
    } catch (e) {
      next(e)
    }
  }
)

/* Require login for all routes after this */
app.use(
  "/",
  requireLogin({
    responseCallback: (req: Request, res: Response, error: Error) => {
      let responseData = {
        success: false,
        error: "",
      }

      switch (error.constructor) {
        case UserInvalidError:
        case UserAuthenticationError:
          responseData.error = "user-invalid"
          break
        default:
          throw error
      }

      res.status(403)
      res.send(responseData)
    },
  })
)

/* Require a user to either be an admin or in the 'log' group to create a log message */
app.use(
  "/log",
  requireAnyGroup(["admin", "log"], {
    responseCallback: (
      req: RequestWithIdentity,
      res: Response,
      error: Error
    ) => {
      res.json({ success: false, error: "group-invalid" })
    },
  })
)

/* Let users write a log message */
app.post("/log", (req: RequestWithIdentity, res: Response) => {
  const user = req.user as User
  const username = user.getUsername()
  const { message } = req.body

  console.log(`${username} says: ${message}`)

  res.send({ success: true })
})

/* Require user not to be in 'banned' group for all routes after this */
app.use(
  "/",
  requireCondition(
    (req: RequestWithIdentity) => {
      const user = req.user as User
      const groups = user.listGroups()

      if (groups.includes("banned")) {
        throw new BannedError()
      }
    },
    {
      responseCallback: (
        req: Request,
        res: Response,
        error: Error
      ) => {
        if (!(error instanceof BannedError)) {
          throw error
        }

        res.status(403)
        res.json({
          success: false,
          error: "user-banned",
        })
      },
    }
  )
)

/* Get user profile data */
app.get("/profile", (req: RequestWithIdentity, res: Response) => {
  const user = req.user as User
  const username = user.getUsername()
  const groups = user.listGroups()

  res.json({
    username,
    groups,
  })
})

/* Log out a user */
app.post(
  "/logout",
  async (
    req: RequestWithIdentity,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const session = req.session as Session
      const user = req.user as User
      await user.logout(session)

      res.json({
        success: true,
      })
    } catch (e) {
      next(e)
    }
  }
)

/* Make routes inside /admin require admin privileges */
app.use(
  "/admin",
  requireAllGroups(["administrators"], {
    responseCallback: (req: Request, res: Response, error: Error) => {
      if (!(error instanceof GroupNotAMemberError)) {
        throw error
      }

      res.status(403)
      res.json({
        success: false,
        error: "not-an-admin",
      })
    },
  })
)

/* View any user */
app.get(
  "/admin/get-user",
  async (
    req: RequestWithIdentity,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const admin = req.user as User
      const { username } = req.body
      const user = await User.get(username).catch(() => null)

      if (!user) {
        res.status(404)
        res.json({
          success: false,
          error: "user-invalid",
        })
        return
      }

      res.send({
        success: true,
        userId: user.getId(),
        username: user.getUsername(),
        groups: user.listGroups(),
      })
    } catch (e) {
      next(e)
    }
  }
)

/* Ban a user */
app.post(
  "/admin/ban-user",
  async (
    req: RequestWithIdentity,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { username } = req.body
      const user = await User.get(username).catch(() => null)

      if (!user) {
        res.status(404)
        res.json({
          success: false,
          error: "user-invalid",
        })
        return
      }

      const group = await Group.get("banned")

      try {
        group.addMember(user)
        res.status(201)
      } catch (e) {
        if (!(e instanceof GroupHasMemberError)) {
          throw e
        }
      }

      res.json({
        success: true,
      })
    } catch (e) {
      next(e)
    }
  }
)

/* Unban a user */
app.post(
  "/admin/unban-user",
  async (
    req: RequestWithIdentity,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { username } = req.body
      const user = await User.get(username).catch(() => null)

      if (!user) {
        res.status(404)
        res.json({
          success: false,
          error: "user-invalid",
        })
        return
      }

      const group = await Group.get("banned")

      try {
        group.removeMember(user)
        res.status(201)
      } catch (e) {
        if (!(e instanceof GroupNotAMemberError)) {
          throw e
        }
      }

      res.json({
        success: true,
      })
    } catch (e) {
      next(e)
    }
  }
)

/* Handle unexpected errors */
app.use(
  (err: Error, req: Request, res: Response, next: NextFunction) => {
    res.status(500)
    res.json({
      success: false,
      error: "server-error",
      description: err.stack,
    })
  }
)

/* Initialize App */

init()
const port = 3000
const server = app.listen(port, () => {
  console.log(`Listening on port ${port}`)
})

process.on("SIGINT", async () => {
  console.log()
  console.log("Cleaning up...")

  server.close()
  await User.remove("admin")
  await User.remove("user")
  await Group.remove("administrators")
  await Group.remove("users")
  await Group.remove("banned")
  await Group.remove("log")
  await db.destroy()

  console.log("Exited cleanly")
  process.exit(0)
})
