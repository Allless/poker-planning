import { useState } from "preact/hooks";

interface TopBarProps {
  roomId: string;
  autoReveal: boolean;
  onAutoRevealChange: (on: boolean) => void;
}

export const TopBar = ({ roomId, autoReveal, onAutoRevealChange }: TopBarProps) => {
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
      <label class="toggle">
        <input
          type="checkbox"
          role="switch"
          class="toggle__input"
          checked={autoReveal}
          onChange={(e) => onAutoRevealChange(e.currentTarget.checked)}
        />
        <span class="toggle__track" />
        <span class="toggle__label">Auto-reveal</span>
      </label>
    </div>
  );
};
