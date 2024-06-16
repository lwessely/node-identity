import {
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express"
import {
  Session,
  SessionExpiredError,
  SessionInvalidError,
  Lifetime,
} from "./session"
import {
  User,
  UserAuthenticationError,
  UserInvalidError,
} from "./user"

export interface RequireGuardOptions {
  responseCode?: number
  responseData?: { [key: string]: any } | string | Buffer
  headers?: { [key: string]: string }
  responseCallback?: (
    req: Request,
    res: Response,
    error: Error
  ) => Promise<void> | void
  updateLifetime?: Lifetime
}

export interface RequestWithIdentity extends Request {
  user?: User
  session?: Session
}

export async function getSessionFromRequest(
  req: Request
): Promise<Session> {
  const authorization = req.get("Authorization") ?? ""
  const [authType, authToken] = authorization?.split(" ")

  if (authType !== "Bearer") {
    throw new SessionInvalidError(
      `Invalid authorization type '${authType}'.`
    )
  }

  if (authToken === undefined) {
    throw new SessionInvalidError("Missing session token.")
  }

  return await Session.open(authToken)
}

export function requireSession(
  options: RequireGuardOptions = {}
): RequestHandler {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const userOptions: RequireGuardOptions = {
      responseCode: 401,
      responseData: {
        error: options.responseCode ?? 401,
        description:
          "Invalid or missing session toke, or session has expired.",
      },
      headers: { "Content-type": "application/json" },
    }
    Object.assign(userOptions, options)

    try {
      const session = await getSessionFromRequest(req)
      ;(req as RequestWithIdentity).session = session
      if (userOptions.updateLifetime) {
        await session.updateLifetime(userOptions.updateLifetime)
      }
      next()
    } catch (e) {
      const { responseCallback } = userOptions

      if (responseCallback) {
        const result = responseCallback(req, res, e as Error)
        if (result instanceof Promise) {
          await result
        }
        return
      }

      if (
        !(
          e instanceof SessionInvalidError ||
          e instanceof SessionExpiredError
        )
      ) {
        throw e
      }

      const { responseCode, responseData, headers } = userOptions
      res.status(responseCode as number)
      res.set(headers)
      res.send(responseData)
    }
  }
}

export function requireLogin(
  options: RequireGuardOptions = {}
): RequestHandler {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const userOptions: RequireGuardOptions = {
      responseCode: 403,
      responseData: {
        error: options.responseCode ?? 403,
        description: "You are not logged in.",
      },
      headers: { "Content-type": "application/json" },
    }
    Object.assign(userOptions, options)
    const { responseCallback } = userOptions

    let session: Session | undefined
    try {
      session = await getSessionFromRequest(req)
      if (userOptions.updateLifetime) {
        await session.updateLifetime(userOptions.updateLifetime)
      }
    } catch (e) {
      if (responseCallback) {
        const result = responseCallback(req, res, e as Error)
        if (result instanceof Promise) {
          await result
        }
        return
      }

      if (
        !(
          e instanceof SessionInvalidError ||
          e instanceof SessionExpiredError
        )
      ) {
        throw e
      }
      const { responseCode, responseData, headers } = userOptions
      res.status(responseCode as number)
      res.set(headers)
      res.send(responseData)
      return
    }

    try {
      const user = await User.fromSession(session as Session)
      ;(req as RequestWithIdentity).session = session
      ;(req as RequestWithIdentity).user = user
      next()
    } catch (e) {
      if (responseCallback) {
        const result = responseCallback(req, res, e as Error)
        if (result instanceof Promise) {
          await result
        }
        return
      }

      if (
        !(
          e instanceof UserInvalidError ||
          e instanceof UserAuthenticationError
        )
      ) {
        throw e
      }

      const { responseCode, responseData, headers } = userOptions
      res.status(responseCode as number)
      res.set(headers)
      res.send(responseData)
    }
  }
}
