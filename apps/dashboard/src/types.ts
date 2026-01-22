export type UserLevel = 'everyone' | 'follower' | 'subscriber' | 'vip' | 'moderator' | 'broadcaster';

export interface Command {
  id: number;
  name: string;
  response: string;
  enabled: boolean;
  cooldown: number;
  userLevel: UserLevel;
  aliases: string[];
  usageCount: number;
}

export interface Timer {
  id: number;
  name: string;
  message: string;
  interval: number;
  minChatLines: number;
  enabled: boolean;
  lastTriggered: string | null;
}

export type AlertLayout = 'above' | 'side' | 'overlay';
export type AlertAnimation = 'fade' | 'slide' | 'bounce' | 'zoom' | 'none';

export interface Alert {
  id: number;
  type: 'follow' | 'subscription' | 'gifted_sub' | 'raid' | 'tip' | 'kick';
  minAmount: number;
  maxAmount: number | null;
  message: string;
  sound: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  duration: number;
  enabled: boolean;
  // Basic styling fields
  layout: AlertLayout;
  animation: AlertAnimation;
  volume: number;
  topTextColor: string;
  bottomTextColor: string;
  font: string;
  textPositionY: number;
  // Custom code fields
  customCodeEnabled: boolean;
  customHtml: string | null;
  customCss: string | null;
  customJs: string | null;
}

export interface Counter {
  id: number;
  name: string;
  value: number;
}

export interface AuthStatus {
  authenticated: boolean;
  tokenLoaded: boolean;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  expiresIn: number;
}
