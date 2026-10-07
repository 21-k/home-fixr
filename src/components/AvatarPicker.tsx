"use client";

import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import {
  AVATAR_ICON_OPTIONS,
  type AvatarIconKey,
  type AvatarStyle,
} from "@/lib/avatar";

/**
 * Pick your own avatar: initials, an icon from the fixed trade set, or none.
 * Posts `avatar_style` and `avatar_icon` with the Settings form.
 */
export function AvatarPicker({
  username,
  initials,
  defaultStyle,
  defaultIcon,
}: {
  username: string;
  initials: string;
  defaultStyle: AvatarStyle;
  defaultIcon: AvatarIconKey | null;
}) {
  const [style, setStyle] = useState<AvatarStyle>(defaultStyle);
  const [icon, setIcon] = useState<AvatarIconKey>(defaultIcon ?? "wrench");

  const preview = {
    username,
    avatar_initials: initials,
    avatar_style: style,
    avatar_icon: style === "icon" ? icon : null,
  };
  const options: { value: AvatarStyle; label: string }[] = [
    { value: "initials", label: `Initials (${initials})` },
    { value: "icon", label: "An icon" },
    { value: "none", label: "No avatar" },
  ];

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium">Avatar</legend>
      <div className="flex items-center gap-4">
        <Avatar person={preview} size="lg" />
        <div className="flex flex-col gap-1.5">
          {options.map((o) => (
            <label key={o.value} className="flex items-center gap-2.5 text-sm">
              <input
                type="radio"
                name="avatar_style"
                value={o.value}
                checked={style === o.value}
                onChange={() => setStyle(o.value)}
                className="size-4"
              />
              {o.label}
            </label>
          ))}
        </div>
      </div>
      {style === "icon" && (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Avatar icon">
          {AVATAR_ICON_OPTIONS.map((o) => (
            <label
              key={o.key}
              title={o.label}
              className={`cursor-pointer rounded-full p-0.5 ring-2 ${
                icon === o.key ? "ring-brand-500" : "ring-transparent hover:ring-zinc-300"
              }`}
            >
              <input
                type="radio"
                name="avatar_icon"
                value={o.key}
                checked={icon === o.key}
                onChange={() => setIcon(o.key)}
                className="sr-only"
              />
              <Avatar
                person={{ username, avatar_style: "icon", avatar_icon: o.key }}
                size="md"
                label={o.label}
              />
            </label>
          ))}
        </div>
      )}
      <p className="text-[12px] text-zinc-500">
        No photos on Home Fixr: pick initials, a trade icon, or nothing at all.
      </p>
    </fieldset>
  );
}
