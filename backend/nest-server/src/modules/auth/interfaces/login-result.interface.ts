import { User } from "src/modules/users/entities/user.entity";

// sessionId is missing and challengeToken is set while the 2fa code is still open
export interface LoginResult {
  user: User;
  sessionId?: string;
  challengeToken?: string;
  hasToChangePassword: boolean;
}
