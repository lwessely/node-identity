import {
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express"
import { Session, SessionInvalidError } from "./session"
import {
  User,
  UserAuthenticationError,
  UserInvalidError,
} from "./user"

export interface RequireGuardOptions {
  responseCode?: number
  responseData?: { [key: string]: any } | string | Buffer
  headers?: { [key: string]: string }
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
    const userOptions = {
      responseCode: 401,
      responseData: {
        error: options.responseCode ?? 401,
        description: "Invalid or missing session token.",
      },
      headers: { "Content-type": "application/json" },
    }
    Object.assign(userOptions, options)

    try {
      const session = await getSessionFromRequest(req)
      ;(req as RequestWithIdentity).session = session
      next()
    } catch (e) {
      if (!(e instanceof SessionInvalidError)) {
        throw e
      }
      const { responseCode, responseData, headers } = userOptions
      res.status(responseCode)
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
    const userOptions = {
      responseCode: 403,
      responseData: {
        error: options.responseCode ?? 403,
        description: "You are not logged in.",
      },
      headers: { "Content-type": "application/json" },
    }
    Object.assign(userOptions, options)

    let session: Session | undefined
    try {
      session = await getSessionFromRequest(req)
    } catch (e) {
      if (!(e instanceof SessionInvalidError)) {
        throw e
      }
      const { responseCode, responseData, headers } = userOptions
      res.status(responseCode)
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
      if (
        !(
          e instanceof UserInvalidError ||
          e instanceof UserAuthenticationError
        )
      ) {
        throw e
      }
      const { responseCode, responseData, headers } = userOptions
      res.status(responseCode)
      res.set(headers)
      res.send(responseData)
    }
  }
}
