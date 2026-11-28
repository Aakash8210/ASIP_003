#!/usr/bin/env bash
# ==============================================================================
# AI INTERVIEW INTEGRITY PLATFORM — SHUTDOWN CONTROLLER
# ==============================================================================
# Gracefully stops all services started by the AI Interview Monitoring System:
#   - Frontend Web (Port 5180)
#   - Backend API (Port 3001)
#   - AI Service (Port 8000)
#   - MongoDB (Port 27017 - only if managed by start.sh)
#
# Usage:
#   ./stop.sh
# ==============================================================================

set -o pipefail

# Resolve repository root directory regardless of current working directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PID_DIR="$SCRIPT_DIR/.pids"

# ------------------------------------------------------------------------------
# Terminal styling
# ------------------------------------------------------------------------------
if [ -t 1 ]; then
  BOLD='\033[1m'
  DIM='\033[2m'
  RESET='\033[0m'
  GREEN='\033[0;32m'
  CYAN='\033[0;36m'
  YELLOW='\033[0;33m'
  RED='\033[0;31m'
  BLUE='\033[0;34m'
else
  BOLD=''
  DIM=''
  RESET=''
  GREEN=''
  CYAN=''
  YELLOW=''
  RED=''
  BLUE=''
fi

log_step()    { echo -e "${BOLD}${BLUE}==>${RESET} ${BOLD}$1${RESET}"; }
log_info()    { echo -e "  ${CYAN}[INFO]${RESET}    $1"; }
log_success() { echo -e "  ${GREEN}[OK]${RESET}      $1"; }
log_warn()    { echo -e "  ${YELLOW}[WARN]${RESET}    $1"; }
log_error()   { echo -e "  ${RED}[ERROR]${RESET}   $1"; }

echo ""
echo -e "${BOLD}${CYAN}================================================================${RESET}"
echo -e "${BOLD}${CYAN}   AI INTERVIEW INTEGRITY PLATFORM — SYSTEM SHUTDOWN           ${RESET}"
echo -e "${BOLD}${CYAN}================================================================${RESET}"
echo ""

TOTAL_STOPPED=0

# ------------------------------------------------------------------------------
# Graceful stop helper
# ------------------------------------------------------------------------------
stop_process_by_pid() {
  local svc_name="$1"
  local pid="$2"

  if [ -z "$pid" ]; then
    return 0
  fi

  if ! kill -0 "$pid" 2>/dev/null; then
    return 0
  fi

  log_step "Stopping ${svc_name} (PID ${pid})..."

  # Find child processes
  local children=""
  if command -v pgrep >/dev/null 2>&1; then
    children=$(pgrep -P "$pid" 2>/dev/null || true)
  fi

  # Attempt graceful termination (SIGTERM)
  kill -15 "$pid" 2>/dev/null || true
  if [ -n "$children" ]; then
    for c in $children; do
      kill -15 "$c" 2>/dev/null || true
    done
  fi

  # Wait up to 5 seconds
  local waited=0
  while kill -0 "$pid" 2>/dev/null && [ "$waited" -lt 10 ]; do
    sleep 0.5
    waited=$((waited + 1))
  done

  # Force kill (SIGKILL) if process did not exit
  if kill -0 "$pid" 2>/dev/null; then
    log_warn "${svc_name} (PID ${pid}) did not stop gracefully; sending SIGKILL..."
    kill -9 "$pid" 2>/dev/null || true
    if [ -n "$children" ]; then
      for c in $children; do
        kill -9 "$c" 2>/dev/null || true
      done
    fi
    sleep 0.5
  fi

  if ! kill -0 "$pid" 2>/dev/null; then
    log_success "${svc_name} stopped successfully."
    TOTAL_STOPPED=$((TOTAL_STOPPED + 1))
  else
    log_error "Failed to stop ${svc_name} (PID ${pid})."
  fi
}

# ------------------------------------------------------------------------------
# Service shutdown helper
# ------------------------------------------------------------------------------
stop_service() {
  local svc="$1"
  local port="$2"
  local pid_file="$PID_DIR/${svc}.pid"

  # 1. Terminate PID from PID file if active
  if [ -f "$pid_file" ]; then
    local pid
    pid=$(cat "$pid_file" 2>/dev/null || true)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      stop_process_by_pid "$svc" "$pid"
    fi
    rm -f "$pid_file"
  fi

  # 2. Port fallback: verify port is cleared. If a process from this project is listening, stop it.
  if [ "$svc" != "mongodb" ] && [ -n "$port" ] && command -v lsof >/dev/null 2>&1; then
    local lingering_pids
    lingering_pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
    if [ -n "$lingering_pids" ]; then
      for lp in $lingering_pids; do
        local p_info
        p_info=$(lsof -p "$lp" 2>/dev/null | grep -E "(cwd|txt)" || true)
        if [[ "$p_info" == *"$SCRIPT_DIR"* ]]; then
          log_warn "Lingering process on port ${port} detected (PID ${lp}); terminating..."
          stop_process_by_pid "${svc} (port ${port})" "$lp"
        fi
      done
    fi
  fi
}

# 1. Frontend Web (5180)
stop_service "frontend" 5180

# 2. Backend API (3001)
stop_service "backend" 3001

# 3. AI Service (8000)
stop_service "ai-service" 8000

# 4. MongoDB (27017 - only if managed by start.sh)
if [ -f "$PID_DIR/mongodb.pid" ]; then
  stop_service "mongodb" 27017
else
  log_info "MongoDB is externally managed or system daemon; leaving untouched."
fi

# Clean up any leftover PID files in .pids/
if [ -d "$PID_DIR" ]; then
  find "$PID_DIR" -type f -name "*.pid" -delete 2>/dev/null || true
fi

echo ""
echo -e "${BOLD}${GREEN}================================================================${RESET}"
if [ "$TOTAL_STOPPED" -gt 0 ]; then
  echo -e "${BOLD}${GREEN}   ALL TARGET SERVICES STOPPED CLEANLY (${TOTAL_STOPPED} stopped)            ${RESET}"
else
  echo -e "${BOLD}${GREEN}   ALL SERVICES ARE ALREADY STOPPED                             ${RESET}"
fi
echo -e "${BOLD}${GREEN}================================================================${RESET}"
echo ""
