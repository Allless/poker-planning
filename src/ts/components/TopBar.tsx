import { useState } from "preact/hooks";

interface TopBarProps {
  roomId: string;
}

export const TopBar = ({ roomId }: TopBarProps) => {
  const [copied, setCopied] = useState(false);

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div class="top-bar">
      <div class="top-bar__room">
        <span class="top-bar__label">Room</span>
        <code class="top-bar__id">{roomId}</code>
        <button class="btn btn--small" onClick={copyLink}>
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>
    </div>
  );
};
