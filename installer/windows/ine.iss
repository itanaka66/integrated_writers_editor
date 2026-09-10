; Integrated writers Editor (INE) — Inno Setup script
;
; Produces a single .exe installer. Unlike a typical PyInstaller-based app,
; INE itself runs as Docker containers (Postgres + Qdrant + Ollama-facing
; API + web) — this installer just places docker-compose.release.yml (which
; pulls prebuilt images from GHCR, so nothing is built on the user's
; machine) plus launch/stop scripts, and wires up shortcuts. Docker Desktop
; is a separate prerequisite; launch.ps1 checks for it and links to the
; installer if it's missing.
;
; Build: installer\windows\build.ps1 (wraps `iscc ine.iss`)
; Requires: Inno Setup 6 (https://jrsoftware.org/isinfo.php)

#define AppName "Integrated writers Editor (INE)"
#define AppVersion "0.6.0"
#define AppPublisher "INE"

[Setup]
AppId={{5B6E9C2A-1F84-4A7D-9E3B-6C2D0A8F1B77}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\INE
DefaultGroupName=INE
OutputDir=..\..\dist
OutputBaseFilename=INE-Setup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern

; No administrator rights required — Docker Desktop itself needs admin to
; install, but INE's own files are just a compose file and two scripts.
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
UninstallDisplayIcon={app}\launch.ps1

[Languages]
Name: "japanese"; MessagesFile: "compiler:Languages\Japanese.isl"
Name: "english";  MessagesFile: "compiler:Default.isl"

[CustomMessages]
japanese.LaunchSetup=今すぐ起動する
english.LaunchSetup=Launch now
japanese.CreateDesktopIcon=デスクトップにショートカットを作成する
english.CreateDesktopIcon=Create a desktop shortcut

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\..\docker-compose.release.yml"; DestDir: "{app}"; DestName: "docker-compose.yml"; Flags: ignoreversion
Source: "..\..\.env.example"; DestDir: "{app}"; Flags: ignoreversion
Source: "launch.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "stop.ps1";   DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\README.md"; DestDir: "{app}"; Flags: ignoreversion isreadme

[Icons]
Name: "{group}\INEを起動"; Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\launch.ps1"""; WorkingDir: "{app}"
Name: "{group}\INEを停止"; Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\stop.ps1"""; WorkingDir: "{app}"
Name: "{autodesktop}\INE"; Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\launch.ps1"""; \
    Tasks: desktopicon; WorkingDir: "{app}"

[Run]
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\launch.ps1"""; \
    Description: "{cm:LaunchSetup}"; Flags: postinstall skipifsilent nowait

[UninstallDelete]
; .env holds the generated admin password and any connection overrides the
; user set up — kept on uninstall so a reinstall doesn't force re-entry.
; The compose-managed volumes (Postgres/Qdrant/episode data) live in Docker,
; not here, so they aren't touched by this installer either way.
Type: files; Name: "{app}\docker-compose.yml"
