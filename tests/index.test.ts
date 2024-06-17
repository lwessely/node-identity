import { expect, test } from "@jest/globals"
import * as identity from "../src/index"
import {
  User,
  UserAuthenticationError,
  UserExistsError,
  UserInvalidError,
  UserProgramError,
} from "../src/user"
import {
  Session,
  SessionInvalidError,
  SessionProgramError,
  SessionExpiredError,
  SessionRenewalError,
} from "../src/session"
import {
  Group,
  GroupExistsError,
  GroupHasMemberError,
  GroupInvalidError,
  GroupProgramError,
} from "../src/group"
import * as routes from "../src/routes"

test("Exports members correctly", () => {
  expect(identity.User).toBe(User)
  expect(identity.UserAuthenticationError).toBe(
    UserAuthenticationError
  )
  expect(identity.UserExistsError).toBe(UserExistsError)
  expect(identity.UserInvalidError).toBe(UserInvalidError)
  expect(identity.UserProgramError).toBe(UserProgramError)
  expect(identity.Session).toBe(Session)
  expect(identity.SessionInvalidError).toBe(SessionInvalidError)
  expect(identity.SessionProgramError).toBe(SessionProgramError)
  expect(identity.SessionExpiredError).toBe(SessionExpiredError)
  expect(identity.SessionRenewalError).toBe(SessionRenewalError)
  expect(identity.getSessionFromRequest).toBe(
    routes.getSessionFromRequest
  )
  expect(identity.requireSession).toBe(routes.requireSession)
  expect(identity.requireLogin).toBe(routes.requireLogin)
  expect(identity.Group).toBe(Group)
  expect(identity.GroupExistsError).toBe(GroupExistsError)
  expect(identity.GroupHasMemberError).toBe(GroupHasMemberError)
  expect(identity.GroupInvalidError).toBe(GroupInvalidError)
  expect(identity.GroupProgramError).toBe(GroupProgramError)
})
