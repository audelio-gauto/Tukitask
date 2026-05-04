"use client";
import React from "react";

type IconName =
  | "arrow-up"
  | "bell"
  | "bolt"
  | "briefcase"
  | "camera"
  | "calendar"
  | "car"
  | "chat"
  | "check"
  | "clipboard"
  | "clock"
  | "credit-card"
  | "device-mobile"
  | "document"
  | "exclamation"
  | "eye"
  | "eye-off"
  | "flag"
  | "home"
  | "lock"
  | "mail"
  | "map"
  | "map-pin"
  | "money"
  | "moon"
  | "package"
  | "paper-clip"
  | "shopping-cart"
  | "pencil"
  | "plus"
  | "refresh"
  | "settings"
  | "shield"
  | "star"
  | "sun"
  | "tag"
  | "tool"
  | "trash"
  | "trophy"
  | "truck"
  | "user"
  | "x";

const icons: Record<IconName, React.ReactNode> = {
  "arrow-up": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0 6 6m-6-6-6 6" />
  ),
  "bell": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6.002 6.002 0 0 0-4-5.659V5a2 2 0 1 0-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" />
  ),
  "bolt": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
  ),
  "briefcase": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 6V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1m-10 0h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
  ),
  "camera": (
    <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 0 1 2-2h.93a2 2 0 0 0 1.664-.89l.812-1.22A2 2 0 0 1 10.07 4h3.86a2 2 0 0 1 1.664.89l.812 1.22A2 2 0 0 0 18.07 7H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></>
  ),
  "calendar": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3M4 11h16M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z" />
  ),
  "car": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 13l2-5h14l2 5m-1 0v5a1 1 0 0 1-1 1h-1a2 2 0 0 1-4 0H10a2 2 0 0 1-4 0H5a1 1 0 0 1-1-1v-5m1 0h14" />
  ),
  "chat": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h6m7-2a9 9 0 1 1-4.5-7.8L21 3v6h-6" />
  ),
  "check": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m5 13 4 4L19 7" />
  ),
  "clipboard": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5h6m-6 4h6m-6 4h6M7 5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1m-2-2h-4a2 2 0 0 0-2 2v0" />
  ),
  "clock": (
    <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2" /><circle cx="12" cy="12" r="9" /></>
  ),
  "credit-card": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8h18M7 16h1m4 0h1m-7 4h12a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3Z" />
  ),
  "device-mobile": (
    <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 17h.01" /></>
  ),
  "document": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 3h6l4 4v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
  ),
  "exclamation": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
  ),
  "eye": (
    <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.46 12C3.73 7.94 7.52 5 12 5s8.27 2.94 9.54 7c-1.27 4.06-5.06 7-9.54 7s-8.27-2.94-9.54-7Z" /><circle cx="12" cy="12" r="3" /></>
  ),
  "eye-off": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m3 3 18 18M10.58 10.58A3 3 0 0 0 12 15a3 3 0 0 0 2.42-4.42M9.88 5.08A9.96 9.96 0 0 1 12 5c4.48 0 8.27 2.94 9.54 7a10.2 10.2 0 0 1-4.16 5.02M6.11 6.11A9.98 9.98 0 0 0 2.46 12c.78 2.48 2.54 4.6 4.89 5.86" />
  ),
  "flag": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 21V4m0 0h10l-1 4h7l-1 5H4" />
  ),
  "home": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0 7-7 7 7M5 10v10a1 1 0 0 0 1 1h3m10-11 2 2m-2-2v10a1 1 0 0 1-1 1h-3m-6 0a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1m-6 0h6" />
  ),
  "lock": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11V7a5 5 0 0 1 10 0v4m-12 0h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z" />
  ),
  "mail": (
    <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7l9 6 9-6v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 7l-9 6-9-6" /></>
  ),
  "map": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20 5 18V6l4 2 6-2 4 2v12l-4-2-6 2Z" />
  ),
  "map-pin": (
    <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" /><circle cx="12" cy="9" r="2.5" /></>
  ),
  "money": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v20m5-17H9.5a3.5 3.5 0 0 0 0 7H15a3.5 3.5 0 0 1 0 7H7" />
  ),
  "moon": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8Z" />
  ),
  "package": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  ),
  "paper-clip": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12.5 12.5 21a5 5 0 0 1-7.07-7.07L14 5.36a3.5 3.5 0 0 1 4.95 4.95L10.38 18.9a2 2 0 0 1-2.83-2.83L15 8.6" />
  ),
  "pencil": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m16.86 3.487 3.653 3.653M7 21h4l9-9a2 2 0 0 0 0-2.828L15.828 5.172a2 2 0 0 0-2.828 0l-9 9V21Z" />
  ),
  "plus": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" />
  ),
  "refresh": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v6h6M20 20v-6h-6M20 8a8 8 0 0 0-14.9-3M4 16a8 8 0 0 0 14.9 3" />
  ),
  "settings": (
    <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></>
  ),
  "shield": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3 5 6v6c0 5 3.5 8.5 7 9 3.5-.5 7-4 7-9V6l-7-3Z" />
  ),
  "star": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m12 3 3 6 6 .9-4.5 4.4 1 6.2L12 17l-5.5 3.5 1-6.2L3 9.9 9 9l3-6Z" />
  ),
  "sun": (
    <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v2m0 14v2m9-9h-2M5 12H3m14.95 6.95-1.41-1.41M8.46 8.46 7.05 7.05m10.9 0-1.41 1.41M8.46 15.54 7.05 16.95" /><circle cx="12" cy="12" r="4" /></>
  ),
  "tag": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M3 7a4 4 0 0 1 4-4h5l9 9-7 7-9-9V7Z" />
  ),
  "tool": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.7 9.3a6 6 0 1 0-5.4 10.4l4.6-4.6 3.6 1.8 1.8-3.6-4.6-4.6z" />
  ),
  "trash": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6h18M8 6V4h8v2m-7 4v8m6-8v8M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
  ),
  "trophy": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4h10v3a5 5 0 0 1-10 0V4Zm-2 0h2v3a3 3 0 0 1-3-3V4Zm12 0h2v0a3 3 0 0 1-3 3V4ZM9 21h6m-5-4h4" />
  ),
  "truck": (
    <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h11v10H3z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4l3 3v4h-7" /><circle cx="7" cy="19" r="2" /><circle cx="17" cy="19" r="2" /></>
  ),
  "user": (
    <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>
  ),
  "shopping-cart": (
    <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6h18M16 10a4 4 0 0 1-8 0" /></>
  ),
  "x": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
  ),
};

export function Icon({
  name,
  size = 18,
  className,
  color,
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  color?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || "currentColor"}
      className={className}
      style={{ display: "inline-block", verticalAlign: "-2px", ...style }}
    >
      {icons[name]}
    </svg>
  );
}

export type { IconName };
