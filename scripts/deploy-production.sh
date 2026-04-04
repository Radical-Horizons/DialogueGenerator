#!/bin/bash

###############################################################################
# DialogueGenerator Production Deployment Script
# This script automates the deployment of DialogueGenerator on a Linux server
# Usage: bash deploy-production.sh
###############################################################################

set -e  # Exit on error
set -u  # Exit on undefined variable

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="/opt/DialogueGeneratorV2"
APP_USER="ubuntu"
APP_GROUP="ubuntu"
API_PORT=4242
NGINX_SITE_NAME="dialogue-generator"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 is not installed"
        return 1
    fi
    return 0
}

check_root() {
    if [ "$EUID" -eq 0 ]; then
        log_error "Please do not run this script as root. Run as $APP_USER"
        exit 1
    fi
}

###############################################################################
# Step 1: Pre-flight checks
###############################################################################
log_info "Step 1: Running pre-flight checks..."

check_root

if [ ! -d "$PROJECT_DIR" ]; then
    log_error "Project directory $PROJECT_DIR does not exist"
    exit 1
fi

cd "$PROJECT_DIR"

log_info "Checking required commands..."
check_command python3 || exit 1
check_command pip3 || exit 1
check_command nginx || log_warning "nginx not found, will install"
check_command git || log_warning "git not found, will install"

log_success "Pre-flight checks passed"

###############################################################################
# Step 2: Install system dependencies
###############################################################################
log_info "Step 2: Installing system dependencies..."

sudo apt update -qq
sudo apt install -y python3 python3-pip python3-venv nginx git curl build-essential

log_success "System dependencies installed"

###############################################################################
# Step 3: Setup Python virtual environment
###############################################################################
log_info "Step 3: Setting up Python virtual environment..."

if [ ! -d ".venv" ]; then
    log_info "Creating virtual environment..."
    python3 -m venv .venv
fi

source .venv/bin/activate

log_info "Upgrading pip..."
pip install --upgrade pip --quiet

log_info "Installing Python dependencies..."
pip install -r requirements.txt --quiet
pip install gunicorn --quiet

log_success "Python environment configured"

###############################################################################
# Step 4: Build frontend (if needed)
###############################################################################
log_info "Step 4: Checking frontend build..."

if [ ! -d "frontend/dist" ] || [ -z "$(ls -A frontend/dist 2>/dev/null)" ]; then
    log_warning "frontend/dist/ is missing or empty"
    
    if command -v node &> /dev/null && command -v npm &> /dev/null; then
        log_info "Building frontend..."
        cd frontend
        npm install --silent
        npm run build
        cd ..
        log_success "Frontend built successfully"
    else
        log_warning "Node.js not installed. Installing Node.js..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt install -y nodejs
        
        log_info "Building frontend..."
        cd frontend
        npm install --silent
        npm run build
        cd ..
        log_success "Frontend built successfully"
    fi
else
    log_success "Frontend build already exists"
fi

###############################################################################
# Step 5: Configure environment variables
###############################################################################
log_info "Step 5: Configuring environment variables..."

if [ ! -f ".env" ]; then
    log_info "Creating .env from .env.example..."
    cp .env.example .env
    
    # Generate JWT secret
    JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
    
    log_info "Configuring .env file..."
    log_warning "You need to manually edit .env and set:"
    log_warning "  - ENVIRONMENT=production"
    log_warning "  - JWT_SECRET_KEY=$JWT_SECRET"
    log_warning "  - OPENAI_API_KEY=<your-openai-key>"
    log_warning "  - CORS_ORIGINS=http://$(hostname -I | awk '{print $1}')"
    
    # Set basic values
    sed -i "s/ENVIRONMENT=.*/ENVIRONMENT=production/" .env
    sed -i "s|JWT_SECRET_KEY=.*|JWT_SECRET_KEY=$JWT_SECRET|" .env
    sed -i "s|CORS_ORIGINS=.*|CORS_ORIGINS=http://$(hostname -I | awk '{print $1}')|" .env
    
    log_success ".env file created (please edit OPENAI_API_KEY manually)"
else
    log_success ".env file already exists"
fi

###############################################################################
# Step 6: Create GDD directories
###############################################################################
log_info "Step 6: Creating GDD directories..."

mkdir -p data/GDD_categories
# Vision.json sera dans data/ avec les autres fichiers GDD

log_success "GDD directories created"

###############################################################################
# Step 7: Configure Gunicorn
###############################################################################
log_info "Step 7: Configuring Gunicorn..."

cat > gunicorn.conf.py << 'EOF'
import multiprocessing

# Single worker: generation jobs + SSE live in process memory; multiple workers
# cause POST /generate/jobs on worker A and EventSource on worker B → 404 stream.
workers = 1

# Worker class
worker_class = "uvicorn.workers.UvicornWorker"

# Bind address (localhost only, Nginx will proxy)
bind = "127.0.0.1:4242"

