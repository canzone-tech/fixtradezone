export enum CaptchaPurpose {
  LOGIN = 'LOGIN',
  REGISTRATION = 'REGISTRATION',
}

export type CaptchaChallengeResponse =
  | {
      enabled: false;
      purpose: CaptchaPurpose;
    }
  | {
      enabled: true;
      purpose: CaptchaPurpose;
      challengeId: string;
      imageDataUri: string;
      expiresIn: number;
    };
