@echo off
setlocal

set REPO=https://github.com/rowanchanner/rowanchanner.github.io.git

echo [sharky] Pushing to %REPO%...

:: .gitignore — keep junk out
(
echo *.pyc
echo __pycache__/
echo .DS_Store
echo Thumbs.db
) > .gitignore

:: Init repo if first time
if not exist ".git" (
    echo [sharky] Initialising git repo...
    git init -b main
)

:: Set remote
git remote get-url origin >nul 2>&1
if %errorlevel%==0 (
    git remote set-url origin %REPO%
) else (
    git remote add origin %REPO%
)

:: Stage everything in the folder
git add .

:: Commit only if there are changes
git diff --cached --quiet
if %errorlevel%==0 (
    echo [sharky] Nothing new to commit.
) else (
    git commit -m "Update Sharky Movies 2 site"
)

:: Push (force so a fresh local repo can overwrite the remote)
git push -u origin main --force

if %errorlevel%==0 (
    echo.
    echo [sharky] Done! Site will be live at https://rowanchanner.github.io shortly.
) else (
    echo.
    echo [sharky] Push failed. If this is your first push, authenticate with:
    echo         git config --global credential.helper manager
    echo         then re-run this bat.
)

pause
