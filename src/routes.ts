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
import { GroupNotAMemberError } from "./group"
import { Identity } from "./identity"

export interface RequireGuardOptions {
  responseCode?: number
  responseData?: { [key: string]: any } | string | Buffer
  headers?: { [key: string]: string }
  responseCallback?: (
    req: Request,
    res: Response,
    error: Error
  ) => Promise<void> | void
  update?: {
    lifetime: Lifetime
    renewalPeriod: Lifetime
  }
}

export interface RequestWithIdentity extends Request {
  user?: User
  session?: Session
}

export type AccessCheckCallback = (
  req: Request,
  res: Response
) => Promise<void> | void

export async function getSessionFromRequest(
  req: Request,
  identity: Identity
): Promise<Session> {
  const openSession = (req as RequestWithIdentity).session
  if (openSession instanceof Session) {
    return openSession
  }

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

  return await identity.session.open(authToken)
}

export async function getUserFromRequest(
  req: Request,
  identity: Identity,
  cachedSession?: Session
): Promise<User> {
  const activeUser = (req as RequestWithIdentity).user
  if (activeUser instanceof User) {
    return activeUser
  }

  const session =
    cachedSession ?? (await getSessionFromRequest(req, identity))
  return await identity.user.fromSession(session)
}

async function sendErrorResponse(
  req: Request,
  res: Response,
  error: Error,
  options: RequireGuardOptions
) {
  const { responseCallback } = options

  if (responseCallback) {
    const result = responseCallback(req, res, error)
    if (result instanceof Promise) {
      await result
    }
    return
  }

  if (
    !(
      error instanceof SessionInvalidError ||
      error instanceof SessionExpiredError ||
      error instanceof UserInvalidError ||
      error instanceof UserAuthenticationError ||
      error instanceof GroupNotAMemberError
    )
  ) {
    throw error
  }

  const { responseCode, responseData, headers } = options
  res.status(responseCode as number)
  res.set(headers)
  res.send(responseData)
}

export function requireSession(
  identity: Identity,
  options: RequireGuardOptions = {}
): RequestHandler {
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

  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const session = await getSessionFromRequest(
        req,
        identity
      ).catch((e) => e)

      if (!(session instanceof Session)) {
        await sendErrorResponse(req, res, session, userOptions)
        return
      }

      if (userOptions.update) {
        await session.updateLifetime(
          userOptions.update.lifetime,
          userOptions.update.renewalPeriod
        )
      }

      ;(req as RequestWithIdentity).session = session

      next()
    } catch (e) {
      next(e)
    }
  }
}

export function requireLogin(
  identity: Identity,
  options: RequireGuardOptions = {}
): RequestHandler {
  const userOptions: RequireGuardOptions = {
    responseCode: 403,
    responseData: {
      error: options.responseCode ?? 403,
      description: "You are not logged in.",
    },
    headers: { "Content-type": "application/json" },
  }
  Object.assign(userOptions, options)

  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const session = await getSessionFromRequest(
        req,
        identity
      ).catch((e) => e)

      if (!(session instanceof Session)) {
        await sendErrorResponse(req, res, session, userOptions)
        return
      }

      if (userOptions.update) {
        await session.updateLifetime(
          userOptions.update.lifetime,
          userOptions.update.renewalPeriod
        )
      }

      const user = await getUserFromRequest(
        req,
        identity,
        session
      ).catch((e) => e)

      if (!(user instanceof User)) {
        await sendErrorResponse(req, res, user, userOptions)
        return
      }

      ;(req as RequestWithIdentity).session = session
      ;(req as RequestWithIdentity).user = user
      next()
    } catch (e) {
      next(e)
    }
  }
}

