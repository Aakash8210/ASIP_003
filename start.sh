#!/usr/bin/env bash
# ==============================================================================
# AI INTERVIEW INTEGRITY PLATFORM — STARTUP CONTROLLER
# ==============================================================================
# Starts all services required for the AI Interview Monitoring System:
#   1. MongoDB (Port 27017 - checks existing or launches daemon)
#   2. AI Service (Port 8000 - FastAPI / Uvicorn with Face Detection)
#   3. Backend API (Port 3001 - Node.js Express / Socket.io)
#   4. Frontend Web (Port 5180 - Vite Dev Server)
#
# Usage:
#   ./start.sh
# ==============================================================================

set -o pipefail

# Resolve repository root directory regardless of current working directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PID_DIR="$SCRIPT_DIR/.pids"
LOG_DIR="$SCRIPT_DIR/.logs"

mkdir -p "$PID_DIR" "$LOG_DIR"

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

# ------------------------------------------------------------------------------
# Rollback trap: clean up services started in THIS execution if an error occurs
# ------------------------------------------------------------------------------
STARTED_SERVICES=()

cleanup_on_failure() {
  local exit_code=$?
  if [ $exit_code -ne 0 ] && [ ${#STARTED_SERVICES[@]} -gt 0 ]; then
    echo ""
    log_error "Startup failed (exit code ${exit_code}). Rolling back services started during this run..."
    for svc in "${STARTED_SERVICES[@]}"; do
      local pid_file="$PID_DIR/${svc}.pid"
      if [ -f "$pid_file" ]; then
        local pid
        pid=$(cat "$pid_file" 2>/dev/null || true)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
          log_warn "Stopping ${svc} (PID ${pid})..."
          kill -15 "$pid" 2>/dev/null || true
          local waited=0
          while kill -0 "$pid" 2>/dev/null && [ "$waited" -lt 6 ]; do
            sleep 0.5
            waited=$((waited + 1))
          done
          if kill -0 "$pid" 2>/dev/null; then
            kill -9 "$pid" 2>/dev/null || true
          fi
        fi
        rm -f "$pid_file"
      fi
    done
    echo ""
    log_error "Rollback complete. Check log files in .logs/ for error details."
  fi
  exit $exit_code
}

trap cleanup_on_failure EXIT INT TERM

# ------------------------------------------------------------------------------
# Helper functions
# ------------------------------------------------------------------------------
is_port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$port" -sTCP:LISTEN -n -P >/dev/null 2>&1
    return $?
  fi
  (echo > "/dev/tcp/127.0.0.1/$port") >/dev/null 2>&1
  return $?
}

is_service_running() {
  local name="$1"
  local pid_file="$PID_DIR/${name}.pid"
  if [ -f "$pid_file" ]; then
    local pid
    pid=$(cat "$pid_file" 2>/dev/null || true)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      echo "$pid"
      return 0
    fi
    # Stale PID file
    rm -f "$pid_file"
  fi
  return 1
}

# Spawns a true detached background daemon with setsid (independent session, immune to SIGHUP)
spawn_daemon() {
  local working_dir="$1"
  local log_file="$2"
  shift 2
  local cmd=("$@")

  python3 -c "
import subprocess, sys, os
log = open('$log_file', 'a')
p = subprocess.Popen(
    sys.argv[1:],
    cwd='$working_dir',
    stdin=subprocess.DEVNULL,
    stdout=log,
    stderr=subprocess.STDOUT,
    start_new_session=True
)
print(p.pid)
" "${cmd[@]}"
}

# ------------------------------------------------------------------------------
# Banner
# ------------------------------------------------------------------------------
echo ""
echo -e "${BOLD}${CYAN}================================================================${RESET}"
echo -e "${BOLD}${CYAN}   AI INTERVIEW INTEGRITY PLATFORM — SYSTEM INITIALIZATION     ${RESET}"
echo -e "${BOLD}${CYAN}================================================================${RESET}"
echo ""

# ------------------------------------------------------------------------------
# Pre-flight environment and dependency verification
# ------------------------------------------------------------------------------
log_step "Performing pre-flight checks..."

# 1. Check Node.js
if ! command -v node >/dev/null 2>&1; then
  log_error "Node.js is not installed or not in PATH."
  exit 1
fi
NODE_VERSION=$(node -v | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'.' -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  log_error "Node.js version 18+ required. Current version: v${NODE_VERSION}"
  exit 1
fi
log_success "Node.js v${NODE_VERSION} detected."

# 2. Check Python for AI Service
PYTHON_BIN=""
if [ -x "$SCRIPT_DIR/ai-service/venv/bin/python" ]; then
  PYTHON_BIN="$SCRIPT_DIR/ai-service/venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="$(command -v python3)"
else
  log_error "Python 3 is not found in ai-service/venv or PATH."
  exit 1
fi

if ! "$PYTHON_BIN" -c "import uvicorn, fastapi" >/dev/null 2>&1; then
  log_error "Required Python packages (uvicorn, fastapi) not found in ${PYTHON_BIN}."
  exit 1
fi
PY_VERSION=$("$PYTHON_BIN" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')")
log_success "Python ${PY_VERSION} verified (${PYTHON_BIN})."

# 3. Check environment configuration files
if [ ! -f "$SCRIPT_DIR/backend/.env" ]; then
  if [ -f "$SCRIPT_DIR/backend/.env.example" ]; then
    cp "$SCRIPT_DIR/backend/.env.example" "$SCRIPT_DIR/backend/.env"
    log_warn "Created backend/.env from .env.example (please verify settings)."
  else
    log_error "backend/.env is missing and no .env.example was found."
    exit 1
  fi
else
  log_success "backend/.env present."
fi

if [ ! -f "$SCRIPT_DIR/ai-service/.env" ]; then
  if [ -f "$SCRIPT_DIR/ai-service/.env.example" ]; then
    cp "$SCRIPT_DIR/ai-service/.env.example" "$SCRIPT_DIR/ai-service/.env"
    log_warn "Created ai-service/.env from .env.example."
  fi
else
  log_success "ai-service/.env present."
fi

# 4. Check dependencies in backend & frontend
if [ ! -d "$SCRIPT_DIR/backend/node_modules" ]; then
  log_error "backend/node_modules not found. Run 'npm --prefix backend install' first."
  exit 1
fi
if [ ! -d "$SCRIPT_DIR/frontend/node_modules" ]; then
  log_error "frontend/node_modules not found. Run 'npm --prefix frontend install' first."
  exit 1
fi
log_success "Node modules verified for backend and frontend."

# 5. Check AI Service detection model
MODEL_FILE="$SCRIPT_DIR/ai-service/models/face_detection_yunet_2023mar.onnx"
if [ ! -f "$MODEL_FILE" ]; then
  log_warn "AI model face_detection_yunet_2023mar.onnx not found at expected path."
else
  log_success "AI detection model verified (${MODEL_FILE##*/})."
fi

echo ""

# ------------------------------------------------------------------------------
# 1. MongoDB Service (Port 27017)
# ------------------------------------------------------------------------------
log_step "Checking Database (MongoDB on port 27017)..."

if is_port_in_use 27017; then
  log_success "MongoDB is active on port 27017 (existing service)."
else
  log_info "MongoDB not listening on port 27017. Attempting to start local instance..."
  MONGOD_BIN=$(command -v mongod 2>/dev/null || true)
  MONGOD_CONF=""
  
  if [ -f "/opt/homebrew/etc/mongod.conf" ]; then
    MONGOD_CONF="/opt/homebrew/etc/mongod.conf"
  elif [ -f "/usr/local/etc/mongod.conf" ]; then
    MONGOD_CONF="/usr/local/etc/mongod.conf"
  elif [ -f "/etc/mongod.conf" ]; then
    MONGOD_CONF="/etc/mongod.conf"
  fi

  if [ -n "$MONGOD_BIN" ] && [ -n "$MONGOD_CONF" ]; then
    echo "=== Startup: $(date) ===" >> "$LOG_DIR/mongodb.log"
    MONGO_PID=$(spawn_daemon "$SCRIPT_DIR" "$LOG_DIR/mongodb.log" "$MONGOD_BIN" --config "$MONGOD_CONF")
    echo "$MONGO_PID" > "$PID_DIR/mongodb.pid"
    STARTED_SERVICES+=("mongodb")
    
    # Wait for MongoDB to become ready
    READY=0
    for _ in $(seq 1 20); do
      if is_port_in_use 27017; then
        READY=1
        break
      fi
      sleep 0.5
    done

    if [ "$READY" -eq 1 ]; then
      log_success "MongoDB started on port 27017 (PID ${MONGO_PID})."
    else
      log_error "MongoDB failed to listen on port 27017 within 10s."
      tail -n 15 "$LOG_DIR/mongodb.log" 2>/dev/null || true
      exit 1
    fi
  else
    log_error "MongoDB is not running on port 27017, and mongod binary/config could not be located."
    log_info "Please start MongoDB with 'brew services start mongodb-community' or run mongod."
    exit 1
  fi
fi

# ------------------------------------------------------------------------------
# 2. AI Service (Port 8000)
# ------------------------------------------------------------------------------
log_step "Starting AI Service (FastAPI on port 8000)..."

AI_PID=$(is_service_running "ai-service" || true)
if [ -n "$AI_PID" ]; then
  log_info "AI Service is already running (PID ${AI_PID})."
else
  if is_port_in_use 8000; then
    log_warn "Port 8000 is already in use by another process. Checking status..."
    if curl -s -f "http://127.0.0.1:8000/health" >/dev/null 2>&1; then
      log_success "Existing service on port 8000 responded to /health."
    else
      log_error "Port 8000 is occupied by an unresponsive process. Please free port 8000."
      exit 1
    fi
  else
    echo "=== Startup: $(date) ===" >> "$LOG_DIR/ai-service.log"
    AI_PID=$(spawn_daemon "$SCRIPT_DIR/ai-service" "$LOG_DIR/ai-service.log" "$PYTHON_BIN" -m uvicorn app.main:app --host 0.0.0.0 --port 8000)
    echo "$AI_PID" > "$PID_DIR/ai-service.pid"
    STARTED_SERVICES+=("ai-service")
    log_info "AI Service launched (PID ${AI_PID}). Waiting for readiness..."

    # Health poll
    READY=0
    for _ in $(seq 1 30); do
      if ! kill -0 "$AI_PID" 2>/dev/null; then
        log_error "AI Service process exited unexpectedly."
        echo -e "${DIM}"
        tail -n 20 "$LOG_DIR/ai-service.log" 2>/dev/null || true
        echo -e "${RESET}"
        exit 1
      fi
      if curl -s -f "http://127.0.0.1:8000/health" >/dev/null 2>&1; then
        READY=1
        break
      fi
      sleep 0.5
    done

    if [ "$READY" -eq 1 ]; then
      log_success "AI Service is ready on http://127.0.0.1:8000 (PID ${AI_PID})."
    else
      log_error "AI Service health check timed out after 15s."
      echo -e "${DIM}"
      tail -n 20 "$LOG_DIR/ai-service.log" 2>/dev/null || true
      echo -e "${RESET}"
      exit 1
    fi
  fi
fi

# ------------------------------------------------------------------------------
# 3. Backend API Service (Port 3001)
# ------------------------------------------------------------------------------
log_step "Starting Backend API (Node.js / Express on port 3001)..."

BACKEND_PID=$(is_service_running "backend" || true)
if [ -n "$BACKEND_PID" ]; then
  log_info "Backend API is already running (PID ${BACKEND_PID})."
else
  if is_port_in_use 3001; then
    log_warn "Port 3001 is already in use by another process. Checking status..."
    if curl -s -f "http://127.0.0.1:3001/health" >/dev/null 2>&1; then
      log_success "Existing service on port 3001 responded to /health."
    else
      log_error "Port 3001 is occupied by an unresponsive process. Please free port 3001."
      exit 1
    fi
  else
    echo "=== Startup: $(date) ===" >> "$LOG_DIR/backend.log"
    BACKEND_PID=$(spawn_daemon "$SCRIPT_DIR/backend" "$LOG_DIR/backend.log" node server.js)
    echo "$BACKEND_PID" > "$PID_DIR/backend.pid"
    STARTED_SERVICES+=("backend")
    log_info "Backend API launched (PID ${BACKEND_PID}). Waiting for readiness..."

    # Health poll
    READY=0
    for _ in $(seq 1 30); do
      if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        log_error "Backend API process exited unexpectedly."
        echo -e "${DIM}"
        tail -n 20 "$LOG_DIR/backend.log" 2>/dev/null || true
        echo -e "${RESET}"
        exit 1
      fi
      if curl -s -f "http://127.0.0.1:3001/health" >/dev/null 2>&1; then
        READY=1
        break
      fi
      sleep 0.5
    done

    if [ "$READY" -eq 1 ]; then
      log_success "Backend API is ready on http://localhost:3001 (PID ${BACKEND_PID})."
    else
      log_error "Backend API health check timed out after 15s."
      echo -e "${DIM}"
      tail -n 20 "$LOG_DIR/backend.log" 2>/dev/null || true
      echo -e "${RESET}"
      exit 1
    fi
  fi
fi

# ------------------------------------------------------------------------------
# 4. Frontend Web (Port 5180)
# ------------------------------------------------------------------------------
log_step "Starting Frontend Web (Vite Dev Server on port 5180)..."

FRONTEND_PID=$(is_service_running "frontend" || true)
if [ -n "$FRONTEND_PID" ]; then
  log_info "Frontend Web is already running (PID ${FRONTEND_PID})."
else
  if is_port_in_use 5180; then
    log_warn "Port 5180 is already in use by another process. Checking status..."
    if is_port_in_use 5180; then
      log_success "Existing service on port 5180 is listening."
    fi
  else
    echo "=== Startup: $(date) ===" >> "$LOG_DIR/frontend.log"
    VITE_BIN="$SCRIPT_DIR/frontend/node_modules/.bin/vite"
    FRONTEND_PID=$(spawn_daemon "$SCRIPT_DIR/frontend" "$LOG_DIR/frontend.log" "$VITE_BIN" --port 5180 --host 0.0.0.0)
    echo "$FRONTEND_PID" > "$PID_DIR/frontend.pid"
    STARTED_SERVICES+=("frontend")
    log_info "Frontend Web launched (PID ${FRONTEND_PID}). Waiting for readiness..."

    # Readiness poll
    READY=0
    for _ in $(seq 1 30); do
      if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
        log_error "Frontend Web process exited unexpectedly."
        echo -e "${DIM}"
        tail -n 20 "$LOG_DIR/frontend.log" 2>/dev/null || true
        echo -e "${RESET}"
        exit 1
      fi
      if is_port_in_use 5180; then
        READY=1
        break
      fi
      sleep 0.5
    done

    if [ "$READY" -eq 1 ]; then
      log_success "Frontend Web is ready on http://localhost:5180 (PID ${FRONTEND_PID})."
    else
      log_error "Frontend Web failed to bind to port 5180 within 15s."
      echo -e "${DIM}"
      tail -n 20 "$LOG_DIR/frontend.log" 2>/dev/null || true
      echo -e "${RESET}"
      exit 1
    fi
  fi
fi

# Disarm cleanup trap now that all services started successfully
trap - EXIT INT TERM

# ------------------------------------------------------------------------------
# Final Status Dashboard
# ------------------------------------------------------------------------------
AI_CURRENT_PID=$(cat "$PID_DIR/ai-service.pid" 2>/dev/null || echo "Active")
BACKEND_CURRENT_PID=$(cat "$PID_DIR/backend.pid" 2>/dev/null || echo "Active")
FRONTEND_CURRENT_PID=$(cat "$PID_DIR/frontend.pid" 2>/dev/null || echo "Active")

echo ""
echo -e "${BOLD}${GREEN}================================================================${RESET}"
echo -e "${BOLD}${GREEN}   AI INTERVIEW INTEGRITY PLATFORM — ALL SYSTEMS OPERATIONAL   ${RESET}"
echo -e "${BOLD}${GREEN}================================================================${RESET}"
echo ""
echo -e "  ${BOLD}Service${RESET}           ${BOLD}Port${RESET}    ${BOLD}URL / Target${RESET}                  ${BOLD}Status${RESET}"
echo -e "  --------------------------------------------------------------"
printf "  %-17s %-7s %-30s %b\n" "Frontend Web" "5180" "http://localhost:5180" "${GREEN}Running (PID ${FRONTEND_CURRENT_PID})${RESET}"
printf "  %-17s %-7s %-30s %b\n" "Backend API"  "3001" "http://localhost:3001" "${GREEN}Running (PID ${BACKEND_CURRENT_PID})${RESET}"
printf "  %-17s %-7s %-30s %b\n" "AI Service"   "8000" "http://127.0.0.1:8000" "${GREEN}Running (PID ${AI_CURRENT_PID})${RESET}"
printf "  %-17s %-7s %-30s %b\n" "MongoDB"      "27017" "mongodb://127.0.0.1:27017" "${GREEN}Connected${RESET}"
echo -e "  --------------------------------------------------------------"
echo ""
echo -e "  ${BOLD}Logs Directory:${RESET}  ${CYAN}$LOG_DIR${RESET}"
echo -e "  ${BOLD}PIDs Directory:${RESET}  ${CYAN}$PID_DIR${RESET}"
echo ""
echo -e "  ${DIM}To view live logs in real time:${RESET}"
echo -e "    tail -f .logs/frontend.log"
echo -e "    tail -f .logs/backend.log"
echo -e "    tail -f .logs/ai-service.log"
echo ""
echo -e "  ${BOLD}To stop all services cleanly:${RESET}"
echo -e "    ${CYAN}./stop.sh${RESET}"
echo ""