# Timeout for long requests (LLM generation)
timeout = 300

# Max requests before worker restart (prevents memory leaks)
max_requests = 1000
max_requests_jitter = 50

# Logging
accesslog = "-"  # stdout
errorlog = "-"   # stderr
loglevel = "info"

# Process name
proc_name = "dialogue-generator-api"

# Working directory
chdir = "/opt/DialogueGeneratorV2"

# Preload app (improves performance)
preload_app = True
EOF

log_success "Gunicorn configuration created"

###############################################################################
# Step 8: Configure systemd service
###############################################################################
log_info "Step 8: Configuring systemd service..."

sudo tee /etc/systemd/system/${NGINX_SITE_NAME}.service > /dev/null << EOF
[Unit]
Description=DialogueGenerator API
After=network.target

[Service]
Type=notify
User=${APP_USER}
Group=${APP_GROUP}
WorkingDirectory=${PROJECT_DIR}
Environment="PATH=${PROJECT_DIR}/.venv/bin"
EnvironmentFile=${PROJECT_DIR}/.env
ExecStart=${PROJECT_DIR}/.venv/bin/gunicorn -c gunicorn.conf.py api.main:app
Restart=always
RestartSec=10

# Security
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable ${NGINX_SITE_NAME}

log_success "Systemd service configured"

###############################################################################
# Step 9: Configure Nginx
###############################################################################
log_info "Step 9: Configuring Nginx..."

SERVER_IP=$(hostname -I | awk '{print $1}')

sudo tee /etc/nginx/sites-available/${NGINX_SITE_NAME} > /dev/null << EOF
server {
    listen 80;
    server_name ${SERVER_IP};

    # Max upload size
    client_max_body_size 10M;
    
    # Timeout for long requests (dialogue generation)
    proxy_read_timeout 300s;
    proxy_connect_timeout 60s;
    proxy_send_timeout 300s;

    # Frontend static files
    location / {
        root ${PROJECT_DIR}/frontend/dist;
        try_files \$uri \$uri/ /index.html;
        
        # Cache headers for static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)\$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # API backend
    location /api {
        proxy_pass http://127.0.0.1:${API_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:${API_PORT}/health;
        access_log off;
    }

    # Logs
    access_log /var/log/nginx/${NGINX_SITE_NAME}-access.log;
    error_log /var/log/nginx/${NGINX_SITE_NAME}-error.log;
}
EOF

# Enable site
sudo ln -sf /etc/nginx/sites-available/${NGINX_SITE_NAME} /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
if sudo nginx -t; then
    sudo systemctl reload nginx
    log_success "Nginx configured and reloaded"
else
    log_error "Nginx configuration test failed"
    exit 1
fi

###############################################################################
# Step 10: Configure firewall
###############################################################################
log_info "Step 10: Configuring firewall..."

sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw --force enable

log_success "Firewall configured"

###############################################################################
# Step 11: Start services
###############################################################################
log_info "Step 11: Starting services..."

sudo systemctl start ${NGINX_SITE_NAME}

if sudo systemctl is-active --quiet ${NGINX_SITE_NAME}; then
    log_success "Service started successfully"
else
    log_error "Service failed to start. Check logs with: sudo journalctl -u ${NGINX_SITE_NAME} -n 50"
    exit 1
fi

###############################################################################
# Step 12: Verification
###############################################################################
log_info "Step 12: Verifying deployment..."

sleep 2

# Check API health
if curl -s http://localhost:${API_PORT}/api/v1/health > /dev/null; then
    log_success "API health check passed"
else
    log_warning "API health check failed (may need a moment to start)"
fi

# Check Nginx
if curl -s http://localhost/ > /dev/null; then
    log_success "Nginx serving frontend"
else
    log_warning "Nginx frontend check failed"
fi

# Display service status
log_info "Service status:"
sudo systemctl status ${NGINX_SITE_NAME} --no-pager -l | head -10

###############################################################################
# Summary
###############################################################################
echo ""
log_success "=========================================="
log_success "Deployment completed!"
log_success "=========================================="
echo ""
log_info "Next steps:"
log_info "1. Edit .env and set OPENAI_API_KEY:"
log_info "   nano ${PROJECT_DIR}/.env"
echo ""
log_info "2. Upload GDD files to:"
log_info "   - ${PROJECT_DIR}/data/GDD_categories/ (JSON files)"
log_info "   - ${PROJECT_DIR}/data/Vision.json"
echo ""
log_info "3. Access your application at:"
log_info "   http://${SERVER_IP}"
echo ""
log_info "4. Useful commands:"
log_info "   - View logs: sudo journalctl -u ${NGINX_SITE_NAME} -f"
log_info "   - Restart service: sudo systemctl restart ${NGINX_SITE_NAME}"
log_info "   - Check status: sudo systemctl status ${NGINX_SITE_NAME}"
echo ""
