@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "PACKAGE_DIR=%SCRIPT_DIR%.."
set "IMAGES_DIR=%PACKAGE_DIR%\images"
set "COMPOSE_FILE=%PACKAGE_DIR%\docker-compose.yml"

if not exist "%IMAGES_DIR%\boppps-app-offline.tar" (
  echo Missing image file: %IMAGES_DIR%\boppps-app-offline.tar
  goto :error
)

if not exist "%IMAGES_DIR%\boppps-mysql-8.0-offline.tar" (
  echo Missing image file: %IMAGES_DIR%\boppps-mysql-8.0-offline.tar
  goto :error
)

docker version >nul 2>nul
if errorlevel 1 (
  echo Docker was not found, or Docker Desktop is not running.
  echo Please install and start Docker Desktop, then run this script again.
  goto :error
)

if not exist "%PACKAGE_DIR%\config" mkdir "%PACKAGE_DIR%\config"
if not exist "%PACKAGE_DIR%\static" mkdir "%PACKAGE_DIR%\static"
if not exist "%PACKAGE_DIR%\static\uploads" mkdir "%PACKAGE_DIR%\static\uploads"
if not exist "%PACKAGE_DIR%\static\uploads\resources" mkdir "%PACKAGE_DIR%\static\uploads\resources"

if not exist "%PACKAGE_DIR%\.env" (
  if exist "%PACKAGE_DIR%\.env.example" (
    copy "%PACKAGE_DIR%\.env.example" "%PACKAGE_DIR%\.env" >nul
  )
)

echo [1/3] Loading application image
docker load -i "%IMAGES_DIR%\boppps-app-offline.tar"
if errorlevel 1 goto :error

echo [2/3] Loading database image
docker load -i "%IMAGES_DIR%\boppps-mysql-8.0-offline.tar"
if errorlevel 1 goto :error

echo [3/3] Starting containers
docker compose -f "%COMPOSE_FILE%" up -d
if errorlevel 1 goto :error

echo.
echo Deployment finished.
echo Open: http://localhost:5000
echo Default users:
echo   admin / 123
echo   teacher / 123
echo   student / 123
echo.
pause
exit /b 0

:error
echo.
echo Startup failed. Check the messages above.
echo Common causes:
echo 1. Docker Desktop is not installed or not running
echo 2. The zip file was not fully extracted
echo 3. Port 5000 or 3307 is already in use
echo.
pause
exit /b 1
