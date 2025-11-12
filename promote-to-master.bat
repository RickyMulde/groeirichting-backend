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

echo [1/5] Switchen naar master branch...
git checkout master
if %errorlevel% neq 0 (
    echo ERROR: Kon niet switchen naar master branch
    pause
    exit /b 1
)

echo.
echo [2/5] Mergen van dev in master...
git merge dev
if %errorlevel% neq 0 (
    echo ERROR: Merge gefaald. Los merge conflicten op en probeer opnieuw.
    pause
    exit /b 1
)

echo.
echo [3/5] Pushen naar origin/master...
git push origin master
if %errorlevel% neq 0 (
    echo ERROR: Push gefaald
    pause
    exit /b 1
)

echo.
echo [4/5] Terugswitchen naar dev branch...
git checkout dev
if %errorlevel% neq 0 (
    echo ERROR: Kon niet terugswitchen naar dev branch
    pause
    exit /b 1
)

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
