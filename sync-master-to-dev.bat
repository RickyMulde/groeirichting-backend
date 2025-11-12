@echo off
echo ========================================
echo Synchroniseren van master naar dev (Backend)
echo ========================================
echo.

echo [1/3] Switchen naar dev branch...
git checkout dev
if %errorlevel% neq 0 (
    echo ERROR: Kon niet switchen naar dev branch
    pause
    exit /b 1
)

echo.
echo [2/3] Mergen van master in dev...
echo (Git probeert automatisch beide wijzigingen te behouden)
git merge master
if %errorlevel% neq 0 (
    echo.
    echo ========================================
    echo WAARSCHUWING: Er zijn merge conflicten!
    echo ========================================
    echo.
    echo Los de conflicten handmatig op:
    echo 1. Open de bestanden met conflicten
    echo 2. Los de conflicten op (zoek naar ^^^^ markers)
    echo 3. Voer uit: git add .
    echo 4. Voer uit: git commit
    echo 5. Voer dit script opnieuw uit of push handmatig
    echo.
    pause
    exit /b 1
)
echo Merge succesvol!

echo.
echo [3/3] Pushen naar origin/dev...
git push origin dev
if %errorlevel% neq 0 (
    echo ERROR: Push gefaald
    pause
    exit /b 1
)

echo.
echo ========================================
echo SUCCES! Master is gesynchroniseerd naar dev
echo Beide wijzigingen zijn behouden waar mogelijk
echo Je bent nog steeds op dev branch
echo ========================================
pause

