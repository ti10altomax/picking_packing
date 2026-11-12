# Gera dist\SeparaAgente.exe (um arquivo só). Rode no Windows, nesta pasta:
#   powershell -ExecutionPolicy Bypass -File build.ps1
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Test-Path .venv)) {
    Write-Host '>> criando .venv'
    python -m venv .venv
}
Write-Host '>> dependências'
.\.venv\Scripts\python.exe -m pip install --quiet --disable-pip-version-check -r requirements.txt

Write-Host '>> PyInstaller'
.\.venv\Scripts\pyinstaller.exe --noconfirm --clean --onefile --console `
    --name SeparaAgente `
    --hidden-import win32timezone `
    separa_agente.py

Copy-Item agente.ini.exemplo dist\agente.ini.exemplo -Force
$v = (Select-String -Path separa_agente.py -Pattern "^VERSAO = '(.+)'").Matches[0].Groups[1].Value
Write-Host ">> pronto: dist\SeparaAgente.exe (versão $v)"
