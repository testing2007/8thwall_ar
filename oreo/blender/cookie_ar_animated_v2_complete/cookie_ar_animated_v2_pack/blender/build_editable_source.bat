@echo off
setlocal

set "BLENDER_EXE=D:\Program Files\Blender Foundation\Blender 5.1\blender-launcher.exe"
if not exist "%BLENDER_EXE%" (
  echo Blender was not found at:
  echo %BLENDER_EXE%
  echo Edit BLENDER_EXE in this file to match your installation.
  pause
  exit /b 1
)

"%BLENDER_EXE%" --background --factory-startup --python "%~dp0prepare_editable_source.py" -- --glb "%~dp0..\cookie_ar_animated_v2.glb" --output "%~dp0..\cookie_ar_animated_v2_editable.blend" --force-clear
if errorlevel 1 (
  echo Failed to create the editable Blender source.
  pause
  exit /b 1
)

echo Created cookie_ar_animated_v2_editable.blend
pause
endlocal
