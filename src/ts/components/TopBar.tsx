import { useState } from "preact/hooks";
import type { ConnectionStatus } from "../lib/mqtt-provider";

interface TopBarProps {
  roomId: string;
  autoReveal: boolean;
  status: ConnectionStatus;
  onAutoRevealChange: (on: boolean) => void;
  onReconnect: () => void;
}

interface ConnState {
  label: string;
  modifier: "online" | "pending" | "offline";
}

const connState = (status: ConnectionStatus): ConnState => {
  switch (status.type) {
    case "connected":
      return { label: "Connected", modifier: "online" };
    case "reconnecting":
      return { label: "Connecting…", modifier: "pending" };
    default:
      return { label: "Offline", modifier: "offline" };
  }
};

export const TopBar = ({
  roomId,
  autoReveal,
  status,
  onAutoRevealChange,
  onReconnect,
}: TopBarProps) => {
  const [copied, setCopied] = useState(false);
  const conn = connState(status);

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
      <div class="top-bar__right">
        <div class={`conn conn--${conn.modifier}`}>
          <span class="conn__dot" />
          <span class="conn__label">{conn.label}</span>
        </div>
        <button
          class="btn btn--small"
          onClick={onReconnect}
          disabled={status.type === "connected"}
        >
          Reconnect
        </button>
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
    </div>
  );
};
