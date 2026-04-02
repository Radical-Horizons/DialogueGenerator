# Deployment Guide

## Overview
This guide covers deployment of DialogueGenerator to production environments.

## Where this project runs in production (source of truth)

**This repo’s production deployment is an OVH VPS (Ubuntu), not shared Windows hosting.**

| Item | Value |
|------|--------|
| Provider | **OVH** — VPS Linux |
| Public demo (DNS) | **`https://demo.auto-diffusion.net`** → `137.74.115.203` |
| SSH | `ssh ubuntu@137.74.115.203` |
| App path on server | `/opt/DialogueGeneratorV2` |
| Deploy from dev machine | `npm run deploy` → `scripts/deploy-production.ps1` (SCP/SSH; defaults match this host) |

**Canonical technical doc (French):** [`docs/deployment/PRODUCTION.md`](../deployment/PRODUCTION.md) — Nginx, systemd, env vars, troubleshooting.

Mentions of **SmarterASP** or generic **FTP** in older sections below are **optional patterns** for other hosts; if you deploy elsewhere, adapt paths and web server config accordingly.

## Prerequisites

1. **For this project’s OVH setup:** Ubuntu VPS with Python 3.10+, Nginx (see `PRODUCTION.md`). **For other hosts:** a platform with Python support (e.g. SmarterASP.net, another VPS) and adapted configuration.
2. FTP/SFTP access or control panel access
3. Python 3.10+ installed on server
4. Node.js and npm installed (for frontend build)
5. Access to GDD (Game Design Document) files

## Pre-Deployment Checklist

- [ ] Copied `.env.example` to `.env` and configured all variables
- [ ] Generated strong JWT secret key (see Security section)
- [ ] Prepared GDD files (see GDD Setup section)
- [ ] Built frontend for production (see Build section)
- [ ] All Python files ready for upload
- [ ] Web server configuration prepared

## Build for Production

### Frontend Build

```bash
npm run deploy:build
```

This command:
1. Builds frontend with production optimizations
2. Validates build output
3. Prepares static assets for deployment

### Verify Build

```bash
npm run deploy:check
```

Checks:
- Build output exists
- Required files present
- Configuration valid

## GDD Files Setup

### Option A: In Application Directory (Recommended)

```
/server/app/
  ├── DialogueGenerator/
  │   ├── api/
  │   ├── services/
  │   ├── frontend/
  │   │   └── dist/          # Built frontend files
  │   └── data/
  │       └── GDD_categories/ # Copy JSON files here
  │           ├── personnages.json
  │           ├── lieux.json
  │           └── ...
  └── import/
      └── Bible_Narrative/
          └── Vision.json
```

### Option B: Separate Directory (If Sharing)

```
/server/data/
  └── gdd/
      ├── categories/
      │   ├── personnages.json
      │   └── ...
      └── import/
          └── Bible_Narrative/
              └── Vision.json
```

**Environment variables required:**
```bash
GDD_CATEGORIES_PATH=/server/data/gdd/categories
GDD_IMPORT_PATH=/server/data/gdd/import/Bible_Narrative
```

## Environment Configuration

### Required Variables

```bash
ENVIRONMENT=production
OPENAI_API_KEY=your_production_key
JWT_SECRET_KEY=your_strong_secret_key  # MUST change from default!
CORS_ORIGINS=https://yourdomain.com
```

### Security Variables

- **JWT_SECRET_KEY**: Generate strong random key (minimum 32 characters)
- **OPENAI_API_KEY**: Production OpenAI API key
- **CORS_ORIGINS**: Comma-separated list of allowed origins

See `docs/SECURITY.md` for security best practices.

## Deployment Platforms

### Windows Server (IIS)

1. **Upload files** to server directory
2. **Configure web.config** (see `docs/deployment/web.config.example`)
3. **Set up Python** via FastCGI or HTTP Platform Handler
4. **Configure IIS** to serve static files from `frontend/dist/`
5. **Set environment variables** in IIS application settings

### Linux Server (Nginx + Gunicorn)

1. **Upload files** to server
2. **Install dependencies**: `pip install -r requirements.txt`
3. **Configure Gunicorn** (see `docs/deployment/gunicorn.conf.example`)
4. **Configure Nginx** (see `docs/deployment/nginx.conf.example`)
5. **Set up systemd service** for Gunicorn
6. **Configure environment variables** in systemd service file

### Cloud Platforms

Follow platform-specific guides:
- **Heroku**: Use Procfile and buildpacks
- **AWS**: Use Elastic Beanstalk or ECS
- **Azure**: Use App Service with Python runtime
- **Google Cloud**: Use App Engine or Cloud Run

## Post-Deployment Verification

### Health Checks

1. **API Health**: `GET /api/v1/health` (if available)
2. **Frontend**: Access web interface
3. **Authentication**: Test login flow
4. **API Endpoints**: Test key endpoints

### Verification Script

```bash
npm run deploy:check
```

### Manual Verification

1. **Frontend loads**: Check `https://yourdomain.com`
2. **API responds**: Check `https://yourdomain.com/api/v1/`
3. **Authentication works**: Test login
4. **GDD data loads**: Check context endpoints
5. **Dialogue generation**: Test generation endpoint

## Monitoring

### Logs

- **Application logs**: Check `data/logs/` directory
- **Server logs**: Check platform-specific log locations
- **Error tracking**: Sentry (if configured)

### Metrics

- **Prometheus**: Metrics endpoint (if configured)
- **Health checks**: Monitor `/api/v1/health`

## Troubleshooting

### Common Issues

**Frontend not loading:**
- Check static file serving configuration
- Verify `frontend/dist/` files uploaded
- Check base URL configuration

**API errors:**
- Check Python environment
- Verify environment variables
- Check GDD file paths
- Review application logs

**Authentication issues:**
- Verify JWT_SECRET_KEY is set
- Check CORS configuration
- Verify cookie settings

**GDD data not loading:**
- Check file paths
- Verify symbolic links (if used)
- Check file permissions
- Review context builder logs

## Rollback Procedure

1. **Stop application**
2. **Restore previous version** from backup
3. **Restore previous `.env`** configuration
4. **Restart application**
5. **Verify functionality**

## Maintenance

### Regular Tasks

- **Update dependencies**: Review and update `requirements.txt` and `package.json`
- **Monitor logs**: Check for errors regularly
- **Backup data**: Backup GDD files and configuration
- **Security updates**: Keep dependencies updated

### Updates

1. **Pull latest code**
2. **Update dependencies**: `pip install -r requirements.txt && cd frontend && npm install`
3. **Rebuild frontend**: `npm run deploy:build`
4. **Test locally**: Verify changes work
5. **Deploy**: Upload updated files
6. **Verify**: Run post-deployment checks

## Additional Resources

- **Security Guide**: `docs/SECURITY.md`
- **API Documentation**: `README_API.md`
- **Configuration Examples**: `docs/deployment/`