export function requireAnyGroup(
  identity: Identity,
  groups: string[],
  options: RequireGuardOptions = {}
) {
  const userOptions: RequireGuardOptions = {
    responseCode: 403,
    responseData: {
      error: options.responseCode ?? 403,
      description: "You are not a member of the right group.",
    },
    headers: { "Content-type": "application/json" },
  }
  Object.assign(userOptions, options)

  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const session = await getSessionFromRequest(
        req,
        identity
      ).catch((e) => e)

      if (!(session instanceof Session)) {
        await sendErrorResponse(req, res, session, userOptions)
        return
      }

      if (userOptions.update) {
        await session.updateLifetime(
          userOptions.update.lifetime,
          userOptions.update.renewalPeriod
        )
      }

      const user = await getUserFromRequest(
        req,
        identity,
        session
      ).catch((e) => e)

      if (!(user instanceof User)) {
        await sendErrorResponse(req, res, user, userOptions)
        return
      }

      const userGroups = new Set(user.listGroups())
      let userIsAuthorized = false

      for (const allowedGroup of groups) {
        if (userGroups.has(allowedGroup)) {
          userIsAuthorized = true
          break
        }
      }

      if (!userIsAuthorized) {
        await sendErrorResponse(
          req,
          res,
          new GroupNotAMemberError(
            `Failed to authorize user '${user.getUsername()}': Not a member of any of the allowed groups ${JSON.stringify(
              groups
            )}`
          ),
          userOptions
        )
        return
      }

      ;(req as RequestWithIdentity).session = session
      ;(req as RequestWithIdentity).user = user
      next()
    } catch (e) {
      next(e)
    }
  }
}

export function requireAllGroups(
  identity: Identity,
  groups: string[],
  options: RequireGuardOptions = {}
) {
  const userOptions: RequireGuardOptions = {
    responseCode: 403,
    responseData: {
      error: options.responseCode ?? 403,
      description: "You are not a member of the right groups.",
    },
    headers: { "Content-type": "application/json" },
  }
  Object.assign(userOptions, options)

  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const session = await getSessionFromRequest(
        req,
        identity
      ).catch((e) => e)

      if (!(session instanceof Session)) {
        await sendErrorResponse(req, res, session, userOptions)
        return
      }

      if (userOptions.update) {
        await session.updateLifetime(
          userOptions.update.lifetime,
          userOptions.update.renewalPeriod
        )
      }

      const user = await getUserFromRequest(
        req,
        identity,
        session
      ).catch((e) => e)

      if (!(user instanceof User)) {
        await sendErrorResponse(req, res, user, userOptions)
        return
      }

      const userGroups = user.listGroups()
      const userIsAuthorized = groups.every((item) =>
        userGroups.includes(item)
      )

      if (!userIsAuthorized) {
        await sendErrorResponse(
          req,
          res,
          new GroupNotAMemberError(
            `Failed to authorize user '${user.getUsername()}': Not a member of all the required groups ${JSON.stringify(
              groups
            )}`
          ),
          userOptions
        )
        return
      }

      ;(req as RequestWithIdentity).session = session
      ;(req as RequestWithIdentity).user = user
      next()
    } catch (e) {
      next(e)
    }
  }
}

export function requireCondition(
  identity: Identity,
  accessCheckCallback: AccessCheckCallback,
  options: RequireGuardOptions = {}
) {
  const userOptions: RequireGuardOptions = {
    responseCode: 403,
    responseData: {
      error: options.responseCode ?? 403,
      description:
        "You do not satisfy the condition for authorization.",
    },
    headers: { "Content-type": "application/json" },
  }
  Object.assign(userOptions, options)

  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const session = await getSessionFromRequest(
        req,
        identity
      ).catch((e) => e)

      if (session instanceof Session) {
        ;(req as RequestWithIdentity).session = session
        if (userOptions.update) {
          await session.updateLifetime(
            userOptions.update.lifetime,
            userOptions.update.renewalPeriod
          )
        }
      }

      const user = await getUserFromRequest(
        req,
        identity,
        session
      ).catch((e) => e)

      if (user instanceof User) {
        ;(req as RequestWithIdentity).user = user
      }

      try {
        let authorizationResult = accessCheckCallback(req, res)
        if (authorizationResult instanceof Promise) {
          authorizationResult = await authorizationResult
        }
      } catch (e) {
        await sendErrorResponse(req, res, e as Error, userOptions)
        return
      }

      next()
    } catch (e) {
      next(e)
    }
  }
}
