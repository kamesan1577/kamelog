import * as React from "react";

export interface ProfileCardProps extends React.HTMLAttributes<HTMLDivElement> {
  avatar: React.ReactNode;
  name: string;
  handle: string;
  bio: string;
  link: React.ReactNode;
}

export function ProfileCard({
  avatar,
  name,
  handle,
  bio,
  link,
  className,
  ...props
}: ProfileCardProps) {
  return (
    <div data-ds="profile-card" className={className} {...props}>
      {avatar}
      <h2>{name}</h2>
      <span>{handle}</span>
      <p>{bio}</p>
      {link}
    </div>
  );
}
