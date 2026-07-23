#!/usr/bin/env bash
# Start CLIProxyAPI (if not already running) and then the app dev server, so local
# development on a ChatGPT/Codex subscription is a single command: `npm run dev:local`.
#
# The proxy dir/port can be overridden:
#   CLIPROXY_DIR=~/cliproxyapi CLIPROXY_PORT=8317 npm run dev:local
set -euo pipefail

CLIPROXY_DIR="${CLIPROXY_DIR:-$HOME/cliproxyapi}"
CLIPROXY_PORT="${CLIPROXY_PORT:-8317}"
CLIPROXY_BIN="$CLIPROXY_DIR/cli-proxy-api"
CLIPROXY_CONFIG="$CLIPROXY_DIR/config.yaml"
CLIPROXY_LOG="$CLIPROXY_DIR/cli-proxy-api.log"

started_proxy=0

port_is_open() {
  # Returns 0 if something is listening on the proxy port.
  (exec 3<>"/dev/tcp/127.0.0.1/$CLIPROXY_PORT") 2>/dev/null && exec 3>&- && return 0
  return 1
}

cleanup() {
  # Only stop the proxy if this script started it.
  if [ "$started_proxy" = "1" ] && [ -n "${proxy_pid:-}" ]; then
    echo "Stopping CLIProxyAPI (pid $proxy_pid)..."
    kill "$proxy_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if port_is_open; then
  echo "CLIProxyAPI already running on port $CLIPROXY_PORT — reusing it."
else
  if [ ! -x "$CLIPROXY_BIN" ]; then
    echo "ERROR: CLIProxyAPI binary not found at $CLIPROXY_BIN" >&2
    echo "       Set CLIPROXY_DIR, or install per README/.env.example." >&2
    exit 1
  fi
  echo "Starting CLIProxyAPI on port $CLIPROXY_PORT (logs: $CLIPROXY_LOG)..."
  ( cd "$CLIPROXY_DIR" && "$CLIPROXY_BIN" --config "$CLIPROXY_CONFIG" ) >"$CLIPROXY_LOG" 2>&1 &
  proxy_pid=$!
  started_proxy=1

  # Wait up to ~15s for the port to come up.
  for _ in $(seq 1 30); do
    if port_is_open; then break; fi
    if ! kill -0 "$proxy_pid" 2>/dev/null; then
      echo "ERROR: CLIProxyAPI exited during startup. Last log lines:" >&2
      tail -n 20 "$CLIPROXY_LOG" >&2 || true
      exit 1
    fi
    sleep 0.5
  done
  if ! port_is_open; then
    echo "ERROR: CLIProxyAPI did not open port $CLIPROXY_PORT in time. See $CLIPROXY_LOG" >&2
    exit 1
  fi
  echo "CLIProxyAPI is up. (If AI calls 401, run once: cd $CLIPROXY_DIR && ./cli-proxy-api --config config.yaml --codex-login)"
fi

echo "Starting app dev server..."
exec npm run dev
