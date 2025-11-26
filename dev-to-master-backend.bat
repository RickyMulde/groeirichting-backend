@echo off
echo ========================================
echo Promoten van dev naar master (Backend)
echo ========================================
echo.

echo [0/5] Controleren of je op dev branch zit...
for /f "delims=" %%i in ('git branch --show-current') do set CURRENT_BRANCH=%%i
if not "%CURRENT_BRANCH%"=="dev" (
    echo ERROR: Je moet op de dev branch zitten om dit script uit te voeren!
    echo Huidige branch: %CURRENT_BRANCH%
    pause
    exit /b 1
)
echo OK: Je zit op dev branch

echo.
echo [1/5] Switchen naar master branch...
git checkout master >nul 2>&1
if errorlevel 1 goto :error_checkout_master
echo OK: Geswitched naar master branch

echo.
echo [2/5] Mergen van dev in master...
git merge dev >nul 2>&1
if errorlevel 1 goto :error_merge

echo.
echo [3/5] Pushen naar origin/master...
git push origin master >nul 2>&1
if errorlevel 1 goto :error_push

echo.
echo [4/5] Terugswitchen naar dev branch...
git checkout dev >nul 2>&1
if errorlevel 1 goto :error_checkout_dev

echo.
echo [5/5] Controleren dat je weer op dev zit...
for /f "delims=" %%i in ('git branch --show-current') do set CURRENT_BRANCH=%%i
if not "%CURRENT_BRANCH%"=="dev" (
    echo WAARSCHUWING: Je bent niet terug op dev branch!
    echo Huidige branch: %CURRENT_BRANCH%
) else (
    echo OK: Je bent weer op dev branch
)

echo.
echo ========================================
echo SUCCES! Code is gepromoveerd naar master
echo Je bent nu weer op dev branch
echo ========================================
pause
exit /b 0

:error_checkout_master
echo ERROR: Kon niet switchen naar master branch
pause
exit /b 1

:error_merge
echo ERROR: Merge gefaald. Los merge conflicten op en probeer opnieuw.
echo.
echo Merge afbreken...
git merge --abort >nul 2>&1
echo Terugswitchen naar dev branch...
git checkout dev >nul 2>&1
if errorlevel 1 (
    echo WAARSCHUWING: Kon niet terugswitchen naar dev. Je zit nu op master branch.
    echo Probeer handmatig: git merge --abort als merge nog actief is
    echo Daarna: git checkout dev
    echo.
    echo Huidige status:
    git status --short
) else (
    echo OK: Merge afgebroken, terug op dev branch
)
pause
exit /b 1

:error_push
echo ERROR: Push gefaald
pause
exit /b 1

:error_checkout_dev
echo ERROR: Kon niet terugswitchen naar dev branch
pause
exit /b 1
